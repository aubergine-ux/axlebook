import { z } from 'zod';
import { RECORD_KINDS } from './records';

export const ReportQuery = z.object({
  vehicleId: z.coerce.number().int().positive().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Distance unit for cross-vehicle totals; defaults to the user's preference. */
  distanceUnit: z.enum(['mi', 'km']).optional(),
});

const byKind = z.object(
  Object.fromEntries(RECORD_KINDS.map((k) => [k, z.number().int()])) as Record<
    (typeof RECORD_KINDS)[number],
    z.ZodNumber
  >,
);

export const Report = z
  .object({
    distanceUnit: z.enum(['mi', 'km']),
    totals: z.object({
      cost: z.number().int(),
      byKind,
      records: z.number().int(),
      /** Distance driven in the period (from odometer readings), in distanceUnit. */
      distance: z.number(),
      /** milli-units of currency per distance unit */
      costPerDistance: z.number().nullable(),
    }),
    monthly: z.array(
      z.object({ month: z.string(), total: z.number().int() }).extend({ byKind: byKind }),
    ),
    byCategory: z.array(
      z.object({ key: z.string(), kind: z.enum(RECORD_KINDS), total: z.number().int() }),
    ),
    vehicles: z.array(
      z.object({
        id: z.number().int(),
        title: z.string(),
        odometerUnit: z.enum(['mi', 'km']),
        fuelUnit: z.enum(['gal_us', 'gal_uk', 'l']),
        cost: z.number().int(),
        distance: z.number().int(),
        averageEconomy: z.number().nullable(),
        fuelTrend: z.array(z.object({ date: z.string(), economy: z.number() })),
      }),
    ),
  })
  .meta({ id: 'Report' });
export type Report = z.infer<typeof Report>;
