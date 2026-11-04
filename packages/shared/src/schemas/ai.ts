import { z } from 'zod';
import { FUEL_UNITS, ODOMETER_UNITS } from '../domain/units';
import { RECORD_KINDS } from './records';
import { FUEL_TYPES, VEHICLE_CATEGORIES } from './vehicles';

// ── Spreadsheet import ─────────────────────────────────────────────────────────
// A plan says how to read a workbook: which sheets, which header row, which column
// holds which field, which vehicle each row belongs to. The AI (or the built-in
// matcher) proposes it; people can edit it; plain code then applies it row by row,
// so no record is ever invented.

export const SPREADSHEET_FIELDS = [
  'date',
  'odometer',
  'title',
  'cost',
  'notes',
  'tags',
  'fuelVolume',
  'pricePerUnit',
  'isFull',
  'missedPrevious',
  'station',
  'grade',
  'expenseCategory',
] as const;
export type SpreadsheetField = (typeof SPREADSHEET_FIELDS)[number];

const col = z.string().nullable();
export const ColumnMap = z.object(
  Object.fromEntries(SPREADSHEET_FIELDS.map((f) => [f, col])) as Record<
    SpreadsheetField,
    typeof col
  >,
);
export type ColumnMap = z.infer<typeof ColumnMap>;

export const SheetPlan = z.object({
  sheet: z.string(),
  include: z.boolean(),
  /** 0-based index of the header row within the sheet. */
  headerRow: z.number().int().min(0),
  /** Column whose value names the vehicle (a sheet holding several cars). */
  vehicleColumn: z.string().nullable(),
  /** Vehicle key for the whole sheet when there is no vehicle column. */
  vehicleKey: z.string().nullable(),
  kindColumn: z.string().nullable(),
  kindValues: z.array(z.object({ value: z.string(), kind: z.enum([...RECORD_KINDS, 'skip']) })),
  defaultKind: z.enum(RECORD_KINDS),
  columns: ColumnMap,
  /** Other columns worth keeping: appended to notes as "Header: value". */
  extraNoteColumns: z.array(z.string()),
  dateOrder: z.enum(['mdy', 'dmy']),
});
export type SheetPlan = z.infer<typeof SheetPlan>;

export const VehiclePlan = z.object({
  /** Sheet name or vehicle-column value this entry describes. */
  key: z.string(),
  /** Import into this existing vehicle, or null to create one from the fields below. */
  existingVehicleId: z.number().int().nullable(),
  category: z.enum(VEHICLE_CATEGORIES),
  year: z.number().int().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  trim: z.string().nullable(),
  nickname: z.string().nullable(),
  odometerUnit: z.enum(ODOMETER_UNITS),
  fuelUnit: z.enum(FUEL_UNITS),
  fuelType: z.enum(FUEL_TYPES),
});
export type VehiclePlan = z.infer<typeof VehiclePlan>;

export const SpreadsheetPlan = z.object({
  sheets: z.array(SheetPlan),
  vehicles: z.array(VehiclePlan),
});
export type SpreadsheetPlan = z.infer<typeof SpreadsheetPlan>;

export const SpreadsheetAnalysis = z.object({
  uploadId: z.string(),
  fileName: z.string(),
  sheets: z.array(
    z.object({
      name: z.string(),
      rowCount: z.number().int(),
      headers: z.array(z.string()),
      sample: z.array(z.array(z.string())),
    }),
  ),
  plan: SpreadsheetPlan,
  planSource: z.enum(['ai', 'matcher']),
  /** Why the AI wasn't used, when it was requested but failed. */
  aiError: z.string().nullable(),
});
export type SpreadsheetAnalysis = z.infer<typeof SpreadsheetAnalysis>;

export const SpreadsheetPreview = z.object({
  /** The plan as it will be applied, after checking it against the file. */
  plan: SpreadsheetPlan,
  vehicles: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      existingVehicleId: z.number().int().nullable(),
      records: z.number().int(),
      byKind: z.record(z.string(), z.number().int()),
      firstDate: z.string().nullable(),
      lastDate: z.string().nullable(),
      problems: z.array(z.string()),
    }),
  ),
  total: z.number().int(),
  valid: z.number().int(),
  errors: z.array(z.object({ sheet: z.string(), row: z.number().int(), message: z.string() })),
  sample: z.array(z.record(z.string(), z.unknown())),
});
export type SpreadsheetPreview = z.infer<typeof SpreadsheetPreview>;

