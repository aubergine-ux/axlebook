import { z } from 'zod';
import { FUEL_UNITS, ODOMETER_UNITS } from '../domain/units';
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
        odometerUnit: z.enum(ODOMETER_UNITS),
        fuelUnit: z.enum(FUEL_UNITS),
        cost: z.number().int(),
        distance: z.number().int(),
        averageEconomy: z.number().nullable(),
        fuelTrend: z.array(z.object({ date: z.string(), economy: z.number() })),
      }),
    ),
  })
  .meta({ id: 'Report' });
export type Report = z.infer<typeof Report>;

/** What a vehicle's money went on, as cost-of-ownership lines. */
export const OWNERSHIP_PARTS = [
  'fuel',
  'maintenance',
  'upgrades',
  'insurance',
  'registration',
  'tax',
  'loan',
  'other',
] as const;
export type OwnershipPart = (typeof OWNERSHIP_PARTS)[number];

const parts = z.object(
  Object.fromEntries(OWNERSHIP_PARTS.map((k) => [k, z.number().int()])) as Record<
    OwnershipPart,
    z.ZodNumber
  >,
);

export const Ownership = z
  .object({
    vehicleId: z.number().int(),
    odometerUnit: z.enum(ODOMETER_UNITS),
    /** Purchase date, or the first record when that isn't set. Null with neither. */
    since: z.string().nullable(),
    months: z.number().int(),
    purchasePrice: z.number().int().nullable(),
    currentValue: z.number().int().nullable(),
    /** Purchase price minus what it's worth now; null until both are filled in. */
    depreciation: z.number().int().nullable(),
    running: parts,
    runningTotal: z.number().int(),
    /** Running costs plus depreciation (when known). */
    total: z.number().int(),
    /** Distance covered in the odometer log, in the vehicle's own unit. */
    distance: z.number().int(),
    /** milli-units of currency per odometer unit */
    costPerDistance: z.number().nullable(),
    costPerMonth: z.number().int().nullable(),
    byYear: z.array(parts.extend({ year: z.string(), total: z.number().int() })),
  })
  .meta({ id: 'Ownership' });
export type Ownership = z.infer<typeof Ownership>;
