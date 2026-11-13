import { z } from 'zod';
import { ODOMETER_UNITS } from '../domain/units';
import { VEHICLE_CATEGORIES } from './vehicles';

/** One vehicle as a home-automation system wants it: a few numbers and whether anything is due. */
export const VehicleStatus = z
  .object({
    id: z.number().int(),
    name: z.string(),
    category: z.enum(VEHICLE_CATEGORIES),
    odometer: z.number().int().nullable(),
    odometerUnit: z.enum(ODOMETER_UNITS),
    /** The most urgent reminder, if there is one. */
    nextService: z
      .object({
        title: z.string(),
        status: z.enum(['overdue', 'due_soon', 'upcoming']),
        /** Its date, or when the odometer is expected to reach it. */
        dueDate: z.string().nullable(),
        daysLeft: z.number().int().nullable(),
        distanceLeft: z.number().int().nullable(),
      })
      .nullable(),
    overdue: z.number().int(),
    dueSoon: z.number().int(),
    /** Documents expired or inside the "due soon" window. */
    documentsExpiring: z.number().int(),
    openRecalls: z.number().int(),
    /** True when any of the four counts above is not zero. */
    needsAttention: z.boolean(),
    /** milli-units of the instance currency */
    costToDate: z.number().int(),
  })
  .meta({ id: 'VehicleStatus' });
export type VehicleStatus = z.infer<typeof VehicleStatus>;

export const GarageStatus = z
  .object({
    version: z.string(),
    currency: z.string(),
    vehicles: z.array(VehicleStatus),
  })
  .meta({ id: 'GarageStatus' });
export type GarageStatus = z.infer<typeof GarageStatus>;
