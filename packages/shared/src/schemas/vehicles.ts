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

export const VEHICLE_USAGES = ['personal', 'business'] as const;
export type VehicleUsage = (typeof VEHICLE_USAGES)[number];

/**
 * The parts-and-fluids sheet: what to ask for at the parts counter. Free text, because a tire
 * size, an oil grade and a part number have nothing in common but being looked up in a hurry.
 */
export const SPEC_FIELDS = [
  'oilType',
  'oilCapacity',
  'oilFilter',
  'airFilter',
  'cabinFilter',
  'fuelFilter',
  'tireSize',
  'tirePressure',
  'wiperDriver',
  'wiperPassenger',
  'wiperRear',
  'battery',
  'sparkPlugs',
  'coolant',
  'transmissionFluid',
  'brakeFluid',
] as const;
export type SpecField = (typeof SPEC_FIELDS)[number];

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
const specText = z
  .string()
  .trim()
  .max(80)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();
/** No `.meta({ id })`: it trims, so its input and output shapes differ. */
export const VehicleSpecsInput = z.object({
  ...(Object.fromEntries(SPEC_FIELDS.map((f) => [f, specText])) as Record<
    SpecField,
    typeof specText
  >),
  /** Anything else worth writing down, as label and value. */
  other: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(80),
      }),
    )
    .max(20)
    .optional(),
});
export type VehicleSpecsInput = z.input<typeof VehicleSpecsInput>;

export const VehicleSpecs = z.object({
  ...(Object.fromEntries(SPEC_FIELDS.map((f) => [f, z.string().nullable()])) as Record<
    SpecField,
    z.ZodNullable<z.ZodString>
  >),
  other: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type VehicleSpecs = z.infer<typeof VehicleSpecs>;

export const emptySpecs = (): VehicleSpecs => ({
  ...(Object.fromEntries(SPEC_FIELDS.map((f) => [f, null])) as Record<SpecField, null>),
  other: [],
});

/** Reads stored specs, tolerating missing fields and broken JSON. */
export function parseSpecs(raw: string | null | undefined): VehicleSpecs {
  const out = emptySpecs();
  if (!raw) return out;
  try {
    const parsed = VehicleSpecsInput.safeParse(JSON.parse(raw));
    if (!parsed.success) return out;
    for (const f of SPEC_FIELDS) out[f] = parsed.data[f] ?? null;
    out.other = parsed.data.other ?? [];
  } catch {
    // Broken JSON: an empty sheet.
  }
  return out;
}

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
  /** What it's worth today (milli-units); the difference from the purchase price is depreciation. */
  currentValue: z.number().int().min(0).nullable().optional(),
  engine: optionalText(80),
  /** Defaults to personal. Business vehicles get a trip log and a mileage report. */
  usage: z.enum(VEHICLE_USAGES).optional(),
  specs: VehicleSpecsInput.optional(),
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
    currentValue: z.number().int().nullable(),
    engine: z.string().nullable(),
    usage: z.enum(VEHICLE_USAGES),
    specs: VehicleSpecs,
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
