import { ApiError, IdParam, MileageReport, Trip, TripInput } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import type { TripsTable } from '../../db/schema';
import { stringifyCsv } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { currentUser } from '../../plugins/auth';
import { requireVehicle } from '../vehicles/access';

const tags = ['trips'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };
const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
const Year = z.coerce.number().int().min(1900).max(2200);

const toTrip = (r: Selectable<TripsTable>): Trip => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  date: r.date,
  startOdometer: r.start_odometer,
  endOdometer: r.end_odometer,
  distance: r.end_odometer - r.start_odometer,
  purpose: r.purpose,
  from: r.from_place,
  to: r.to_place,
  business: Boolean(r.business),
  notes: r.notes,
});

/** Totals for one calendar year of trips, set against what the odometer says was driven. */
export function mileageReport(
  vehicle: { id: number; odometer_unit: MileageReport['odometerUnit'] },
  year: number,
  trips: Trip[],
  readings: { date: string; odometer: number }[],
  years: number[],
): MileageReport {
  const inYear = trips.filter((t) => t.date.startsWith(`${year}-`));
  const business = inYear.filter((t) => t.business);
  const sum = (list: Trip[]) => list.reduce((s, t) => s + t.distance, 0);
  // Everything the vehicle recorded that year: readings, and both ends of every trip.
  const points = [
    ...readings.filter((r) => r.date.startsWith(`${year}-`)).map((r) => r.odometer),
    ...inYear.flatMap((t) => [t.startOdometer, t.endOdometer]),
  ];
  const start = points.length ? Math.min(...points) : null;
  const end = points.length ? Math.max(...points) : null;
  const total = start != null && end != null ? end - start : null;
  const businessDistance = sum(business);

  const months = new Map<string, { distance: number; trips: number }>();
  const purposes = new Map<string, { purpose: string; distance: number; trips: number }>();
  for (const t of business) {
    const m = months.get(t.date.slice(0, 7)) ?? { distance: 0, trips: 0 };
    m.distance += t.distance;
    m.trips++;
    months.set(t.date.slice(0, 7), m);
    const key = t.purpose.trim().toLowerCase();
    const p = purposes.get(key) ?? { purpose: t.purpose.trim(), distance: 0, trips: 0 };
    p.distance += t.distance;
    p.trips++;
    purposes.set(key, p);
  }
  return {
    vehicleId: vehicle.id,
    year,
    odometerUnit: vehicle.odometer_unit,
    trips: inYear.length,
    businessDistance,
    personalDistance: sum(inYear) - businessDistance,
    startOdometer: start,
    endOdometer: end,
    totalDistance: total,
    businessShare:
      total != null && total > 0
        ? Math.min(100, Math.round((businessDistance / total) * 1000) / 10)
        : null,
    byMonth: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({ month, ...m })),
    byPurpose: [...purposes.values()].sort((a, b) => b.distance - a.distance),
    years,
  };
}

