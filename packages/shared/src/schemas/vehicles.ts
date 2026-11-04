import { z } from 'zod';
import { FUEL_UNITS, ODOMETER_UNITS } from '../domain/units';

export const FUEL_TYPES = [
  'gasoline',
  'diesel',
  'hybrid',
  'plugin_hybrid',
  'electric',
  'flex',
  'lpg',
  'cng',
  'other',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const VEHICLE_CATEGORIES = [
  'car',
  'motorcycle',
  'dirtbike',
  'atv',
  'snowmobile',
  'semi',
  'trailer',
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];
/** Garage sections: everyday vehicles, powersports, and commercial trucks. */
export const VEHICLE_SECTIONS = {
  car: ['car'],
  powersports: ['motorcycle', 'dirtbike', 'atv', 'snowmobile'],
  commercial: ['semi', 'trailer'],
} as const satisfies Record<string, readonly VehicleCategory[]>;
export type VehicleSection = keyof typeof VEHICLE_SECTIONS;
export const sectionOf = (c: VehicleCategory): VehicleSection =>
  (Object.entries(VEHICLE_SECTIONS).find(([, cats]) =>
    (cats as readonly string[]).includes(c),
  )?.[0] ?? 'car') as VehicleSection;
/** Commercial vehicles get DVIR inspections and the IFTA worksheet. */
export const isCommercial = (c: VehicleCategory) => sectionOf(c) === 'commercial';

const MAX_YEAR = new Date().getFullYear() + 2;
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/**
 * Body for creating a vehicle. Money is integer milli-units.
 * No `.meta({ id })`: schemas with transforms have different input/output shapes,
 * which collide as named OpenAPI components. Leave them inline.
 */
export const VehicleInput = z.object({
  /** Defaults to car. Not a Zod default: `.partial()` for PATCH would re-apply it. */
  category: z.enum(VEHICLE_CATEGORIES).optional(),
  year: z.number().int().min(1886).max(MAX_YEAR),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  trim: optionalText(60),
  nickname: optionalText(60),
  /** Fleet or unit number, mostly for semi trucks and trailers. */
  unitNumber: optionalText(20),
  vin: optionalText(32),
  licensePlate: optionalText(20),
  color: optionalText(40),
  odometerUnit: z.enum(ODOMETER_UNITS),
  fuelUnit: z.enum(FUEL_UNITS),
  fuelType: z.enum(FUEL_TYPES),
  purchaseDate: z.iso.date().nullable().optional(),
  purchasePrice: z.number().int().min(0).nullable().optional(),
  notes: optionalText(4000),
});
export type VehicleInput = z.input<typeof VehicleInput>;

export const VehicleUpdate = VehicleInput.partial();
export type VehicleUpdate = z.input<typeof VehicleUpdate>;

export const Vehicle = z
  .object({
    id: z.number().int(),
    ownerId: z.number().int(),
    category: z.enum(VEHICLE_CATEGORIES),
    year: z.number().int(),
    make: z.string(),
    model: z.string(),
    trim: z.string().nullable(),
    nickname: z.string().nullable(),
    unitNumber: z.string().nullable(),
    vin: z.string().nullable(),
    licensePlate: z.string().nullable(),
    color: z.string().nullable(),
    odometerUnit: z.enum(ODOMETER_UNITS),
    fuelUnit: z.enum(FUEL_UNITS),
    fuelType: z.enum(FUEL_TYPES),
    purchaseDate: z.string().nullable(),
    purchasePrice: z.number().int().nullable(),
    notes: z.string().nullable(),
    /** Relative URL of the photo, or null. Changes whenever the photo changes. */
    photoUrl: z.string().nullable(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** What the current user may do with this vehicle. */
    access: z.enum(['view', 'edit', 'owner']),
  })
  .meta({ id: 'Vehicle' });
export type Vehicle = z.infer<typeof Vehicle>;

/** Garage card data: the vehicle plus computed figures. */
export const VehicleSummary = Vehicle.extend({
  currentOdometer: z.number().int().nullable(),
  costToDate: z.number().int(),
  nextReminder: z
    .object({
      id: z.number().int(),
      title: z.string(),
      status: z.enum(['upcoming', 'due_soon', 'overdue']),
      dueDate: z.string().nullable(),
      dueOdometer: z.number().int().nullable(),
    })
    .nullable(),
}).meta({ id: 'VehicleSummary' });
export type VehicleSummary = z.infer<typeof VehicleSummary>;

export const VehicleListQuery = z.object({
  archived: z.enum(['false', 'true', 'all']).default('false'),
  section: z.enum(['car', 'powersports', 'commercial']).optional(),
});

/** "2015 Toyota Tacoma SR5" */
export function vehicleTitle(v: Pick<Vehicle, 'year' | 'make' | 'model' | 'trim'>): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
}
