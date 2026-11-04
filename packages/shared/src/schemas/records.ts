import { z } from 'zod';
import { IsoDateString, Milli, Odometer, optionalText } from './text';

export const RECORD_KINDS = ['service', 'repair', 'upgrade', 'fuel', 'expense'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const EXPENSE_CATEGORIES = [
  'tax',
  'registration',
  'insurance',
  'parking',
  'toll',
  'loan',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const FuelInput = z.object({
  /** milli-units of the vehicle's fuel unit */
  volume: z.number().int().positive(),
  /** milli-units of currency per volume unit */
  pricePerUnit: Milli.nullable().optional(),
  isFull: z.boolean().default(true),
  missedPrevious: z.boolean().default(false),
  grade: optionalText(40),
  station: optionalText(120),
});

export const RecordPartUse = z.object({
  partId: z.number().int().positive(),
  /** milli-units */
  quantity: z.number().int().positive(),
});

export const RecordInput = z
  .object({
    kind: z.enum(RECORD_KINDS),
    date: IsoDateString,
    odometer: Odometer.nullable().optional(),
    title: optionalText(200),
    cost: Milli.default(0),
    notes: optionalText(8000),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    expenseCategory: z.enum(EXPENSE_CATEGORIES).nullable().optional(),
    fuel: FuelInput.nullable().optional(),
    parts: z.array(RecordPartUse).max(50).default([]),
    completesReminderIds: z.array(z.number().int().positive()).max(20).default([]),
    /** Client-generated id for idempotent offline sync. */
    clientId: z.uuid().nullable().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.kind === 'fuel' && !r.fuel)
      ctx.addIssue({ code: 'custom', path: ['fuel'], message: 'required' });
    if (r.kind !== 'fuel' && r.fuel)
      ctx.addIssue({ code: 'custom', path: ['fuel'], message: 'only_for_fuel' });
    if (r.kind !== 'fuel' && !r.title)
      ctx.addIssue({
        code: 'too_small',
        origin: 'string',
        minimum: 1,
        inclusive: true,
        path: ['title'],
        message: 'required',
        input: r.title,
      });
    if (r.kind === 'fuel' && r.odometer == null)
      ctx.addIssue({ code: 'custom', path: ['odometer'], message: 'required_for_fuel' });
  });
export type RecordInput = z.input<typeof RecordInput>;

export const RecordUpdate = RecordInput;
export type RecordUpdate = z.input<typeof RecordUpdate>;

export const Attachment = z
  .object({
    id: z.number().int(),
    recordId: z.number().int().nullable(),
    name: z.string(),
    mimeType: z.string(),
    size: z.number().int(),
    url: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: 'Attachment' });
export type Attachment = z.infer<typeof Attachment>;

export const LogRecord = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    kind: z.enum(RECORD_KINDS),
    date: z.string(),
    odometer: z.number().int().nullable(),
    title: z.string().nullable(),
    cost: z.number().int(),
    notes: z.string().nullable(),
    tags: z.array(z.string()),
    expenseCategory: z.enum(EXPENSE_CATEGORIES).nullable(),
    fuel: z
      .object({
        volume: z.number().int(),
        pricePerUnit: z.number().int().nullable(),
        isFull: z.boolean(),
        missedPrevious: z.boolean(),
        grade: z.string().nullable(),
        station: z.string().nullable(),
      })
      .nullable(),
    parts: z.array(
      z.object({
        partId: z.number().int().nullable(),
        name: z.string(),
        quantity: z.number().int(),
        unitCost: z.number().int().nullable(),
      }),
    ),
    attachments: z.array(Attachment),
    completedReminderIds: z.array(z.number().int()),
    clientId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Record' });
export type LogRecord = z.infer<typeof LogRecord>;

export const RecordListQuery = z.object({
  kind: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .filter((k): k is (typeof RECORD_KINDS)[number] =>
              (RECORD_KINDS as readonly string[]).includes(k),
            )
        : [],
    ),
  tag: z.string().trim().optional(),
  q: z.string().trim().max(200).optional(),
  from: IsoDateString.optional(),
  to: IsoDateString.optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  sort: z.enum(['date_desc', 'date_asc', 'cost_desc', 'odometer_desc']).default('date_desc'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const RecordPage = z.object({
  items: z.array(LogRecord),
  total: z.number().int(),
  totalCost: z.number().int(),
});
export type RecordPage = z.infer<typeof RecordPage>;

export const OdometerReading = z
  .object({
    id: z.number().int(),
    vehicleId: z.number().int(),
    date: z.string(),
    odometer: z.number().int(),
    recordId: z.number().int().nullable(),
    recordKind: z.enum(RECORD_KINDS).nullable(),
    recordTitle: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .meta({ id: 'OdometerReading' });
export type OdometerReading = z.infer<typeof OdometerReading>;

export const OdometerInput = z.object({
  date: IsoDateString,
  odometer: Odometer,
  notes: optionalText(500),
});
export type OdometerInput = z.input<typeof OdometerInput>;

export const FuelEconomyReport = z
  .object({
    fills: z.array(
      z.object({
        recordId: z.number().int(),
        date: z.string(),
        odometer: z.number().int(),
        volume: z.number().int(),
        cost: z.number().int(),
        pricePerUnit: z.number().int().nullable(),
        isFull: z.boolean(),
        missedPrevious: z.boolean(),
        station: z.string().nullable(),
        status: z.enum(['baseline', 'partial', 'ok', 'missed', 'invalid']),
        distance: z.number().int().nullable(),
        economy: z.number().nullable(),
      }),
    ),
    average: z.number().nullable(),
    last: z.number().nullable(),
    totalDistance: z.number().int(),
    totalVolume: z.number().int(),
    totalCost: z.number().int(),
    /** milli-units of currency per distance unit, over measured segments */
    costPerDistance: z.number().nullable(),
  })
  .meta({ id: 'FuelEconomyReport' });
export type FuelEconomyReport = z.infer<typeof FuelEconomyReport>;
