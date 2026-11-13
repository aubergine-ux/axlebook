import { z } from 'zod';
import { ODOMETER_UNITS } from '../domain/units';
import { IsoDateString, Odometer, optionalText } from './text';

/** No `.meta({ id })`: it trims, so its input and output shapes differ. */
export const TripInput = z
  .object({
    date: IsoDateString,
    startOdometer: Odometer,
    endOdometer: Odometer,
    purpose: z.string().trim().min(1).max(200),
    from: optionalText(120),
    to: optionalText(120),
    /** False for a personal trip in a business vehicle; it counts toward the total, not the claim. */
    business: z.boolean().default(true),
    notes: optionalText(2000),
  })
  .superRefine((t, ctx) => {
    if (t.endOdometer < t.startOdometer)
      ctx.addIssue({ code: 'custom', path: ['endOdometer'], message: 'before_start' });
  });
export type TripInput = z.input<typeof TripInput>;

export const Trip = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    date: z.string(),
    startOdometer: z.number().int(),
    endOdometer: z.number().int(),
    distance: z.number().int(),
    purpose: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    business: z.boolean(),
    notes: z.string().nullable(),
  })
  .meta({ id: 'Trip' });
export type Trip = z.infer<typeof Trip>;

/** A year of driving for the tax return. Distances are in the vehicle's odometer unit. */
export const MileageReport = z
  .object({
    vehicleId: z.number().int(),
    year: z.number().int(),
    odometerUnit: z.enum(ODOMETER_UNITS),
    trips: z.number().int(),
    businessDistance: z.number().int(),
    /** Logged trips marked personal. */
    personalDistance: z.number().int(),
    /** First and last odometer readings of the year, and the distance between them. */
    startOdometer: z.number().int().nullable(),
    endOdometer: z.number().int().nullable(),
    totalDistance: z.number().int().nullable(),
    /** Business distance as a share of everything driven that year, 0–100. */
    businessShare: z.number().nullable(),
    byMonth: z.array(
      z.object({ month: z.string(), distance: z.number().int(), trips: z.number().int() }),
    ),
    byPurpose: z.array(
      z.object({ purpose: z.string(), distance: z.number().int(), trips: z.number().int() }),
    ),
    /** Years that have trips, newest first. */
    years: z.array(z.number().int()),
  })
  .meta({ id: 'MileageReport' });
export type MileageReport = z.infer<typeof MileageReport>;

export const DOCUMENT_TYPES = [
  'registration',
  'insurance',
  'dot_inspection',
  'permit',
  'emissions',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DocumentInput = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1).max(120),
  /** Policy, plate, permit or certificate number. */
  number: optionalText(80),
  expiresOn: IsoDateString.nullable().optional(),
  notes: optionalText(2000),
});
export type DocumentInput = z.input<typeof DocumentInput>;

export const VehicleDocument = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    vehicleTitle: z.string(),
    type: z.enum(DOCUMENT_TYPES),
    title: z.string(),
    number: z.string().nullable(),
    expiresOn: z.string().nullable(),
    notes: z.string().nullable(),
    /** `overdue` means expired. Documents with no expiry are always `upcoming`. */
    status: z.enum(['overdue', 'due_soon', 'upcoming']),
    daysLeft: z.number().int().nullable(),
    file: z
      .object({ name: z.string(), mimeType: z.string(), size: z.number().int(), url: z.string() })
      .nullable(),
    canEdit: z.boolean(),
  })
  .meta({ id: 'VehicleDocument' });
export type VehicleDocument = z.infer<typeof VehicleDocument>;
