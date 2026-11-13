import { z } from 'zod';
import { FUEL_TYPES, VEHICLE_CATEGORIES } from './vehicles';

/** A VIN is 17 characters and never contains I, O or Q. */
export const Vin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/);

/** What a VIN says about a vehicle. Anything the decoder doesn't know is null. */
export const VinDecoded = z
  .object({
    vin: z.string(),
    year: z.number().int().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    trim: z.string().nullable(),
    engine: z.string().nullable(),
    fuelType: z.enum(FUEL_TYPES).nullable(),
    category: z.enum(VEHICLE_CATEGORIES).nullable(),
  })
  .meta({ id: 'VinDecoded' });
export type VinDecoded = z.infer<typeof VinDecoded>;

export const RECALL_STATES = ['open', 'completed', 'dismissed'] as const;
export type RecallState = (typeof RECALL_STATES)[number];

export const Recall = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    /** NHTSA campaign number, e.g. 23V123000. */
    campaign: z.string(),
    component: z.string().nullable(),
    summary: z.string().nullable(),
    consequence: z.string().nullable(),
    remedy: z.string().nullable(),
    reportDate: z.string().nullable(),
    state: z.enum(RECALL_STATES),
    stateAt: z.string().nullable(),
  })
  .meta({ id: 'Recall' });
export type Recall = z.infer<typeof Recall>;

export const VehicleRecalls = z
  .object({
    /** Looking things up online is switched on for this server. */
    enabled: z.boolean(),
    checkedAt: z.string().nullable(),
    recalls: z.array(Recall),
  })
  .meta({ id: 'VehicleRecalls' });
export type VehicleRecalls = z.infer<typeof VehicleRecalls>;
