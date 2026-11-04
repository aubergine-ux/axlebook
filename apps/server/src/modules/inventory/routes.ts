import {
  ApiError,
  IdParam,
  LogRecord,
  Part,
  PartInput,
  PlanConvertInput,
  PlanItem,
  PlanItemInput,
  vehicleTitle,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import type { PartRow, PlanItemRow, User } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { currentUser, requireWriter } from '../../plugins/auth';
import type { RecordService } from '../records/service';
import { garageVehicleIds, requireVehicle } from '../vehicles/access';

const errors = { 400: ApiError, 403: ApiError, 404: ApiError };
const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });

const planDto = (r: PlanItemRow): PlanItem => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  title: r.title,
  description: r.description,
  kind: r.kind,
  priority: r.priority,
  status: r.status,
  estimatedCost: r.estimated_cost,
  targetDate: r.target_date,
  convertedRecordId: r.converted_record_id,
  createdAt: r.created_at,
});

export const inventoryRoutes =
  ({ db, records }: { db: DB; records: RecordService }): FastifyPluginAsyncZod =>
  async (app) => {
    // ── Parts ────────────────────────────────────────────────────────────

    /** Parts belong to a person; vehicle owners' parts are usable on shared vehicles. */
    async function partsVisibleTo(user: User): Promise<PartRow[]> {
      return db
        .selectFrom('parts')
        .selectAll()
        .where('owner_id', '=', user.id)
        .orderBy('name')
        .execute();
    }
    async function partDtos(rows: PartRow[]): Promise<Part[]> {
      const vIds = [
        ...new Set(rows.map((r) => r.vehicle_id).filter((v): v is number => v != null)),
      ];
      const vehicles = vIds.length
        ? await db.selectFrom('vehicles').selectAll().where('id', 'in', vIds).execute()
        : [];
      const titles = new Map(vehicles.map((v) => [v.id, v.nickname ?? vehicleTitle(v)]));
      return rows.map((r) => ({
        id: r.id,
        vehicleId: r.vehicle_id,
        vehicleTitle: r.vehicle_id ? (titles.get(r.vehicle_id) ?? null) : null,
        name: r.name,
        partNumber: r.part_number,
        manufacturer: r.manufacturer,
        quantity: r.quantity,
        unitCost: r.unit_cost,
        location: r.location,
        notes: r.notes,
        updatedAt: r.updated_at,
      }));
    }
    async function loadPart(user: User, id: number) {
      const row = await db.selectFrom('parts').selectAll().where('id', '=', id).executeTakeFirst();
      if (!row || row.owner_id !== user.id) throw new AppError('not_found', { entity: 'part' });
      return row;
    }
    async function checkVehicle(user: User, vehicleId: number | null | undefined) {
      if (vehicleId) await requireVehicle(db, user, vehicleId, 'edit');
    }

    app.get(
      '/parts',
      {
        schema: {
          tags: ['parts'],
          summary: 'Your parts and supplies',
          description:
            "Add `vehicleId` to see parts for that vehicle plus garage-wide supplies; for a shared vehicle this includes its owner's stock.",
          querystring: z.object({ vehicleId: z.coerce.number().int().positive().optional() }),
          response: { 200: z.array(Part) },
        },
      },
      async (req) => {
        const user = currentUser(req);
        if (!req.query.vehicleId) return partDtos(await partsVisibleTo(user));
        const v = await requireVehicle(db, user, req.query.vehicleId, 'view');
        const owners = [...new Set([user.id, v.owner_id])];
        const rows = await db
          .selectFrom('parts')
          .selectAll()
          .where('owner_id', 'in', owners)
          .where((eb) => eb.or([eb('vehicle_id', 'is', null), eb('vehicle_id', '=', v.id)]))
          .orderBy('name')
          .execute();
        return partDtos(rows);
      },
    );
    app.post(
      '/parts',
      {
        schema: {
          tags: ['parts'],
          summary: 'Add a part',
          body: PartInput,
          response: { 201: Part, ...errors },
        },
      },
      async (req, reply) => {
        const user = requireWriter(req);
        await checkVehicle(user, req.body.vehicleId);
        const ts = nowIso();
        const b = req.body;
        const row = await db
          .insertInto('parts')
          .values({
            owner_id: user.id,
            vehicle_id: b.vehicleId ?? null,
            name: b.name,
            part_number: b.partNumber ?? null,
            manufacturer: b.manufacturer ?? null,
            quantity: b.quantity,
            unit_cost: b.unitCost ?? null,
            location: b.location ?? null,
            notes: b.notes ?? null,
            created_at: ts,
            updated_at: ts,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send((await partDtos([row]))[0] as Part);
      },
    );
    app.put(
      '/parts/:id',
      {
        schema: {
          tags: ['parts'],
          summary: 'Update a part',
          params: IdParam,
          body: PartInput,
          response: { 200: Part, ...errors },
        },
      },
      async (req) => {
        const user = requireWriter(req);
        await loadPart(user, req.params.id);
        await checkVehicle(user, req.body.vehicleId);
        const b = req.body;
        const row = await db
          .updateTable('parts')
          .set({
            vehicle_id: b.vehicleId ?? null,
            name: b.name,
            part_number: b.partNumber ?? null,
            manufacturer: b.manufacturer ?? null,
            quantity: b.quantity,
            unit_cost: b.unitCost ?? null,
            location: b.location ?? null,
            notes: b.notes ?? null,
            updated_at: nowIso(),
          })
          .where('id', '=', req.params.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return (await partDtos([row]))[0] as Part;
      },
    );
    app.post(
      '/parts/:id/adjust',
      {
        schema: {
          tags: ['parts'],
          summary: 'Add or remove stock',
          description: '`delta` is in milli-units: 1000 adds one, -500 removes half.',
          params: IdParam,
          body: z.object({ delta: z.number().int() }),
          response: { 200: Part, ...errors },
        },
      },
      async (req) => {
        const user = requireWriter(req);
        await loadPart(user, req.params.id);
        const row = await db
          .updateTable('parts')
          .set((eb) => ({ quantity: eb('quantity', '+', req.body.delta), updated_at: nowIso() }))
          .where('id', '=', req.params.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return (await partDtos([row]))[0] as Part;
      },
    );
    app.delete(
      '/parts/:id',
      {
        schema: {
          tags: ['parts'],
          summary: 'Delete a part',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        const user = requireWriter(req);
        await loadPart(user, req.params.id);
        await db.deleteFrom('parts').where('id', '=', req.params.id).execute();
        return reply.status(204).send(null);
      },
    );

    // ── Planner ──────────────────────────────────────────────────────────

    app.get(
      '/vehicles/:vehicleId/plan',
      {
        schema: {
          tags: ['planner'],
          summary: "A vehicle's planned jobs",
          params: VehicleParam,
          response: { 200: z.array(PlanItem), ...errors },
        },
      },
      async (req) => {
        await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        const rows = await db
          .selectFrom('plan_items')
          .selectAll()
          .where('vehicle_id', '=', req.params.vehicleId)
          .orderBy('created_at', 'desc')
          .execute();
        return rows.map(planDto);
      },
    );
    app.get(
      '/plan',
      {
        schema: {
          tags: ['planner'],
          summary: 'Open jobs across your garage',
          response: { 200: z.array(PlanItem) },
        },
      },
      async (req) => {
        const ids = [...(await garageVehicleIds(db, currentUser(req))).keys()];
        if (!ids.length) return [];
        const rows = await db
          .selectFrom('plan_items')
          .selectAll()
          .where('vehicle_id', 'in', ids)
          .where('status', '!=', 'done')
          .orderBy('created_at', 'desc')
          .execute();
        return rows.map(planDto);
      },
    );
    app.post(
      '/vehicles/:vehicleId/plan',
      {
        schema: {
          tags: ['planner'],
          summary: 'Plan a job',
          params: VehicleParam,
          body: PlanItemInput,
          response: { 201: PlanItem, ...errors },
        },
      },
      async (req, reply) => {
        await requireVehicle(db, currentUser(req), req.params.vehicleId, 'edit');
        const ts = nowIso();
        const b = req.body;
        const row = await db
          .insertInto('plan_items')
          .values({
            vehicle_id: req.params.vehicleId,
            title: b.title,
            description: b.description ?? null,
            kind: b.kind,
            priority: b.priority,
            status: b.status,
            estimated_cost: b.estimatedCost ?? null,
            target_date: b.targetDate ?? null,
            created_at: ts,
            updated_at: ts,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send(planDto(row));
      },
    );
    async function loadPlan(user: User, id: number) {
      const row = await db
        .selectFrom('plan_items')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw new AppError('not_found', { entity: 'plan_item' });
      await requireVehicle(db, user, row.vehicle_id, 'edit');
      return row;
    }
    app.put(
      '/plan/:id',
      {
        schema: {
          tags: ['planner'],
          summary: 'Update a planned job',
          params: IdParam,
          body: PlanItemInput,
          response: { 200: PlanItem, ...errors },
        },
      },
      async (req) => {
        await loadPlan(currentUser(req), req.params.id);
        const b = req.body;
        const row = await db
          .updateTable('plan_items')
          .set({
            title: b.title,
            description: b.description ?? null,
            kind: b.kind,
            priority: b.priority,
            status: b.status,
            estimated_cost: b.estimatedCost ?? null,
            target_date: b.targetDate ?? null,
            updated_at: nowIso(),
          })
          .where('id', '=', req.params.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return planDto(row);
      },
    );
    app.delete(
      '/plan/:id',
      {
        schema: {
          tags: ['planner'],
          summary: 'Delete a planned job',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await loadPlan(currentUser(req), req.params.id);
        await db.deleteFrom('plan_items').where('id', '=', req.params.id).execute();
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/plan/:id/convert',
      {
        schema: {
          tags: ['planner'],
          summary: 'Turn a planned job into a record',
          description:
            'Creates a record from the job (cost defaults to the estimate) and marks the job done.',
          params: IdParam,
          body: PlanConvertInput,
          response: { 201: z.object({ plan: PlanItem, record: LogRecord }), ...errors },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        const item = await loadPlan(user, req.params.id);
        if (item.converted_record_id)
          throw new AppError('conflict', { reason: 'already_converted' });
        const record = await records.create(user, item.vehicle_id, {
          kind: item.kind,
          date: req.body.date,
          odometer: req.body.odometer ?? null,
          title: item.title,
          notes: item.description,
          cost: req.body.cost ?? item.estimated_cost ?? 0,
        });
        const row = await db
          .updateTable('plan_items')
          .set({ status: 'done', converted_record_id: record.id, updated_at: nowIso() })
          .where('id', '=', item.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send({ plan: planDto(row), record });
      },
    );
  };
