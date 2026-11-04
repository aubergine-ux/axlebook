import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config';
import type { DB } from '../db/connection';
import type { User } from '../db/schema';
import { randomToken, sha256 } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { nowIso } from '../lib/time';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    sessionId: number | null;
  }
}

export const SESSION_COOKIE = 'axlebook_session';
export const TOKEN_PREFIX = 'axb_';

/** API routes reachable without signing in. */
const PUBLIC_ROUTES = new Set([
  '/api/v1/health',
  '/api/v1/config',
  '/api/v1/auth/status',
  '/api/v1/auth/login',
  '/api/v1/auth/setup',
  '/api/v1/auth/oidc/start',
  '/api/v1/auth/oidc/callback',
]);

const HOUR = 3_600_000;

export async function createSession(
  db: DB,
  config: Config,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: number,
) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + config.auth.sessionDays * 24 * HOUR);
  await db
    .insertInto('sessions')
    .values({
      user_id: userId,
      token_hash: sha256(token),
      expires_at: expires.toISOString(),
      last_seen_at: now.toISOString(),
      user_agent: request.headers['user-agent']?.slice(0, 300) ?? null,
      created_at: now.toISOString(),
    })
    .execute();
  setSessionCookie(config, request, reply, token, config.auth.sessionDays * 86_400);
}

function setSessionCookie(
  config: Config,
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
  maxAge: number,
) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.baseUrl ? config.baseUrl.protocol === 'https:' : request.protocol === 'https',
    path: '/',
    maxAge,
  });
}

export async function destroySession(
  db: DB,
  config: Config,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (request.sessionId)
    await db.deleteFrom('sessions').where('id', '=', request.sessionId).execute();
  setSessionCookie(config, request, reply, '', 0);
}

async function userFromBearer(db: DB, token: string): Promise<User | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const row = await db
    .selectFrom('api_tokens')
    .innerJoin('users', 'users.id', 'api_tokens.user_id')
    .selectAll('users')
    .select([
      'api_tokens.id as token_id',
      'api_tokens.expires_at as token_expires',
      'api_tokens.last_used_at',
    ])
    .where('api_tokens.token_hash', '=', sha256(token))
    .executeTakeFirst();
  if (!row || row.disabled || (row.token_expires && row.token_expires < nowIso())) return null;
  const { token_id, token_expires: _e, last_used_at, ...user } = row;
  if (!last_used_at || Date.now() - Date.parse(last_used_at) > HOUR) {
    await db
      .updateTable('api_tokens')
      .set({ last_used_at: nowIso() })
      .where('id', '=', token_id)
      .execute();
  }
  return user;
}

async function userFromSession(
  db: DB,
  config: Config,
  token: string,
): Promise<{ user: User; sessionId: number } | null> {
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .selectAll('users')
    .select(['sessions.id as session_id', 'sessions.expires_at', 'sessions.last_seen_at'])
    .where('sessions.token_hash', '=', sha256(token))
    .executeTakeFirst();
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) < now || row.disabled) {
    await db.deleteFrom('sessions').where('id', '=', row.session_id).execute();
    return null;
  }
  // Sliding expiry, written at most once an hour.
  if (now - Date.parse(row.last_seen_at) > HOUR) {
    await db
      .updateTable('sessions')
      .set({
        last_seen_at: new Date(now).toISOString(),
        expires_at: new Date(now + config.auth.sessionDays * 24 * HOUR).toISOString(),
      })
      .where('id', '=', row.session_id)
      .execute();
  }
  const { session_id, expires_at: _x, last_seen_at: _l, ...user } = row;
  return { user, sessionId: session_id };
}

export function registerAuth(app: FastifyInstance, db: DB, config: Config) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/v1/')) return;

    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (bearer) {
      request.user = await userFromBearer(db, bearer);
      if (!request.user) throw new AppError('unauthorized');
      return;
    }
    const cookie = request.cookies[SESSION_COOKIE];
    if (cookie) {
      const s = await userFromSession(db, config, cookie);
      if (s) {
        request.user = s.user;
        request.sessionId = s.sessionId;
      }
    }
    if (!request.user && !PUBLIC_ROUTES.has(path)) throw new AppError('unauthorized');
  });
}

/** The signed-in user, or 401. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw new AppError('unauthorized');
  return request.user;
}

export function requireAdmin(request: FastifyRequest): User {
  const user = currentUser(request);
  if (user.role !== 'admin') throw new AppError('forbidden');
  return user;
}

export function requireWriter(request: FastifyRequest): User {
  const user = currentUser(request);
  if (user.role === 'viewer') throw new AppError('forbidden');
  return user;
}
