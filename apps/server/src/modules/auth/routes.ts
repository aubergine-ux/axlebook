import {
  ApiToken,
  ApiTokenCreate,
  ApiTokenCreated,
  AuthStatus,
  IdParam,
  LoginInput,
  Me,
  MeUpdate,
  PasswordChange,
  parseNotifyPrefs,
  parseViewPrefs,
  SetupInput,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import { hashPassword, needsRehash, randomToken, sha256, verifyPassword } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { FailureLimiter } from '../../lib/rate-limit';
import { nowIso } from '../../lib/time';
import { appUrl } from '../../lib/urls';
import { createSession, currentUser, destroySession, TOKEN_PREFIX } from '../../plugins/auth';
import { finishLogin, startLogin } from './oidc';
import { isSetupRequired, performSetup, toMe } from './service';

const tags = ['auth'];

export const authRoutes =
  ({ db, config }: { db: DB; config: Config }): FastifyPluginAsyncZod =>
  async (app) => {
    const limiter = new FailureLimiter(10, 15 * 60_000);

    app.get(
      '/auth/status',
      {
        schema: {
          tags,
          summary: 'Sign-in options and the current user (if any)',
          response: { 200: AuthStatus },
        },
      },
      async (req) => ({
        setupRequired: await isSetupRequired(db),
        localLogin: config.auth.localLogin,
        oidc: { enabled: Boolean(config.auth.oidc), label: config.auth.oidc?.label ?? '' },
        user: req.user ? toMe(req.user, config) : null,
      }),
    );

    app.post(
      '/auth/setup',
      {
        schema: {
          tags,
          summary: 'Create the first admin account',
          body: SetupInput,
          response: { 200: Me },
        },
      },
      async (req, reply) => {
        const user = await performSetup(db, req.body);
        await createSession(db, config, req, reply, user.id);
        return toMe(user, config);
      },
    );

    app.post(
      '/auth/login',
      {
        schema: {
          tags,
          summary: 'Sign in with a username and password',
          body: LoginInput,
          response: { 200: Me },
        },
      },
      async (req, reply) => {
        if (!config.auth.localLogin) throw new AppError('local_login_disabled');
        const key = `${req.ip}|${req.body.username}`;
        if (limiter.isBlocked(key)) throw new AppError('rate_limited');
        const user = await db
          .selectFrom('users')
          .selectAll()
          .where('username', '=', req.body.username)
          .executeTakeFirst();
        const ok = await verifyPassword(req.body.password, user?.password_hash ?? null);
        if (!user || !ok || user.disabled) {
          limiter.fail(key);
          throw new AppError('invalid_credentials');
        }
        limiter.reset(key);
        if (user.password_hash && needsRehash(user.password_hash))
          await db
            .updateTable('users')
            .set({ password_hash: await hashPassword(req.body.password) })
            .where('id', '=', user.id)
            .execute();
        await createSession(db, config, req, reply, user.id);
        return toMe(user, config);
      },
    );

    app.post(
      '/auth/logout',
      { schema: { tags, summary: 'Sign out of this browser', response: { 204: z.null() } } },
      async (req, reply) => {
        await destroySession(db, config, req, reply);
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/auth/oidc/start',
      { schema: { tags, summary: 'Start single sign-on (redirects)', hide: !config.auth.oidc } },
      async (_req, reply) => reply.redirect(await startLogin(config)),
    );

    app.get(
      '/auth/oidc/callback',
      { schema: { tags, summary: 'Single sign-on callback (redirects)', hide: !config.auth.oidc } },
      async (req, reply) => {
        try {
          // The address the identity provider sent the browser back to, mount path included.
          const current = new URL(
            appUrl(config, req.url) ?? `${req.protocol}://${req.host}${req.url}`,
          );
          const user = await finishLogin(db, config, current);
          await createSession(db, config, req, reply, user.id);
          return reply.redirect(`${config.basePath}/`);
        } catch (err) {
          req.log.warn({ err }, 'oidc login failed');
          return reply.redirect(`${config.basePath}/login?error=oidc_failed`);
        }
      },
    );

    app.get(
      '/me',
      { schema: { tags, summary: 'The signed-in user', response: { 200: Me } } },
      async (req) => toMe(currentUser(req), config),
    );

    app.patch(
      '/me',
      {
        schema: {
          tags,
          summary: 'Update your profile and preferences',
          body: MeUpdate,
          response: { 200: Me },
        },
      },
      async (req) => {
        const u = currentUser(req);
        const b = req.body;
        const prefs = parseViewPrefs(u.view_prefs);
        if (b.garage) prefs.garage = b.garage;
        if (b.showTips !== undefined) prefs.showTips = b.showTips;
        const row = await db
          .updateTable('users')
          .set({
            ...(b.displayName !== undefined && { display_name: b.displayName }),
            ...(b.email !== undefined && { email: b.email }),
            ...(b.unitSystem && { unit_system: b.unitSystem }),
            ...(b.locale && { locale: b.locale }),
            ...(b.theme && { theme: b.theme }),
            ...((b.garage || b.showTips !== undefined) && { view_prefs: JSON.stringify(prefs) }),
            ...(b.currency !== undefined && { currency: b.currency }),
            ...(b.dateFormat && { date_format: b.dateFormat === 'auto' ? null : b.dateFormat }),
            ...(b.notify && {
              notify_prefs: JSON.stringify({ ...parseNotifyPrefs(u.notify_prefs), ...b.notify }),
            }),
            updated_at: nowIso(),
          })
          .where('id', '=', u.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return toMe(row, config);
      },
    );

    app.post(
      '/me/password',
      {
        schema: {
          tags,
          summary: 'Set or change your password',
          body: PasswordChange,
          response: { 204: z.null() },
        },
      },
      async (req, reply) => {
        const u = currentUser(req);
        if (u.password_hash && !(await verifyPassword(req.body.current ?? '', u.password_hash))) {
          throw new AppError('invalid_credentials');
        }
        await db
          .updateTable('users')
          .set({ password_hash: await hashPassword(req.body.next), updated_at: nowIso() })
          .where('id', '=', u.id)
          .execute();
        // Sign out every other browser.
        let q = db.deleteFrom('sessions').where('user_id', '=', u.id);
        if (req.sessionId) q = q.where('id', '!=', req.sessionId);
        await q.execute();
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/me/tokens',
      { schema: { tags, summary: 'Your API tokens', response: { 200: z.array(ApiToken) } } },
      async (req) => {
        const rows = await db
          .selectFrom('api_tokens')
          .selectAll()
          .where('user_id', '=', currentUser(req).id)
          .orderBy('created_at', 'desc')
          .execute();
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          prefix: r.prefix,
          lastUsedAt: r.last_used_at,
          expiresAt: r.expires_at,
          createdAt: r.created_at,
        }));
      },
    );

    app.post(
      '/me/tokens',
      {
        schema: {
          tags,
          summary: 'Create an API token',
          description: 'The token is shown once. Send it as `Authorization: Bearer <token>`.',
          body: ApiTokenCreate,
          response: { 201: ApiTokenCreated },
        },
      },
      async (req, reply) => {
        const u = currentUser(req);
        const token = `${TOKEN_PREFIX}${randomToken(24)}`;
        const ts = nowIso();
        const expires = req.body.expiresInDays
          ? new Date(Date.now() + req.body.expiresInDays * 86_400_000).toISOString()
          : null;
        const row = await db
          .insertInto('api_tokens')
          .values({
            user_id: u.id,
            name: req.body.name,
            token_hash: sha256(token),
            prefix: token.slice(0, 10),
            expires_at: expires,
            created_at: ts,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send({
          id: row.id,
          name: row.name,
          prefix: row.prefix,
          lastUsedAt: null,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          token,
        });
      },
    );

    app.delete(
      '/me/tokens/:id',
      {
        schema: {
          tags,
          summary: 'Revoke an API token',
          params: IdParam,
          response: { 204: z.null() },
        },
      },
      async (req, reply) => {
        const res = await db
          .deleteFrom('api_tokens')
          .where('id', '=', req.params.id)
          .where('user_id', '=', currentUser(req).id)
          .executeTakeFirst();
        if (!res.numDeletedRows) throw new AppError('not_found');
        return reply.status(204).send(null);
      },
    );
  };
