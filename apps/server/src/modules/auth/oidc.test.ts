import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/helpers';

/** A minimal OpenID provider: discovery, keys, and a token endpoint that signs ES256 id_tokens. */
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256', use: 'sig' };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const codes = new Map<string, Record<string, unknown>>();
let issuer = '';

function idToken(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'ES256', kid: 'k1', typ: 'JWT' })}.${b64({ iss: issuer, aud: 'axlebook', iat: now, exp: now + 300, ...claims })}`;
  const sig = createSign('SHA256')
    .update(body)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${body}.${sig.toString('base64url')}`;
}

const provider = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', issuer);
  const send = (o: unknown) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(o));
  };
  if (url.pathname === '/.well-known/openid-configuration')
    return send({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['ES256'],
      code_challenge_methods_supported: ['S256'],
    });
  if (url.pathname === '/jwks') return send({ keys: [jwk] });
  if (url.pathname === '/token') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      const claims = codes.get(new URLSearchParams(raw).get('code') ?? '');
      if (!claims) {
        res.statusCode = 400;
        return send({ error: 'invalid_grant' });
      }
      send({
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken(claims),
      });
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});

let t: TestApp;
beforeAll(async () => {
  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  issuer = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  t = await createTestApp({
    BASE_URL: 'http://localhost',
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: 'axlebook',
    OIDC_CLIENT_SECRET: 'shh',
    OIDC_ADMIN_GROUP: 'garage-admins',
    DISABLE_LOCAL_LOGIN: 'true',
  });
});
afterAll(async () => {
  await t.close();
  provider.close();
});

/** Start a sign-in, let the "provider" approve it with these claims, and follow the callback. */
async function signIn(claims: Record<string, unknown>) {
  const start = await t.anon({ method: 'GET', url: '/api/v1/auth/oidc/start' });
  expect(start.statusCode).toBe(302);
  const auth = new URL(start.headers.location as string);
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
  const code = randomUUID();
  codes.set(code, { nonce: auth.searchParams.get('nonce'), ...claims });
  const state = auth.searchParams.get('state') ?? '';
  const cb = await t.anon({
    method: 'GET',
    url: `/api/v1/auth/oidc/callback?code=${code}&state=${state}&iss=${encodeURIComponent(issuer)}`,
  });
  return { cb, state, code };
}

describe('single sign-on (OIDC)', () => {
  it('creates the account on first sign-in, makes admin-group members admins, and signs in', async () => {
    const { cb } = await signIn({
      sub: 'u-1',
      preferred_username: 'Pat',
      email: 'pat@example.com',
      groups: ['garage-admins'],
    });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('/');
    const cookie = String(cb.headers['set-cookie']).split(';')[0] as string;
    const me = (await t.anon({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).json();
    expect(me).toMatchObject({ username: 'pat', email: 'pat@example.com', role: 'admin' });
  });

  it('signs a returning person into the same account, and others in as the default role', async () => {
    await signIn({ sub: 'u-1', preferred_username: 'renamed' });
    const { cb } = await signIn({ sub: 'u-2', preferred_username: 'sam' });
    const cookie = String(cb.headers['set-cookie']).split(';')[0] as string;
    expect(
      (await t.anon({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).json(),
    ).toMatchObject({ username: 'sam', role: 'editor' });
    const names = (await t.db.selectFrom('users').select('username').execute()).map(
      (u) => u.username,
    );
    expect(names.sort()).toEqual(['admin', 'pat', 'sam']);
  });

  it('refuses a replayed or forged state, and a token with the wrong nonce', async () => {
    const { state, code } = await signIn({ sub: 'u-3' });
    codes.set(code, { sub: 'u-3', nonce: 'x' });
    const replay = await t.anon({
      method: 'GET',
      url: `/api/v1/auth/oidc/callback?code=${code}&state=${state}`,
    });
    expect(replay.headers.location).toBe('/login?error=oidc_failed');
    expect(replay.headers['set-cookie']).toBeUndefined();

    const start = await t.anon({ method: 'GET', url: '/api/v1/auth/oidc/start' });
    const s2 = new URL(start.headers.location as string).searchParams.get('state');
    const forged = randomUUID();
    codes.set(forged, { sub: 'u-4', nonce: 'not-the-one-sent' });
    const bad = await t.anon({
      method: 'GET',
      url: `/api/v1/auth/oidc/callback?code=${forged}&state=${s2}&iss=${encodeURIComponent(issuer)}`,
    });
    expect(bad.headers.location).toBe('/login?error=oidc_failed');
  });

  it('turns off password sign-in when DISABLE_LOCAL_LOGIN is set', async () => {
    const res = await t.anon({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'correct-horse-battery' },
    });
    expect(res.json().error.code).toBe('local_login_disabled');
    expect((await t.anon({ method: 'GET', url: '/api/v1/auth/status' })).json()).toMatchObject({
      localLogin: false,
    });
  });
});