export const tripRoutes =
  ({ db }: { db: DB }): FastifyPluginAsyncZod =>
  async (app) => {
    const all = async (vehicleId: number) =>
      (
        await db
          .selectFrom('trips')
          .selectAll()
          .where('vehicle_id', '=', vehicleId)
          .orderBy('date', 'desc')
          .orderBy('end_odometer', 'desc')
          .execute()
      ).map(toTrip);
    const load = async (req: { user: unknown; params: { id: number } }, need: 'view' | 'edit') => {
      const row = await db
        .selectFrom('trips')
        .selectAll()
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!row) throw new AppError('not_found', { entity: 'trip' });
      await requireVehicle(db, currentUser(req as never), row.vehicle_id, need);
      return row;
    };
    const columns = (t: z.infer<typeof TripInput>) => ({
      date: t.date,
      start_odometer: t.startOdometer,
      end_odometer: t.endOdometer,
      purpose: t.purpose,
      from_place: t.from ?? null,
      to_place: t.to ?? null,
      business: t.business ? 1 : 0,
      notes: t.notes ?? null,
    });
    /** The end of a trip is an odometer reading too; keep the vehicle's odometer current. */
    const logReading = async (vehicleId: number, date: string, odometer: number) => {
      const same = await db
        .selectFrom('odometer_readings')
        .select('id')
        .where('vehicle_id', '=', vehicleId)
        .where('date', '=', date)
        .where('odometer', '=', odometer)
        .executeTakeFirst();
      if (same) return;
      const ts = nowIso();
      await db
        .insertInto('odometer_readings')
        .values({ vehicle_id: vehicleId, date, odometer, created_at: ts, updated_at: ts })
        .execute();
    };
    const report = async (
      vehicleId: number,
      user: Parameters<typeof requireVehicle>[1],
      y?: number,
    ) => {
      const v = await requireVehicle(db, user, vehicleId, 'view');
      const trips = await all(v.id);
      const years = [...new Set(trips.map((t) => Number(t.date.slice(0, 4))))].sort(
        (a, b) => b - a,
      );
      const year = y ?? years[0] ?? new Date().getUTCFullYear();
      const readings = await db
        .selectFrom('odometer_readings')
        .select(['date', 'odometer'])
        .where('vehicle_id', '=', v.id)
        .where('date', '>=', `${year}-01-01`)
        .where('date', '<=', `${year}-12-31`)
        .execute();
      return { v, trips, report: mileageReport(v, year, trips, readings, years) };
    };

    app.get(
      '/vehicles/:vehicleId/trips',
      {
        schema: {
          tags,
          summary: 'Trip log, newest first',
          params: VehicleParam,
          querystring: z.object({ year: Year.optional() }),
          response: { 200: z.array(Trip), ...errors },
        },
      },
      async (req) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        const trips = await all(v.id);
        return req.query.year
          ? trips.filter((t) => t.date.startsWith(`${req.query.year}-`))
          : trips;
      },
    );

    app.post(
      '/vehicles/:vehicleId/trips',
      {
        schema: {
          tags,
          summary: 'Log a trip',
          description:
            "Start and end odometer are in the vehicle's own unit. The end reading is added to the odometer log.",
          params: VehicleParam,
          body: TripInput,
          response: { 201: Trip, ...errors },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'edit');
        const ts = nowIso();
        const row = await db
          .insertInto('trips')
          .values({
            ...columns(req.body),
            vehicle_id: v.id,
            created_by: user.id,
            created_at: ts,
            updated_at: ts,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await logReading(v.id, row.date, row.end_odometer);
        return reply.status(201).send(toTrip(row));
      },
    );

    app.patch(
      '/trips/:id',
      {
        schema: {
          tags,
          summary: 'Change a trip',
          params: IdParam,
          body: TripInput,
          response: { 200: Trip, ...errors },
        },
      },
      async (req) => {
        const existing = await load(req, 'edit');
        const row = await db
          .updateTable('trips')
          .set({ ...columns(req.body), updated_at: nowIso() })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return toTrip(row);
      },
    );

    app.delete(
      '/trips/:id',
      {
        schema: {
          tags,
          summary: 'Delete a trip',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        const existing = await load(req, 'edit');
        await db.deleteFrom('trips').where('id', '=', existing.id).execute();
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/vehicles/:vehicleId/mileage',
      {
        schema: {
          tags,
          summary: 'Yearly mileage report',
          description:
            'Business distance from the trip log, by month and by purpose, against everything the odometer says was driven that year. Defaults to the latest year with trips.',
          params: VehicleParam,
          querystring: z.object({ year: Year.optional() }),
          response: { 200: MileageReport, ...errors },
        },
      },
      async (req) => (await report(req.params.vehicleId, currentUser(req), req.query.year)).report,
    );

    app.get(
      '/vehicles/:vehicleId/mileage.csv',
      {
        schema: {
          tags,
          summary: 'A year of trips as CSV',
          description:
            'One row per trip, oldest first, with the totals a tax return asks for at the end.',
          params: VehicleParam,
          querystring: z.object({ year: Year.optional() }),
          response: { 200: z.string(), ...errors },
        },
      },
      async (req, reply) => {
        const {
          v,
          trips,
          report: r,
        } = await report(req.params.vehicleId, currentUser(req), req.query.year);
        const rows: unknown[][] = [
          [
            'date',
            'purpose',
            'from',
            'to',
            'start_odometer',
            'end_odometer',
            'distance',
            'business',
            'notes',
          ],
          ...trips
            .filter((t) => t.date.startsWith(`${r.year}-`))
            .reverse()
            .map((t) => [
              t.date,
              t.purpose,
              t.from,
              t.to,
              t.startOdometer,
              t.endOdometer,
              t.distance,
              t.business,
              t.notes,
            ]),
          [],
          ['year', r.year],
          ['unit', r.odometerUnit],
          ['business_distance', r.businessDistance],
          ['personal_distance_logged', r.personalDistance],
          ['odometer_start', r.startOdometer],
          ['odometer_end', r.endOdometer],
          ['total_distance', r.totalDistance],
          ['business_share_percent', r.businessShare],
        ];
        const name = `${v.year}-${v.make}-${v.model}-mileage-${r.year}`
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-');
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${name}.csv"`)
          .send(stringifyCsv(rows));
      },
    );
  };
