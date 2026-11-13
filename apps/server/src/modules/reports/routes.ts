import {
  ApiError,
  computeFuelEconomy,
  convertDistance,
  daysBetween,
  displayUnitsFor,
  isDistanceUnit,
  monthKey,
  OWNERSHIP_PARTS,
  Ownership,
  type OwnershipPart,
  RECORD_KINDS,
  type RecordKind,
  Report,
  ReportQuery,
  today,
  vehicleTitle,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
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

    app.get(
      '/vehicles/:vehicleId/ownership',
      {
        schema: {
          tags: ['reports'],
          summary: 'Total cost of ownership for a vehicle',
          description:
            "Everything spent since purchase, by line (fuel, maintenance, upgrades, insurance, registration, tax, loan, other) and by year, plus depreciation when the vehicle has both a purchase price and a current value. Money is milli-units; distance is in the vehicle's odometer unit.",
          params: z.object({ vehicleId: z.coerce.number().int().positive() }),
          response: { 200: Ownership, 403: ApiError, 404: ApiError },
        },
      },
      async (req) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        const records = await db
          .selectFrom('records')
          .select(['kind', 'date', 'cost', 'expense_category'])
          .where('vehicle_id', '=', v.id)
          .execute();
        const zero = () =>
          Object.fromEntries(OWNERSHIP_PARTS.map((k) => [k, 0])) as Record<OwnershipPart, number>;
        const partOf = (r: (typeof records)[number]): OwnershipPart => {
          if (r.kind === 'fuel') return 'fuel';
          if (r.kind === 'upgrade') return 'upgrades';
          if (r.kind !== 'expense') return 'maintenance';
          const c = r.expense_category;
          return c === 'insurance' || c === 'registration' || c === 'tax' || c === 'loan'
            ? c
            : 'other';
        };
        const running = zero();
        const years = new Map<string, Record<OwnershipPart, number>>();
        for (const r of records) {
          const part = partOf(r);
          running[part] += r.cost;
          const year = r.date.slice(0, 4);
          const bucket = years.get(year) ?? zero();
          bucket[part] += r.cost;
          years.set(year, bucket);
        }
        const sum = (p: Record<OwnershipPart, number>) =>
          Object.values(p).reduce((a, b) => a + b, 0);
        const runningTotal = sum(running);
        const depreciation =
          v.purchase_price != null && v.current_value != null
            ? Number(v.purchase_price) - Number(v.current_value)
            : null;
        const total = runningTotal + (depreciation ?? 0);

        const span = await db
          .selectFrom('odometer_readings')
          .select((eb) => [eb.fn.min('odometer').as('lo'), eb.fn.max('odometer').as('hi')])
          .where('vehicle_id', '=', v.id)
          .executeTakeFirst();
        const distance = span?.hi != null ? Number(span.hi) - Number(span.lo) : 0;
        const firstRecord = records.reduce<string | null>(
          (min, r) => (min == null || r.date < min ? r.date : min),
          null,
        );
        const since = v.purchase_date ?? firstRecord;
        const days = since ? daysBetween(since, today(config.timeZone)) : 0;
        const months = since ? Math.max(1, Math.round(days / 30.44)) : 0;
        return {
          vehicleId: v.id,
          odometerUnit: v.odometer_unit,
          since,
          months,
          purchasePrice: v.purchase_price == null ? null : Number(v.purchase_price),
          currentValue: v.current_value == null ? null : Number(v.current_value),
          depreciation,
          running,
          runningTotal,
          total,
          distance,
          costPerDistance: distance > 0 ? total / distance : null,
          costPerMonth: months > 0 ? Math.round(total / months) : null,
          byYear: [...years.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([year, p]) => ({ year, ...p, total: sum(p) })),
        };
      },
    );
  };
