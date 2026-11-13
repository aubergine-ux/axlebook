import { z } from 'zod';
import { ODOMETER_UNITS } from '../domain/units';
import { optionalText } from './text';
import { VEHICLE_CATEGORIES } from './vehicles';

/** What a history report shows beyond the work itself. */
export const HistoryOptions = z.object({
  showCosts: z.boolean().default(false),
  showVin: z.boolean().default(false),
  showNotes: z.boolean().default(false),
});
export type HistoryOptions = z.infer<typeof HistoryOptions>;

/**
 * A vehicle's service history as handed to a buyer: every service, repair and upgrade with its
 * date and odometer reading. Fuel fill-ups and running expenses are left out.
 */
export const VehicleHistory = z
  .object({
    vehicle: z.object({
      title: z.string(),
      category: z.enum(VEHICLE_CATEGORIES),
      year: z.number().int(),
      make: z.string(),
      model: z.string(),
      trim: z.string().nullable(),
      engine: z.string().nullable(),
      color: z.string().nullable(),
      /** Null unless the report was asked to show it. */
      vin: z.string().nullable(),
      odometerUnit: z.enum(ODOMETER_UNITS),
      currentOdometer: z.number().int().nullable(),
    }),
    currency: z.string(),
    generatedOn: z.string(),
    /** When a shared link stops working; null for no expiry or a signed-in view. */
    expiresAt: z.string().nullable(),
    options: HistoryOptions,
    records: z.array(
      z.object({
        date: z.string(),
        kind: z.enum(['service', 'repair', 'upgrade']),
        title: z.string(),
        odometer: z.number().int().nullable(),
        cost: z.number().int().nullable(),
        notes: z.string().nullable(),
      }),
    ),
    totals: z.object({
      records: z.number().int(),
      firstDate: z.string().nullable(),
      lastDate: z.string().nullable(),
      cost: z.number().int().nullable(),
    }),
  })
  .meta({ id: 'VehicleHistory' });
export type VehicleHistory = z.infer<typeof VehicleHistory>;

export const HistoryLinkInput = HistoryOptions.extend({
  label: optionalText(80),
  /** Days until the link stops working, 1–365; null for no expiry. */
  expiresInDays: z.number().int().min(1).max(365).nullable().default(30),
});
export type HistoryLinkInput = z.input<typeof HistoryLinkInput>;

export const HistoryLink = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    label: z.string().nullable(),
    url: z.string(),
    showCosts: z.boolean(),
    showVin: z.boolean(),
    showNotes: z.boolean(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    /** `active`, or why it no longer works. */
    state: z.enum(['active', 'expired', 'revoked']),
    views: z.number().int(),
    lastViewedAt: z.string().nullable(),
  })
  .meta({ id: 'HistoryLink' });
export type HistoryLink = z.infer<typeof HistoryLink>;
