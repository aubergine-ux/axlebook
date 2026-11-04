import {
  ApiError,
  displayUnitsFor,
  IdParam,
  IftaQuery,
  IftaReport,
  Inspection,
  InspectionCorrection,
  InspectionInput,
  isCommercial,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { InspectionsTable } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { currentUser } from '../../plugins/auth';
import { garageVehicleIds, requireVehicle } from '../vehicles/access';
import { iftaWorksheet, quarterRange } from './ifta';

const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

type Row = Selectable<InspectionsTable>;
const dto = (r: Row): Inspection => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  type: r.type,
  date: r.date,
  odometer: r.odometer,
  inspector: r.inspector,
  items: JSON.parse(r.items),
  defects: r.defects,
  notes: r.notes,
  correctedAt: r.corrected_at,
  correctedBy: r.corrected_by,
  correctionNotes: r.correction_notes,
  createdAt: r.created_at,
});

export const commercialRoutes =
  ({ db, config }: { db: DB; config: Config }): FastifyPluginAsyncZod =>
  async (app) => {
    // ── DVIR inspections ──────────────────────────────────────────────────
    const tags = ['inspections'];
    app.get(
      '/vehicles/:vehicleId/inspections',
      {
        schema: {
          tags,
          summary: 'Inspection reports (DVIR), newest first',
          params: VehicleParam,
          response: { 200: z.array(Inspection), ...errors },
        },
      },
      async (req) => {
        await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        const rows = await db
          .selectFrom('inspections')
          .selectAll()
          .where('vehicle_id', '=', req.params.vehicleId)
          .orderBy('date', 'desc')
          .orderBy('id', 'desc')
          .execute();
        return rows.map(dto);
      },
    );
    app.post(
      '/vehicles/:vehicleId/inspections',
      {
        schema: {
          tags,
          summary: 'Record an inspection (pre-trip, post-trip or annual)',
          description:
            'Each item is OK or a defect with a note. Defects stay open until marked corrected.',
          params: VehicleParam,
          body: InspectionInput,
          response: { 201: Inspection, ...errors },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        await requireVehicle(db, user, req.params.vehicleId, 'edit');
        const b = req.body;
        const items = b.items.map((i) => ({
          item: i.item,
          ok: i.ok,
          note: i.ok ? null : (i.note ?? null),
        }));
        const row = await db
          .insertInto('inspections')
          .values({
            vehicle_id: req.params.vehicleId,
            type: b.type,
            date: b.date,
            odometer: b.odometer ?? null,
            inspector: b.inspector ?? user.display_name ?? user.username,
            items: JSON.stringify(items),
            defects: items.filter((i) => !i.ok).length,
            notes: b.notes ?? null,
            created_by: user.id,
            created_at: nowIso(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send(dto(row as Row));
      },
    );
    const load = async (req: { params: { id: number }; user: unknown }) => {
      const row = await db
        .selectFrom('inspections')
        .selectAll()
        .where('id', '=', req.params.id)
        .executeTakeFirst();
      if (!row) throw new AppError('not_found', { entity: 'inspection' });
      await requireVehicle(db, currentUser(req as never), row.vehicle_id, 'edit');
      return row;
    };
    app.post(
      '/inspections/:id/correct',
      {
        schema: {
          tags,
          summary: 'Mark the defects on an inspection corrected',
          params: IdParam,
          body: InspectionCorrection,
          response: { 200: Inspection, ...errors },
        },
      },
      async (req) => {
        const row = await load(req);
        if (row.defects === 0) throw new AppError('conflict', { reason: 'no_defects' });
        const user = currentUser(req);
        const updated = await db
          .updateTable('inspections')
          .set({
            corrected_at: nowIso(),
            corrected_by: req.body.correctedBy ?? user.display_name ?? user.username,
            correction_notes: req.body.correctionNotes ?? null,
          })
          .where('id', '=', row.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return dto(updated as Row);
      },
    );
    app.delete(
      '/inspections/:id',
      {
        schema: {
          tags,
          summary: 'Delete an inspection',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await load(req);
        await db.deleteFrom('inspections').where('id', '=', req.params.id).execute();
        return reply.status(204).send(null);
      },
    );

    // ── IFTA worksheet ────────────────────────────────────────────────────
    app.get(
      '/ifta',
      {
        schema: {
          tags: ['ifta'],
          summary: 'IFTA worksheet: distance and fuel by jurisdiction for a quarter',
          description:
            'Covers the semi trucks in your garage (or one, with `vehicleId`). Distance comes from odometer readings with a jurisdiction (fill-ups count); fuel from fill-ups. Volumes are milli-units of your unit preference.',
          querystring: IftaQuery.extend({
            vehicleId: z.coerce.number().int().positive().optional(),
          }),
          response: { 200: IftaReport, ...errors },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const ids = req.query.vehicleId
          ? [(await requireVehicle(db, user, req.query.vehicleId, 'view')).id]
          : [...(await garageVehicleIds(db, user)).keys()];
        const vehicles = ids.length
          ? (
              await db
                .selectFrom('vehicles')
                .select(['id', 'category', 'odometer_unit', 'fuel_unit'])
                .where('id', 'in', ids)
                .execute()
            ).filter((v) => isCommercial(v.category))
          : [];
        const vIds = vehicles.map((v) => v.id);
        const range = quarterRange(req.query.year, req.query.quarter);
        const units = displayUnitsFor(user.unit_system ?? config.defaults.unitSystem);
        const readings = vIds.length
          ? await db
              .selectFrom('odometer_readings')
              .select(['vehicle_id', 'date', 'odometer', 'jurisdiction'])
              .where('vehicle_id', 'in', vIds)
              .execute()
          : [];
        const fuel = vIds.length
          ? await db
              .selectFrom('records')
              .select(['vehicle_id', 'date', 'fuel_volume', 'jurisdiction'])
              .where('vehicle_id', 'in', vIds)
              .where('kind', '=', 'fuel')
              .where('date', '>=', range.from)
              .where('date', '<=', range.to)
              .execute()
          : [];
        const sheet = iftaWorksheet(
          vehicles.map((v) => ({ id: v.id, odometerUnit: v.odometer_unit, fuelUnit: v.fuel_unit })),
          readings.map((r) => ({
            vehicleId: r.vehicle_id,
            date: r.date,
            odometer: r.odometer,
            jurisdiction: r.jurisdiction ?? null,
          })),
          fuel.map((f) => ({
            vehicleId: f.vehicle_id,
            date: f.date,
            volume: f.fuel_volume ?? 0,
            jurisdiction: f.jurisdiction,
          })),
          range,
          { distance: units.distance, volume: units.volume },
        );
        return {
          year: req.query.year,
          quarter: req.query.quarter,
          ...range,
          distanceUnit: units.distance,
          ...sheet,
        };
      },
    );
  };
