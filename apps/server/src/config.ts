import path from 'node:path';
import { UNIT_SYSTEMS } from '@axlebook/shared';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATA_DIR: z.string().default('./data'),
  DATABASE_URL: z.string().optional(),
  BASE_URL: z.url().optional(),
  TRUST_PROXY: bool,
  DEFAULT_UNIT_SYSTEM: z.enum(UNIT_SYSTEMS).default('imperial'),
  DEFAULT_CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  DEFAULT_LOCALE: z.string().default('en'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  SEED_DEMO_DATA: bool,
  WEB_DIR: z.string().optional(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  DISABLE_LOCAL_LOGIN: bool,
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  OIDC_ISSUER: z.url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid profile email'),
  OIDC_LABEL: z.string().default('Single sign-on'),
  OIDC_AUTO_CREATE_USERS: z.enum(['true', 'false']).default('true'),
  OIDC_DEFAULT_ROLE: z.enum(['admin', 'editor', 'viewer']).default('editor'),
  OIDC_ADMIN_GROUP: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  REMINDER_SCAN_INTERVAL_MIN: z.coerce.number().int().min(1).max(1440).default(60),
  TZ: z.string().optional(),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(e.DATA_DIR);
  const databaseUrl = e.DATABASE_URL?.trim() || undefined;
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    dataDir,
    attachmentsDir: path.join(dataDir, 'attachments'),
    database: databaseUrl?.startsWith('postgres')
      ? ({ kind: 'postgres', url: databaseUrl } as const)
      : ({ kind: 'sqlite', file: databaseUrl ?? path.join(dataDir, 'axlebook.db') } as const),
    baseUrl: e.BASE_URL ? new URL(e.BASE_URL) : undefined,
    trustProxy: e.TRUST_PROXY,
    defaults: {
      unitSystem: e.DEFAULT_UNIT_SYSTEM,
      currency: e.DEFAULT_CURRENCY,
      locale: e.DEFAULT_LOCALE,
    },
    maxUploadBytes: Math.round(e.MAX_UPLOAD_MB * 1024 * 1024),
    seedDemoData: e.SEED_DEMO_DATA,
    timeZone: e.TZ,
    auth: {
      bootstrapAdmin:
        e.ADMIN_USERNAME && e.ADMIN_PASSWORD
          ? { username: e.ADMIN_USERNAME, password: e.ADMIN_PASSWORD }
          : undefined,
      localLogin: !e.DISABLE_LOCAL_LOGIN,
      sessionDays: e.SESSION_DAYS,
      oidc:
        e.OIDC_ISSUER && e.OIDC_CLIENT_ID
          ? {
              issuer: e.OIDC_ISSUER,
              clientId: e.OIDC_CLIENT_ID,
              clientSecret: e.OIDC_CLIENT_SECRET,
              scopes: e.OIDC_SCOPES,
              label: e.OIDC_LABEL,
              autoCreate: e.OIDC_AUTO_CREATE_USERS === 'true',
              defaultRole: e.OIDC_DEFAULT_ROLE,
              adminGroup: e.OIDC_ADMIN_GROUP,
            }
          : undefined,
    },
    smtp: e.SMTP_HOST
      ? {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          user: e.SMTP_USER,
          pass: e.SMTP_PASS,
          from: e.SMTP_FROM ?? 'Axlebook <axlebook@localhost>',
        }
      : undefined,
    reminderScanMinutes: e.REMINDER_SCAN_INTERVAL_MIN,
    webDir: e.WEB_DIR
      ? path.resolve(e.WEB_DIR)
      : path.resolve(import.meta.dirname, '../../web/dist'),
  };
}
