import { z } from 'zod';
import { IsoDateString, Odometer, optionalText } from './text';

export const INSPECTION_TYPES = ['pre_trip', 'post_trip', 'annual'] as const;

/** Items from the FMCSA §396.11 DVIR list, plus common additions. */
export const TRUCK_INSPECTION_ITEMS = [
  'service_brakes',
  'parking_brake',
  'steering',
  'lights',
  'tires',
  'horn',
  'wipers',
  'mirrors',
  'coupling',
  'wheels',
  'emergency',
  'air_lines',
  'fluids',
  'exhaust',
] as const;
export const TRAILER_INSPECTION_ITEMS = [
  'service_brakes',
  'lights',
  'tires',
  'wheels',
  'coupling',
  'air_lines',
  'landing_gear',
  'suspension',
  'body',
  'cargo',
  'reefer',
] as const;
export const INSPECTION_ITEMS = [
  ...new Set([...TRUCK_INSPECTION_ITEMS, ...TRAILER_INSPECTION_ITEMS]),
] as const;
export type InspectionItem = (typeof INSPECTION_ITEMS)[number];

const ItemResult = z.object({
  item: z.enum(INSPECTION_ITEMS as unknown as [InspectionItem, ...InspectionItem[]]),
  ok: z.boolean(),
  note: optionalText(500),
});

export const InspectionInput = z.object({
  type: z.enum(INSPECTION_TYPES),
  date: IsoDateString,
  odometer: Odometer.nullable().optional(),
  inspector: optionalText(80),
  items: z.array(ItemResult).min(1).max(40),
  notes: optionalText(2000),
});
export type InspectionInput = z.input<typeof InspectionInput>;

export const Inspection = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    type: z.enum(INSPECTION_TYPES),
    date: z.string(),
    odometer: z.number().int().nullable(),
    inspector: z.string().nullable(),
    items: z.array(z.object({ item: z.string(), ok: z.boolean(), note: z.string().nullable() })),
    defects: z.number().int(),
    notes: z.string().nullable(),
    correctedAt: z.string().nullable(),
    correctedBy: z.string().nullable(),
    correctionNotes: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Inspection' });
export type Inspection = z.infer<typeof Inspection>;

export const InspectionCorrection = z.object({
  correctedBy: optionalText(80),
  correctionNotes: optionalText(2000),
});

export const IftaQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
});

export const IftaReport = z
  .object({
    year: z.number().int(),
    quarter: z.number().int(),
    from: z.string(),
    to: z.string(),
    distanceUnit: z.enum(['mi', 'km']),
    totalDistance: z.number(),
    totalFuel: z.number().int(),
    /** distance per volume unit across the quarter */
    fleetEconomy: z.number().nullable(),
    rows: z.array(
      z.object({
        jurisdiction: z.string(),
        distance: z.number(),
        /** milli-units: distance ÷ fleet economy */
        taxableFuel: z.number().int(),
        /** milli-units bought in this jurisdiction */
        purchased: z.number().int(),
        net: z.number().int(),
      }),
    ),
    /** distance travelled with no jurisdiction recorded */
    unassignedDistance: z.number(),
  })
  .meta({ id: 'IftaReport' });
export type IftaReport = z.infer<typeof IftaReport>;