export const SpreadsheetCommitResult = z.object({
  vehicles: z.array(
    z.object({ key: z.string(), vehicleId: z.number().int(), created: z.boolean() }),
  ),
  imported: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ sheet: z.string(), row: z.number().int(), message: z.string() })),
});
export type SpreadsheetCommitResult = z.infer<typeof SpreadsheetCommitResult>;

// ── Vehicle insights ───────────────────────────────────────────────────────────

/** What the model returns for an MPG estimate (economy in the vehicle's own units). */
export const MpgEstimateOutput = z.object({
  combined: z.number(),
  low: z.number(),
  high: z.number(),
  city: z.number().nullable(),
  highway: z.number().nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
  // Length limits go into the JSON schema the model is held to, so it can't ramble on forever.
  factors: z.array(z.string().max(80)).max(6),
  summary: z.string().max(400),
});
export type MpgEstimateOutput = z.infer<typeof MpgEstimateOutput>;

export const MpgEstimate = MpgEstimateOutput.extend({
  /** distance per volume unit in the vehicle's units, e.g. mi per US gal */
  actual: z.number().nullable(),
  /** actual vs estimate, e.g. 0.06 = 6% better */
  difference: z.number().nullable(),
  generatedAt: z.string(),
  model: z.string(),
}).meta({ id: 'MpgEstimate' });
export type MpgEstimate = z.infer<typeof MpgEstimate>;

export const ScheduleOutput = z.object({
  basis: z.string().max(200),
  items: z
    .array(
      z.object({
        title: z.string().max(80),
        intervalMonths: z.number().int().nullable(),
        intervalDistance: z.number().int().nullable(),
        notes: z.string().max(240).nullable(),
        /** id of the most recent record that did this job, if any */
        lastRecordId: z.number().int().nullable(),
      }),
    )
    .max(24),
});
export type ScheduleOutput = z.infer<typeof ScheduleOutput>;

export const ScheduleItem = z.object({
  title: z.string(),
  intervalMonths: z.number().int().nullable(),
  intervalDistance: z.number().int().nullable(),
  notes: z.string().nullable(),
  lastDone: z
    .object({ recordId: z.number().int(), date: z.string(), odometer: z.number().int().nullable() })
    .nullable(),
  nextDueDate: z.string().nullable(),
  nextDueOdometer: z.number().int().nullable(),
  /** A reminder with the same title already exists. */
  hasReminder: z.boolean(),
});
export type ScheduleItem = z.infer<typeof ScheduleItem>;

export const MaintenanceSchedule = z
  .object({
    source: z.enum(['builtin', 'ai']),
    basis: z.string(),
    items: z.array(ScheduleItem),
    generatedAt: z.string(),
    model: z.string(),
  })
  .meta({ id: 'MaintenanceSchedule' });
export type MaintenanceSchedule = z.infer<typeof MaintenanceSchedule>;

export const VehicleInsights = z.object({
  mpg: MpgEstimate.nullable(),
  schedule: MaintenanceSchedule.nullable(),
});
export type VehicleInsights = z.infer<typeof VehicleInsights>;

export const ScheduleApplyInput = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        intervalMonths: z.number().int().min(1).nullable(),
        intervalDistance: z.number().int().min(1).nullable(),
        notes: z.string().max(2000).nullable(),
      }),
    )
    .min(1)
    .max(50),
});

export const AiStatus = z.object({
  enabled: z.boolean(),
  model: z.string(),
  reachable: z.boolean(),
  modelReady: z.boolean(),
  pullProgress: z.number().nullable(),
  error: z.string().nullable(),
});
export type AiStatus = z.infer<typeof AiStatus>;

// ── Tailored tips ──────────────────────────────────────────────────────────────

export const TIP_SEVERITIES = ['warning', 'suggestion', 'info'] as const;
export const Tip = z.object({
  id: z.string(),
  source: z.enum(['data', 'ai']),
  severity: z.enum(TIP_SEVERITIES),
  /** Data tips are translated from a code; AI tips carry their own text. */
  code: z.string().nullable(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  title: z.string().nullable(),
  body: z.string().nullable(),
});
export type Tip = z.infer<typeof Tip>;

export const VehicleTips = z
  .object({
    tips: z.array(Tip),
    aiGeneratedAt: z.string().nullable(),
    model: z.string().nullable(),
  })
  .meta({ id: 'VehicleTips' });
export type VehicleTips = z.infer<typeof VehicleTips>;

export const TipsOutput = z.object({
  tips: z
    .array(
      z.object({
        title: z.string().max(80),
        body: z.string().max(360),
        severity: z.enum(TIP_SEVERITIES),
      }),
    )
    .max(6),
});
