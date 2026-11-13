import {
  ApiError,
  HistoryLink,
  HistoryLinkInput,
  type HistoryOptions,
  IdParam,
  today,
  VehicleHistory,
  vehicleTitle,
} from '@axlebook/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { HistoryLinksTable, VehicleRow } from '../../db/schema';
import { randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { getInstanceSettings } from '../../lib/instance-settings';
import { FailureLimiter } from '../../lib/rate-limit';
import { nowIso } from '../../lib/time';
import { appUrl } from '../../lib/urls';
import { currentUser } from '../../plugins/auth';
import { currentOdometers } from '../odometer/routes';
import { requireVehicle } from '../vehicles/access';

const tags = ['history'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };
const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
type LinkRow = Selectable<HistoryLinksTable>;

/** The report itself: services, repairs and upgrades, oldest first. */
export async function buildHistory(
  db: DB,
  config: Config,
  v: VehicleRow,
  options: HistoryOptions,
  expiresAt: string | null = null,
): Promise<VehicleHistory> {
  const rows = await db
    .selectFrom('records')
    .select(['date', 'kind', 'title', 'odometer', 'cost', 'notes'])
    .where('vehicle_id', '=', v.id)
    .where('kind', 'in', ['service', 'repair', 'upgrade'])
    .orderBy('date')
    .orderBy('odometer')
    .orderBy('id')
    .execute();
  const records = rows.map((r) => ({
    date: r.date,
    kind: r.kind as 'service' | 'repair' | 'upgrade',
    title: r.title ?? r.kind,
    odometer: r.odometer,
    cost: options.showCosts ? Number(r.cost) : null,
    notes: options.showNotes ? r.notes : null,
  }));
  return {
    vehicle: {
      title: vehicleTitle(v),
      category: v.category,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      engine: v.engine,
      color: v.color,
      vin: options.showVin ? v.vin : null,
      odometerUnit: v.odometer_unit,
      currentOdometer: (await currentOdometers(db, [v.id])).get(v.id) ?? null,
    },
    currency: (await getInstanceSettings(db, config)).currency,
    generatedOn: today(config.timeZone),
    expiresAt,
    options,
    records,
    totals: {
      records: records.length,
      firstDate: records[0]?.date ?? null,
      lastDate: records.at(-1)?.date ?? null,
      cost: options.showCosts ? rows.reduce((s, r) => s + Number(r.cost), 0) : null,
    },
  };
}

const stateOf = (r: LinkRow, now = nowIso()): HistoryLink['state'] =>
  r.revoked_at ? 'revoked' : r.expires_at && r.expires_at <= now ? 'expired' : 'active';

export const historyRoutes =
  ({ db, config }: { db: DB; config: Config }): FastifyPluginAsyncZod =>
  async (app) => {
    /** Links are absolute, so they can be pasted into a message. */
    const origin = (req: FastifyRequest) =>
      appUrl(config, '')?.replace(/\/+$/, '') ?? `${req.protocol}://${req.host}${config.basePath}`;
    const toLink = (r: LinkRow, req: FastifyRequest): HistoryLink => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      label: r.label,
      url: `${origin(req)}/h/${r.token}`,
      showCosts: Boolean(r.show_costs),
      showVin: Boolean(r.show_vin),
      showNotes: Boolean(r.show_notes),
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      state: stateOf(r),
      views: r.views,
      lastViewedAt: r.last_viewed_at,
    });

    app.get(
      '/vehicles/:vehicleId/history',
      {
        schema: {
          tags,
          summary: "A vehicle's service history report",
          description:
            'Every service, repair and upgrade with its date and odometer reading, oldest first: what a buyer asks to see. Costs, the VIN and notes are included only when asked for.',
          params: VehicleParam,
          querystring: z.object({
            costs: z.stringbool().default(false),
            vin: z.stringbool().default(false),
            notes: z.stringbool().default(false),
          }),
          response: { 200: VehicleHistory, ...errors },
        },
      },
      async (req) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        return buildHistory(db, config, v, {
          showCosts: req.query.costs,
          showVin: req.query.vin,
          showNotes: req.query.notes,
        });
      },
    );

    app.get(
      '/vehicles/:vehicleId/history-links',
      {
        schema: {
          tags,
          summary: 'Share links for a vehicle (owner)',
          params: VehicleParam,
          response: { 200: z.array(HistoryLink), ...errors },
        },
      },
      async (req) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'owner');
        const rows = await db
          .selectFrom('history_links')
          .selectAll()
          .where('vehicle_id', '=', v.id)
          .orderBy('id', 'desc')
          .execute();
        return rows.map((r) => toLink(r, req));
      },
    );

    app.post(
      '/vehicles/:vehicleId/history-links',
      {
        schema: {
          tags,
          summary: 'Create a read-only link to the service history (owner)',
          description:
            'Anyone with the link can read the report without signing in, and nothing else. It stops working after `expiresInDays` (default 30) or when revoked.',
          params: VehicleParam,
          body: HistoryLinkInput,
          response: { 201: HistoryLink, ...errors },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'owner');
        const b = req.body;
        const row = await db
          .insertInto('history_links')
          .values({
            vehicle_id: v.id,
            token: randomToken(24),
            label: b.label ?? null,
            show_costs: b.showCosts ? 1 : 0,
            show_vin: b.showVin ? 1 : 0,
            show_notes: b.showNotes ? 1 : 0,
            expires_at:
              b.expiresInDays == null
                ? null
                : new Date(Date.now() + b.expiresInDays * 86_400_000).toISOString(),
            created_by: user.id,
            created_at: nowIso(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send(toLink(row, req));
      },
    );

    app.delete(
      '/history-links/:id',
      {
        schema: {
          tags,
          summary: 'Switch a share link off (owner)',
          description: 'The link stops working at once. It stays in the list, marked revoked.',
          params: IdParam,
          response: { 200: HistoryLink, ...errors },
        },
      },
      async (req) => {
        const row = await db
          .selectFrom('history_links')
          .selectAll()
          .where('id', '=', req.params.id)
          .executeTakeFirst();
        if (!row) throw new AppError('not_found', { entity: 'link' });
        await requireVehicle(db, currentUser(req), row.vehicle_id, 'owner');
        const updated = await db
          .updateTable('history_links')
          .set({ revoked_at: row.revoked_at ?? nowIso() })
          .where('id', '=', row.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return toLink(updated, req);
      },
    );
  };

/**
 * The public side of a share link, outside /api/v1 so it needs no session. A wrong, expired or
 * revoked token all get the same 404, and guessing is slowed down per address.
 */
export function registerPublicHistory(
  app: FastifyInstance,
  { db, config }: { db: DB; config: Config },
) {
  const misses = new FailureLimiter(30, 10 * 60_000);
  app.get('/api/public/history/:token', { schema: { hide: true } }, async (req, reply) => {
    const token = (req.params as { token: string }).token;
    const gone = () => reply.status(404).send({ error: { code: 'not_found' } });
    if (misses.isBlocked(req.ip))
      return reply.status(429).send({ error: { code: 'rate_limited' } });
    const row =
      token.length >= 20
        ? await db
            .selectFrom('history_links')
            .selectAll()
            .where('token', '=', token)
            .executeTakeFirst()
        : undefined;
    if (!row || stateOf(row) !== 'active') {
      misses.fail(req.ip);
      return gone();
    }
    const v = await db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', '=', row.vehicle_id)
      .executeTakeFirst();
    if (!v) return gone();
    await db
      .updateTable('history_links')
      .set({ views: row.views + 1, last_viewed_at: nowIso() })
      .where('id', '=', row.id)
      .execute();
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .send(
        await buildHistory(
          db,
          config,
          v,
          {
            showCosts: Boolean(row.show_costs),
            showVin: Boolean(row.show_vin),
            showNotes: Boolean(row.show_notes),
          },
          row.expires_at,
        ),
      );
  });
}
