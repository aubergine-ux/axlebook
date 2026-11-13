import { z } from 'zod';

export const InstanceSettings = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    soonDays: z.number().int().min(0).max(365),
    soonDistanceMi: z.number().int().min(0).max(100_000),
    soonDistanceKm: z.number().int().min(0).max(100_000),
    /**
     * Allow this server to ask NHTSA (a US government service) to decode VINs and list safety
     * recalls. Off by default: nothing leaves the server unless an admin turns this on.
     */
    onlineLookups: z.boolean(),
    /** Write a backup to the data volume on a schedule. */
    backupEnabled: z.boolean(),
    backupEveryHours: z.number().int().min(1).max(720),
    /** How many stored backups to keep; older ones are deleted. */
    backupKeep: z.number().int().min(1).max(365),
  })
  .meta({ id: 'InstanceSettings' });
export type InstanceSettings = z.infer<typeof InstanceSettings>;
export const InstanceSettingsUpdate = InstanceSettings.partial();

export const CHANNEL_TYPES = ['email', 'ntfy', 'gotify', 'discord', 'apprise', 'webhook'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const ChannelConfig = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email'), to: z.email() }),
  z.object({ type: z.literal('ntfy'), url: z.url(), token: z.string().max(200).optional() }),
  z.object({ type: z.literal('gotify'), url: z.url(), token: z.string().min(1).max(200) }),
  z.object({ type: z.literal('discord'), url: z.url() }),
  /**
   * An Apprise API server: `url` is its notify endpoint (`…/notify/<key>` for a saved
   * configuration, or `…/notify` together with `urls`, a comma-separated list of Apprise URLs).
   */
  z.object({
    type: z.literal('apprise'),
    url: z.url(),
    urls: z.string().max(2000).optional(),
    tag: z.string().max(100).optional(),
  }),
  z.object({ type: z.literal('webhook'), url: z.url(), secret: z.string().max(200).optional() }),
]);
export type ChannelConfig = z.infer<typeof ChannelConfig>;

export const ChannelInput = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  config: ChannelConfig,
});
export type ChannelInput = z.input<typeof ChannelInput>;

export const Channel = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.enum(CHANNEL_TYPES),
  enabled: z.boolean(),
  /** Secrets (tokens) are masked. */
  config: z.record(z.string(), z.unknown()),
  lastResult: z
    .object({ status: z.enum(['sent', 'failed']), error: z.string().nullable(), at: z.string() })
    .nullable(),
});
export type Channel = z.infer<typeof Channel>;

export const ImportResult = z.object({
  dryRun: z.boolean(),
  total: z.number().int(),
  imported: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
  preview: z.array(z.record(z.string(), z.unknown())),
  detectedFormat: z.enum(['axlebook', 'lubelogger', 'fuelly', 'drivvo', 'simplyauto', 'custom']),
  /** Vehicle names found in the file, when it covers more than this one. */
  vehiclesInFile: z.array(z.string()),
});
export type ImportResult = z.infer<typeof ImportResult>;
