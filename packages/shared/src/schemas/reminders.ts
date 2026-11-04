import { z } from 'zod';
import { DUE_MODES } from '../domain/reminder-status';
import { ODOMETER_UNITS } from '../domain/units';
import { IsoDateString, Odometer, optionalText } from './text';

export const ReminderInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    notes: optionalText(2000),
    dueMode: z.enum(DUE_MODES),
    dueDate: IsoDateString.nullable().optional(),
    dueOdometer: Odometer.nullable().optional(),
    intervalMonths: z.number().int().min(1).max(240).nullable().optional(),
    intervalDistance: z.number().int().min(1).max(1_000_000).nullable().optional(),
    soonDays: z.number().int().min(0).max(365).optional(),
    soonDistance: z.number().int().min(0).max(100_000).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.dueMode !== 'distance' && !r.dueDate && r.dueMode === 'date')
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'required' });
    if (r.dueMode === 'distance' && r.dueOdometer == null)
      ctx.addIssue({ code: 'custom', path: ['dueOdometer'], message: 'required' });
    if (r.dueMode === 'either' && !r.dueDate && r.dueOdometer == null)
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'required' });
  });
export type ReminderInput = z.input<typeof ReminderInput>;

export const Reminder = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    vehicleTitle: z.string(),
    odometerUnit: z.enum(ODOMETER_UNITS),
    title: z.string(),
    notes: z.string().nullable(),
    dueMode: z.enum(DUE_MODES),
    dueDate: z.string().nullable(),
    dueOdometer: z.number().int().nullable(),
    intervalMonths: z.number().int().nullable(),
    intervalDistance: z.number().int().nullable(),
    soonDays: z.number().int(),
    soonDistance: z.number().int(),
    archivedAt: z.string().nullable(),
    status: z.enum(['overdue', 'due_soon', 'upcoming', 'inactive']),
    daysLeft: z.number().int().nullable(),
    distanceLeft: z.number().int().nullable(),
    lastCompletedAt: z.string().nullable(),
    canEdit: z.boolean(),
  })
  .meta({ id: 'Reminder' });
export type Reminder = z.infer<typeof Reminder>;

export const ReminderCompleteInput = z.object({
  date: IsoDateString,
  odometer: Odometer.nullable().optional(),
});
