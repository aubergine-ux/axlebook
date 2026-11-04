import { InstanceSettings, InstanceSettingsUpdate } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import { getInstanceSettings, updateInstanceSettings } from '../../lib/instance-settings';
import { currentUser, requireAdmin } from '../../plugins/auth';

export const settingsRoutes =
  ({ db, config }: { db: DB; config: Config }): FastifyPluginAsyncZod =>
  async (app) => {
    const tags = ['settings'];
    app.get(
      '/settings',
      { schema: { tags, summary: 'Instance settings', response: { 200: InstanceSettings } } },
      async (req) => {
        currentUser(req);
        return getInstanceSettings(db, config);
      },
    );
    app.patch(
      '/settings',
      {
        schema: {
          tags,
          summary: 'Change instance settings (admin)',
          body: InstanceSettingsUpdate,
          response: { 200: InstanceSettings },
        },
      },
      async (req) => {
        requireAdmin(req);
        return updateInstanceSettings(db, config, req.body);
      },
    );
  };
