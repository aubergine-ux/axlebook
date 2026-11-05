import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config';
import type { DbHandle } from './db/connection';
import { type Ai, disabledAi, OllamaAi } from './lib/ai';
import { FileStore } from './lib/files';
import { getSetting } from './lib/settings';
import { VERSION } from './lib/version';
import { assistantRoutes, MODEL_SETTING } from './modules/assistant/routes';
import { authRoutes } from './modules/auth/routes';
import { calendarRoutes, registerCalendarFeed } from './modules/calendar/routes';
import { commercialRoutes } from './modules/commercial/routes';
import { importExportRoutes } from './modules/import-export/routes';
import { insightRoutes } from './modules/insights/routes';
import { InsightService } from './modules/insights/service';
import { inventoryRoutes } from './modules/inventory/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { NotificationService } from './modules/notifications/service';
import { currentOdometers, odometerRoutes } from './modules/odometer/routes';
import { recordRoutes } from './modules/records/routes';
import { RecordService } from './modules/records/service';
import { reminderRoutes } from './modules/reminders/routes';
import { ReminderService } from './modules/reminders/service';
import { reportRoutes } from './modules/reports/routes';
import { settingsRoutes } from './modules/settings/routes';
import { spreadsheetRoutes } from './modules/spreadsheet/routes';
import { SpreadsheetImporter } from './modules/spreadsheet/service';
import { systemRoutes } from './modules/system/routes';
import { userRoutes } from './modules/users/routes';
import { vehicleRoutes } from './modules/vehicles/routes';
import { VehicleService } from './modules/vehicles/service';
import { shareRoutes } from './modules/vehicles/shares';
import { registerAuth } from './plugins/auth';
import { registerCsrfProtection } from './plugins/csrf';
import { registerErrorHandler } from './plugins/error-handler';
import { registerSpa } from './plugins/static-spa';

export interface AppDeps {
  config: Config;
  db: DbHandle;
  /** Override the local AI client (tests use a fake). */
  ai?: Ai;
}

export async function buildApp({ config, db: handle, ai: aiOverride }: AppDeps) {
  const db = handle.db;
  const app = Fastify({
    logger:
      config.env === 'test'
        ? false
        : {
            level: config.logLevel,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    trustProxy: config.trustProxy,
    bodyLimit: 4 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  // Baseline security headers for every response.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: config.maxUploadBytes, fields: 10 },
    throwFileSizeLimit: true,
  });
  registerCsrfProtection(app, { baseUrl: config.baseUrl });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Axlebook API',
        description:
          'REST API for Axlebook, a self-hosted vehicle maintenance logbook. Money and fuel volume are integer milli-units (1000 = 1.000). Authenticate with the session cookie or `Authorization: Bearer <token>` (create tokens under Settings).',
        version: VERSION,
        license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
      },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: {
          session: { type: 'apiKey', in: 'cookie', name: 'axlebook_session' },
          bearer: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ session: [] }, { bearer: [] }],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });
  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  registerAuth(app, db, config);

  // ── Services ─────────────────────────────────────────────────────────────
  const photos = new FileStore(path.join(config.dataDir, 'photos'));
  const attachments = new FileStore(path.join(config.dataDir, 'attachments'));
  const vehicles = new VehicleService(db, photos);
  const records = new RecordService(db, attachments);
  const reminders = new ReminderService(db, config);
  const notifications = new NotificationService(db, config, reminders, app.log);
  const ai: Ai = aiOverride ?? (config.ai ? new OllamaAi(config.ai, app.log) : disabledAi);
  // The model an admin picked in Settings wins over OLLAMA_MODEL.
  if (ai.enabled) {
    const chosen = await getSetting<string | null>(db, MODEL_SETTING, null);
    if (chosen) ai.setModel(chosen);
  }
  const insights = new InsightService(db, config, ai);
  const importer = new SpreadsheetImporter(db, config, ai, vehicles, records);

  /** Delete stored files (photos, attachments) for vehicles about to be deleted. */
  const removeFiles = async (vehicleIds: number[]) => {
    if (vehicleIds.length === 0) return;
    const ph = await db
      .selectFrom('vehicles')
      .select('photo_key')
      .where('id', 'in', vehicleIds)
      .execute();
    const at = await db
      .selectFrom('attachments')
      .select('storage_key')
      .where('vehicle_id', 'in', vehicleIds)
      .execute();
    for (const p of ph) if (p.photo_key) await photos.remove(p.photo_key);
    for (const a of at) await attachments.remove(a.storage_key);
  };

  vehicles.setSummaryProvider(async (ids) => {
    if (ids.length === 0) return new Map();
    const [odo, costs, next] = await Promise.all([
      currentOdometers(db, ids),
      db
        .selectFrom('records')
        .select((eb) => ['vehicle_id', eb.fn.sum<number>('cost').as('total')])
        .where('vehicle_id', 'in', ids)
        .groupBy('vehicle_id')
        .execute(),
      reminders.nextByVehicle(ids),
    ]);
    const costBy = new Map(costs.map((c) => [c.vehicle_id, Number(c.total)]));
    return new Map(
      ids.map((id) => {
        const r = next.get(id);
        return [
          id,
          {
            currentOdometer: odo.get(id) ?? null,
            costToDate: costBy.get(id) ?? 0,
            nextReminder:
              r && r.status !== 'inactive'
                ? {
                    id: r.id,
                    title: r.title,
                    status: r.status,
                    dueDate: r.dueDate,
                    dueOdometer: r.dueOdometer,
                  }
                : null,
          },
        ];
      }),
    );
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  const api = { prefix: '/api/v1' };
  await app.register(systemRoutes({ db, config }), api);
  await app.register(authRoutes({ db, config }), api);
  await app.register(userRoutes({ db, removeFiles }), api);
  await app.register(settingsRoutes({ db, config }), api);
  await app.register(vehicleRoutes(vehicles, removeFiles), api);
  await app.register(shareRoutes({ db }), api);
  await app.register(recordRoutes({ db, records, files: attachments }), api);
  await app.register(odometerRoutes({ db }), api);
  await app.register(reminderRoutes(reminders), api);
  await app.register(inventoryRoutes({ db, records }), api);
  await app.register(reportRoutes({ db, config }), api);
  await app.register(importExportRoutes({ db, config, records, photos, attachments }), api);
  await app.register(notificationRoutes({ db, notifications }), api);
  await app.register(insightRoutes({ insights, ai }), api);
  await app.register(commercialRoutes({ db, config }), api);
  await app.register(calendarRoutes({ db, config }), api);
  await app.register(spreadsheetRoutes(importer), api);
  await app.register(assistantRoutes({ db, config, ai }), api);
  // The calendar feed lives outside /api so calendar apps can subscribe with a plain URL.
  registerCalendarFeed(app, { db, config });

  await registerSpa(app, config.webDir);

  return Object.assign(app, {
    services: { vehicles, records, reminders, notifications, insights, importer, ai },
  });
}

export type App = Awaited<ReturnType<typeof buildApp>>;
