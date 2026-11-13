import { GarageStatus, today, type VehicleStatus } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import { getInstanceSettings } from '../../lib/instance-settings';
import { VERSION } from '../../lib/version';
import { currentUser } from '../../plugins/auth';
import { presentDocuments } from '../documents/routes';
import type { ReminderService } from '../reminders/service';
import type { VehicleService } from '../vehicles/service';

/**
 * A compact status for each vehicle, made for polling: Home Assistant (see
 * integrations/home-assistant), a dashboard, a script. Everything here is also available through
 * the ordinary routes; this saves a client from stitching five of them together.
 */
export const integrationRoutes =
  ({
    db,
    config,
    vehicles,
    reminders,
  }: {
    db: DB;
    config: Config;
    vehicles: VehicleService;
    reminders: ReminderService;
  }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/status',
      {
        schema: {
          tags: ['integrations'],
          summary: 'Odometer, next service and alerts for every vehicle in your garage',
          description:
            'Meant for polling with an API token (`Authorization: Bearer axb_…`): one request returns what a dashboard or home-automation sensor needs. Archived vehicles are left out.',
          response: { 200: GarageStatus },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const garage = await vehicles.list(user, 'false');
        const { currency, soonDays } = await getInstanceSettings(db, config);
        if (garage.length === 0) return { version: VERSION, currency, vehicles: [] };
        const ids = garage.map((v) => v.id);
        const all = await reminders.listAll(user);
        const rows = await db.selectFrom('vehicles').selectAll().where('id', 'in', ids).execute();
        const documents = presentDocuments(
          await db
            .selectFrom('vehicle_documents')
            .selectAll()
            .where('vehicle_id', 'in', ids)
            .where('expires_on', 'is not', null)
            .execute(),
          new Map(rows.map((r) => [r.id, r])),
          new Map(),
          today(config.timeZone),
          soonDays,
        );
        const recalls = await db
          .selectFrom('recalls')
          .select(['vehicle_id'])
          .where('vehicle_id', 'in', ids)
          .where('state', '=', 'open')
          .execute();

        return {
          version: VERSION,
          currency,
          vehicles: garage.map((v): VehicleStatus => {
            // listAll is sorted most urgent first.
            const mine = all.filter((r) => r.vehicleId === v.id);
            const next = mine[0];
            const overdue = mine.filter((r) => r.status === 'overdue').length;
            const dueSoon = mine.filter((r) => r.status === 'due_soon').length;
            const documentsExpiring = documents.filter(
              (d) => d.vehicleId === v.id && d.status !== 'upcoming',
            ).length;
            const openRecalls = recalls.filter((r) => r.vehicle_id === v.id).length;
            return {
              id: v.id,
              name: v.nickname ?? `${v.year} ${v.make} ${v.model}`,
              category: v.category,
              odometer: v.currentOdometer,
              odometerUnit: v.odometerUnit,
              nextService:
                next && next.status !== 'inactive'
                  ? {
                      title: next.title,
                      status: next.status,
                      dueDate: next.predictedDueDate,
                      daysLeft: next.daysLeft,
                      distanceLeft: next.distanceLeft,
                    }
                  : null,
              overdue,
              dueSoon,
              documentsExpiring,
              openRecalls,
              needsAttention: overdue + dueSoon + documentsExpiring + openRecalls > 0,
              costToDate: v.costToDate,
            };
          }),
        };
      },
    );
  };
