import {
  computeFuelEconomy,
  convertDistance,
  displayUnitsFor,
  isDistanceUnit,
  monthKey,
  RECORD_KINDS,
  type RecordKind,
  Report,
  ReportQuery,
  vehicleTitle,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import { currentUser } from '../../plugins/auth';
import { garageVehicleIds, requireVehicle } from '../vehicles/access';

const zeroKinds = () =>
  Object.fromEntries(RECORD_KINDS.map((k) => [k, 0])) as Record<RecordKind, number>;

export const reportRoutes =
  ({ db, config }: { db: DB; config: Config }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/reports',
      {
        schema: {
          tags: ['reports'],
          summary: 'Costs, distance and fuel economy for a period',
          description:
            'Without `vehicleId`, covers every vehicle in your garage. Distances are converted to `distanceUnit` (default: your unit preference). Money is milli-units.',
          querystring: ReportQuery,
          response: { 200: Report },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const unit =
          req.query.distanceUnit ??
          displayUnitsFor(user.unit_system ?? config.defaults.unitSystem).distance;
        const ids = req.query.vehicleId
          ? [(await requireVehicle(db, user, req.query.vehicleId, 'view')).id]
          : [...(await garageVehicleIds(db, user)).keys()];
        const empty = {
          distanceUnit: unit,
          totals: { cost: 0, byKind: zeroKinds(), records: 0, distance: 0, costPerDistance: null },
          monthly: [],
          byCategory: [],
          vehicles: [],
        };
        if (ids.length === 0) return empty;

        const vehicles = await db
          .selectFrom('vehicles')
          .selectAll()
          .where('id', 'in', ids)
          .orderBy('year', 'desc')
          .execute();
        let rq = db
          .selectFrom('records')
          .select([
            'vehicle_id',
            'kind',
            'date',
            'odometer',
            'cost',
            'expense_category',
            'fuel_volume',
            'is_full',
            'missed_previous',
            'id',
          ])
          .where('vehicle_id', 'in', ids);
        if (req.query.from) rq = rq.where('date', '>=', req.query.from);
        if (req.query.to) rq = rq.where('date', '<=', req.query.to);
        const records = await rq.execute();

        let oq = db
          .selectFrom('odometer_readings')
          .select((eb) => [
            'vehicle_id',
            eb.fn.min('odometer').as('lo'),
            eb.fn.max('odometer').as('hi'),
          ])
          .where('vehicle_id', 'in', ids)
          .groupBy('vehicle_id');
        if (req.query.from) oq = oq.where('date', '>=', req.query.from);
        if (req.query.to) oq = oq.where('date', '<=', req.query.to);
        const spans = new Map(
          (await oq.execute()).map((r) => [r.vehicle_id, Number(r.hi) - Number(r.lo)]),
        );

        const totals = {
          cost: 0,
          byKind: zeroKinds(),
          records: records.length,
          distance: 0,
          costPerDistance: null as number | null,
        };
        const monthly = new Map<string, Record<RecordKind, number>>();
        const categories = new Map<string, { key: string; kind: RecordKind; total: number }>();
        for (const r of records) {
          totals.cost += r.cost;
          totals.byKind[r.kind] += r.cost;
          const m = monthKey(r.date);
          const bucket = monthly.get(m) ?? zeroKinds();
          bucket[r.kind] += r.cost;
          monthly.set(m, bucket);
          const key = r.kind === 'expense' ? (r.expense_category ?? 'other') : r.kind;
          const c = categories.get(`${r.kind}:${key}`) ?? { key, kind: r.kind, total: 0 };
          c.total += r.cost;
          categories.set(`${r.kind}:${key}`, c);
        }

        const vehicleStats = vehicles.map((v) => {
          const own = records.filter((r) => r.vehicle_id === v.id);
          const fills = own
            .filter((r) => r.kind === 'fuel' && r.odometer != null && r.fuel_volume != null)
            .map((r) => ({
              id: r.id,
              date: r.date,
              odometer: r.odometer as number,
              volume: r.fuel_volume as number,
              isFull: Boolean(r.is_full),
              missedPrevious: Boolean(r.missed_previous),
            }));
          const econ = computeFuelEconomy(fills);
          const dates = new Map(fills.map((f) => [f.id, f.date]));
          const distance = spans.get(v.id) ?? 0;
          // Hour meters can't be added to a distance total.
          if (isDistanceUnit(v.odometer_unit))
            totals.distance += convertDistance(distance, v.odometer_unit, unit);
          return {
            id: v.id,
            title: v.nickname ?? vehicleTitle(v),
            odometerUnit: v.odometer_unit,
            fuelUnit: v.fuel_unit,
            cost: own.reduce((s, r) => s + r.cost, 0),
            distance,
            averageEconomy: econ.average,
            fuelTrend: econ.fills
              .filter((f) => f.status === 'ok' && f.economy != null)
              .map((f) => ({ date: dates.get(f.id) as string, economy: f.economy as number }))
              .sort((a, b) => a.date.localeCompare(b.date)),
          };
        });
        totals.distance = Math.round(totals.distance * 10) / 10;
        totals.costPerDistance = totals.distance > 0 ? totals.cost / totals.distance : null;

        return {
          distanceUnit: unit,
          totals,
          monthly: [...monthly.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, byKind]) => ({
              month,
              total: Object.values(byKind).reduce((s, n) => s + n, 0),
              byKind,
            })),
          byCategory: [...categories.values()].sort((a, b) => b.total - a.total),
          vehicles: vehicleStats,
        };
      },
    );
  };
