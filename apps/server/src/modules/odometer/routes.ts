import {
  ApiError,
  computeFuelEconomy,
  FuelEconomyReport,
  IdParam,
  OdometerInput,
  OdometerReading,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { currentUser } from '../../plugins/auth';
import { requireVehicle } from '../vehicles/access';

const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

/** Highest reading per vehicle: the current odometer. */
export async function currentOdometers(db: DB, vehicleIds: number[]): Promise<Map<number, number>> {
  if (vehicleIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('odometer_readings')
    .select((eb) => ['vehicle_id', eb.fn.max('odometer').as('odo')])
    .where('vehicle_id', 'in', vehicleIds)
    .groupBy('vehicle_id')
    .execute();
  return new Map(rows.map((r) => [r.vehicle_id, Number(r.odo)]));
}

export async function fuelEconomyReport(db: DB, vehicleId: number): Promise<FuelEconomyReport> {
  const fills = await db
    .selectFrom('records')
    .select([
      'id',
      'date',
      'odometer',
      'fuel_volume',
      'cost',
      'price_per_unit',
      'is_full',
      'missed_previous',
      'station',
    ])
    .where('vehicle_id', '=', vehicleId)
    .where('kind', '=', 'fuel')
    .where('odometer', 'is not', null)
    .where('fuel_volume', 'is not', null)
    .execute();
  const byId = new Map(fills.map((f) => [f.id, f]));
  const result = computeFuelEconomy(
    fills.map((f) => ({
      id: f.id,
      date: f.date,
      odometer: f.odometer as number,
      volume: f.fuel_volume as number,
      isFull: Boolean(f.is_full),
      missedPrevious: Boolean(f.missed_previous),
    })),
  );
  const ordered = result.fills.map((r) => {
    const f = byId.get(r.id) as (typeof fills)[number];
    return {
      recordId: f.id,
      date: f.date,
      odometer: f.odometer as number,
      volume: f.fuel_volume as number,
      cost: f.cost,
      pricePerUnit: f.price_per_unit,
      isFull: Boolean(f.is_full),
      missedPrevious: Boolean(f.missed_previous),
      station: f.station,
      status: r.status,
      distance: r.distance,
      economy: r.economy,
    };
  });
  // Cost per distance: everything after the first fill (its fuel was burnt before
  // tracking began), over the distance covered since.
  const first = ordered[0];
  const lastFill = ordered.at(-1);
  const span = first && lastFill ? lastFill.odometer - first.odometer : 0;
  const spentAfterFirst = ordered.slice(1).reduce((s, f) => s + f.cost, 0);
  return {
    fills: ordered.reverse(),
    average: result.average,
    last: result.last,
    totalDistance: result.totalDistance,
    totalVolume: result.totalVolume,
    totalCost: fills.reduce((s, f) => s + f.cost, 0),
    costPerDistance: span > 0 ? spentAfterFirst / span : null,
  };
}

export const odometerRoutes =
  ({ db }: { db: DB }): FastifyPluginAsyncZod =>
  async (app) => {
    const tags = ['odometer'];

    app.get(
      '/vehicles/:vehicleId/odometer',
      {
        schema: {
          tags,
          summary: 'Odometer log, newest first',
          params: VehicleParam,
          response: { 200: z.array(OdometerReading), ...errors },
        },
      },
      async (req) => {
        await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        const rows = await db
          .selectFrom('odometer_readings as o')
          .leftJoin('records as r', 'r.id', 'o.record_id')
          .select([
            'o.id',
            'o.vehicle_id',
            'o.date',
            'o.odometer',
            'o.record_id',
            'o.notes',
            'o.jurisdiction',
            'r.kind',
            'r.title',
          ])
          .where('o.vehicle_id', '=', req.params.vehicleId)
          .orderBy('o.odometer', 'desc')
          .orderBy('o.date', 'desc')
          .execute();
        return rows.map((r) => ({
          id: r.id,
          vehicleId: r.vehicle_id,
          date: r.date,
          odometer: r.odometer,
          recordId: r.record_id,
          recordKind: r.kind ?? null,
          recordTitle: r.title ?? null,
          notes: r.notes,
          jurisdiction: r.jurisdiction ?? null,
        }));
      },
    );

    app.post(
      '/vehicles/:vehicleId/odometer',
      {
        schema: {
          tags,
          summary: 'Add a manual reading',
          params: VehicleParam,
          body: OdometerInput,
          response: { 201: OdometerReading, ...errors },
        },
      },
      async (req, reply) => {
        await requireVehicle(db, currentUser(req), req.params.vehicleId, 'edit');
        const ts = nowIso();
        const row = await db
          .insertInto('odometer_readings')
          .values({
            vehicle_id: req.params.vehicleId,
            date: req.body.date,
            odometer: req.body.odometer,
            notes: req.body.notes ?? null,
            jurisdiction: req.body.jurisdiction ?? null,
            created_at: ts,
            updated_at: ts,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send({
          id: row.id,
          vehicleId: row.vehicle_id,
          date: row.date,
          odometer: row.odometer,
          recordId: null,
          recordKind: null,
          recordTitle: null,
          notes: row.notes,
          jurisdiction: row.jurisdiction ?? null,
        });
      },
    );

    const manual = async (req: { params: { id: number }; user: unknown }) => {
      const row = await db
        .selectFrom('odometer_readings')
        .selectAll()
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!row) throw new AppError('not_found');
      await requireVehicle(db, currentUser(req as never), row.vehicle_id, 'edit');
      // Readings from records change with the record, not here.
      if (row.record_id != null)
        throw new AppError('conflict', { reason: 'linked_to_record', recordId: row.record_id });
      return row;
    };

    app.put(
      '/odometer/:id',
      {
        schema: {
          tags,
          summary: 'Edit a manual reading',
          params: IdParam,
          body: OdometerInput,
          response: { 200: OdometerReading, ...errors, 409: ApiError },
        },
      },
      async (req) => {
        await manual(req);
        const row = await db
          .updateTable('odometer_readings')
          .set({
            date: req.body.date,
            odometer: req.body.odometer,
            notes: req.body.notes ?? null,
            jurisdiction: req.body.jurisdiction ?? null,
            updated_at: nowIso(),
          })
          .where('id', '=', req.params.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return {
          id: row.id,
          vehicleId: row.vehicle_id,
          date: row.date,
          odometer: row.odometer,
          recordId: null,
          recordKind: null,
          recordTitle: null,
          notes: row.notes,
          jurisdiction: row.jurisdiction ?? null,
        };
      },
    );

    app.delete(
      '/odometer/:id',
      {
        schema: {
          tags,
          summary: 'Delete a manual reading',
          params: IdParam,
          response: { 204: z.null(), ...errors, 409: ApiError },
        },
      },
      async (req, reply) => {
        await manual(req);
        await db.deleteFrom('odometer_readings').where('id', '=', req.params.id).execute();
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/vehicles/:vehicleId/fuel-economy',
      {
        schema: {
          tags: ['fuel'],
          summary: 'Fuel fill-ups with per-segment and lifetime economy',
          description:
            "Economy is distance per volume unit in the vehicle's own units (e.g. mi/US gal). Full-to-full: partial fills carry into the next full fill; a missed fill-up voids its segment.",
          params: VehicleParam,
          response: { 200: FuelEconomyReport, ...errors },
        },
      },
      async (req) => {
        await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        return fuelEconomyReport(db, req.params.vehicleId);
      },
    );
  };
