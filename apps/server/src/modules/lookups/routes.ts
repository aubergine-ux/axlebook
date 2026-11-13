import {
  ApiError,
  IdParam,
  RECALL_STATES,
  Recall,
  VehicleRecalls,
  Vin,
  VinDecoded,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { RecallsTable, User, VehicleRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { getInstanceSettings } from '../../lib/instance-settings';
import type { Lookups } from '../../lib/nhtsa';
import { nowIso } from '../../lib/time';
import { currentUser } from '../../plugins/auth';
import { requireVehicle } from '../vehicles/access';

const tags = ['lookups'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError, 502: ApiError, 503: ApiError };
const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });

const toRecall = (r: Selectable<RecallsTable>): Recall => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  campaign: r.campaign,
  component: r.component,
  summary: r.summary,
  consequence: r.consequence,
  remedy: r.remedy,
  reportDate: r.report_date,
  state: r.state,
  stateAt: r.state_at,
});

/** Fetch a vehicle's recalls and store them. A recall someone already dealt with keeps its state. */
export async function refreshRecalls(
  db: DB,
  lookups: Lookups,
  v: VehicleRow,
  ts = nowIso(),
): Promise<number> {
  const found = await lookups.recalls(v.make, v.model, v.year);
  const known = new Set(
    (
      await db.selectFrom('recalls').select('campaign').where('vehicle_id', '=', v.id).execute()
    ).map((r) => r.campaign),
  );
  let added = 0;
  for (const r of found) {
    const details = {
      component: r.component,
      summary: r.summary,
      consequence: r.consequence,
      remedy: r.remedy,
      report_date: r.reportDate,
      updated_at: ts,
    };
    if (known.has(r.campaign)) {
      await db
        .updateTable('recalls')
        .set(details)
        .where('vehicle_id', '=', v.id)
        .where('campaign', '=', r.campaign)
        .execute();
    } else {
      await db
        .insertInto('recalls')
        .values({ ...details, vehicle_id: v.id, campaign: r.campaign, created_at: ts })
        .execute();
      added++;
    }
  }
  await db.updateTable('vehicles').set({ recalls_checked_at: ts }).where('id', '=', v.id).execute();
  return added;
}

export const lookupRoutes =
  ({ db, config, lookups }: { db: DB; config: Config; lookups: Lookups }): FastifyPluginAsyncZod =>
  async (app) => {
    const enabled = async () => (await getInstanceSettings(db, config)).onlineLookups;
    const requireEnabled = async () => {
      if (!(await enabled())) throw new AppError('lookups_disabled');
    };
    const list = async (user: User, vehicleId: number): Promise<VehicleRecalls> => {
      const v = await requireVehicle(db, user, vehicleId, 'view');
      const rows = await db
        .selectFrom('recalls')
        .selectAll()
        .where('vehicle_id', '=', v.id)
        .orderBy('report_date', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return {
        enabled: await enabled(),
        checkedAt: v.recalls_checked_at,
        // Open ones first: those are the ones that need a trip to the dealer.
        recalls: rows
          .map(toRecall)
          .sort((a, b) => Number(a.state !== 'open') - Number(b.state !== 'open')),
      };
    };

    app.post(
      '/lookups/vin',
      {
        schema: {
          tags,
          summary: 'Decode a VIN',
          description:
            'Asks NHTSA vPIC (a US government service) what the VIN says: year, make, model, trim, engine and fuel. The VIN is the only thing sent. Answers 503 `lookups_disabled` unless an admin has switched online lookups on in Settings.',
          body: z.object({ vin: Vin }),
          response: { 200: VinDecoded, ...errors },
        },
      },
      async (req) => {
        if (currentUser(req).role === 'viewer') throw new AppError('forbidden');
        await requireEnabled();
        return lookups.decodeVin(req.body.vin);
      },
    );

    app.get(
      '/vehicles/:vehicleId/recalls',
      {
        schema: {
          tags,
          summary: 'Safety recalls found for a vehicle',
          description: 'What the last check stored. Reading this never contacts NHTSA.',
          params: VehicleParam,
          response: { 200: VehicleRecalls, ...errors },
        },
      },
      async (req) => list(currentUser(req), req.params.vehicleId),
    );

    app.post(
      '/vehicles/:vehicleId/recalls/check',
      {
        schema: {
          tags,
          summary: 'Check NHTSA for recalls now',
          description:
            'Looks recalls up by make, model and year (no VIN or account details are sent) and stores any new ones as open. Recalls already marked completed or dismissed stay that way.',
          params: VehicleParam,
          response: { 200: VehicleRecalls, ...errors },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'edit');
        await requireEnabled();
        await refreshRecalls(db, lookups, v);
        return list(user, v.id);
      },
    );

    app.patch(
      '/recalls/:id',
      {
        schema: {
          tags,
          summary: 'Mark a recall completed, dismissed or open again',
          params: IdParam,
          body: z.object({ state: z.enum(RECALL_STATES) }),
          response: { 200: Recall, ...errors },
        },
      },
      async (req) => {
        const row = await db
          .selectFrom('recalls')
          .selectAll()
          .where('id', '=', req.params.id)
          .executeTakeFirst();
        if (!row) throw new AppError('not_found', { entity: 'recall' });
        await requireVehicle(db, currentUser(req), row.vehicle_id, 'edit');
        const ts = nowIso();
        const updated = await db
          .updateTable('recalls')
          .set({
            state: req.body.state,
            state_at: req.body.state === 'open' ? null : ts,
            updated_at: ts,
          })
          .where('id', '=', row.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return toRecall(updated);
      },
    );
  };
