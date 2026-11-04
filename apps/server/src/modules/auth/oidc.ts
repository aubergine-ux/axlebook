import * as client from 'openid-client';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { User } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';

type OidcConfig = NonNullable<Config['auth']['oidc']>;

/** Pending logins keyed by `state` (single process, 10-minute lifetime). */
const pending = new Map<string, { verifier: string; nonce: string; expires: number }>();
let discovered: Promise<client.Configuration> | null = null;

function discover(oidc: OidcConfig) {
  discovered ??= client
    .discovery(new URL(oidc.issuer), oidc.clientId, oidc.clientSecret)
    .catch((err) => {
      discovered = null; // retry on the next attempt
      throw err;
    });
  return discovered;
}

export function callbackUrl(config: Config): string {
  if (!config.baseUrl) throw new Error('BASE_URL is required for OIDC');
  return new URL('/api/v1/auth/oidc/callback', config.baseUrl).toString();
}

export async function startLogin(config: Config): Promise<string> {
  const oidc = config.auth.oidc;
  if (!oidc) throw new AppError('not_found');
  const cfg = await discover(oidc);
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  pending.set(state, { verifier, nonce, expires: now + 10 * 60_000 });
  return client
    .buildAuthorizationUrl(cfg, {
      redirect_uri: callbackUrl(config),
      scope: oidc.scopes,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    })
    .toString();
}

/** Exchange the code, then find or create the matching user. */
export async function finishLogin(db: DB, config: Config, currentUrl: URL): Promise<User> {
  const oidc = config.auth.oidc;
  if (!oidc) throw new AppError('not_found');
  const state = currentUrl.searchParams.get('state') ?? '';
  const entry = pending.get(state);
  pending.delete(state);
  if (!entry || entry.expires < Date.now()) throw new AppError('oidc_failed', { reason: 'state' });

  const cfg = await discover(oidc);
  const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
    pkceCodeVerifier: entry.verifier,
    expectedState: state,
    expectedNonce: entry.nonce,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new AppError('oidc_failed', { reason: 'claims' });
  const issuer = String(claims.iss);
  const groups = Array.isArray(claims.groups) ? claims.groups.map(String) : [];
  const isAdmin = oidc.adminGroup ? groups.includes(oidc.adminGroup) : false;
  const ts = nowIso();

  const linked = await db
    .selectFrom('users')
    .selectAll()
    .where('oidc_issuer', '=', issuer)
    .where('oidc_subject', '=', claims.sub)
    .executeTakeFirst();
  if (linked) {
    if (linked.disabled) throw new AppError('forbidden');
    if (isAdmin && linked.role !== 'admin') {
      return db
        .updateTable('users')
        .set({ role: 'admin', updated_at: ts })
        .where('id', '=', linked.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return linked;
  }

  if (!oidc.autoCreate) throw new AppError('oidc_failed', { reason: 'no_account' });
  const preferred = String(claims.preferred_username ?? claims.email ?? `user-${claims.sub}`)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .slice(0, 40);
  let username = preferred || `user-${claims.sub.slice(0, 8)}`;
  for (
    let i = 2;
    await db.selectFrom('users').select('id').where('username', '=', username).executeTakeFirst();
    i++
  ) {
    username = `${preferred.slice(0, 36)}-${i}`;
  }
  return db
    .insertInto('users')
    .values({
      username,
      email: typeof claims.email === 'string' ? claims.email : null,
      display_name: typeof claims.name === 'string' ? claims.name : null,
      role: isAdmin ? 'admin' : oidc.defaultRole,
      oidc_issuer: issuer,
      oidc_subject: claims.sub,
      theme: 'system',
      disabled: 0,
      created_at: ts,
      updated_at: ts,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
