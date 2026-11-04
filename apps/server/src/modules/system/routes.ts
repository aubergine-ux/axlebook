import { Health, PublicConfig } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import { getSetting } from '../../lib/settings';
import { VERSION } from '../../lib/version';

export const systemRoutes =
  (deps: { db: DB; config: Config }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/health',
      { schema: { tags: ['system'], summary: 'Liveness check', response: { 200: Health } } },
      async () => {
        await deps.db.selectFrom('users').select('id').limit(1).execute();
        return { status: 'ok' as const, version: VERSION };
      },
    );

    app.get(
      '/config',
      {
        schema: {
          tags: ['system'],
          summary: 'Public instance configuration used by the web client',
          response: { 200: PublicConfig },
        },
      },
      async () => ({
        version: VERSION,
        currency: await getSetting(deps.db, 'currency', deps.config.defaults.currency),
        defaultUnitSystem: deps.config.defaults.unitSystem,
        defaultLocale: deps.config.defaults.locale,
      }),
    );
  };
