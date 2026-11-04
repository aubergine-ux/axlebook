import { z } from 'zod';
import { IsoDateString, Milli, Odometer, optionalText } from './text';

export const PartInput = z.object({
  name: z.string().trim().min(1).max(120),
  partNumber: optionalText(80),
  manufacturer: optionalText(80),
  vehicleId: z.number().int().positive().nullable().optional(),
  /** milli-units (1000 = 1 each, 4730 = 4.73 qt) */
  quantity: z.number().int().min(-1_000_000_000).max(1_000_000_000).default(0),
  unitCost: Milli.nullable().optional(),
  location: optionalText(80),
  notes: optionalText(2000),
});
export type PartInput = z.input<typeof PartInput>;

export const Part = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int().nullable(),
    vehicleTitle: z.string().nullable(),
    name: z.string(),
    partNumber: z.string().nullable(),
    manufacturer: z.string().nullable(),
    quantity: z.number().int(),
    unitCost: z.number().int().nullable(),
    location: z.string().nullable(),
    notes: z.string().nullable(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Part' });
export type Part = z.infer<typeof Part>;

export const PLAN_STATUSES = ['backlog', 'planned', 'in_progress', 'done'] as const;
export const PLAN_PRIORITIES = ['low', 'normal', 'high'] as const;
export const PLAN_KINDS = ['service', 'repair', 'upgrade'] as const;

export const PlanItemInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText(4000),
  kind: z.enum(PLAN_KINDS).default('service'),
  priority: z.enum(PLAN_PRIORITIES).default('normal'),
  status: z.enum(PLAN_STATUSES).default('planned'),
  estimatedCost: Milli.nullable().optional(),
  targetDate: IsoDateString.nullable().optional(),
});
export type PlanItemInput = z.input<typeof PlanItemInput>;

export const PlanItem = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    title: z.string(),
    description: z.string().nullable(),
    kind: z.enum(PLAN_KINDS),
    priority: z.enum(PLAN_PRIORITIES),
    status: z.enum(PLAN_STATUSES),
    estimatedCost: z.number().int().nullable(),
    targetDate: z.string().nullable(),
    convertedRecordId: z.number().int().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'PlanItem' });
export type PlanItem = z.infer<typeof PlanItem>;

export const PlanConvertInput = z.object({
  date: IsoDateString,
  odometer: Odometer.nullable().optional(),
  cost: Milli.optional(),
});
