import { z } from 'zod';
import { RECORD_KINDS } from './records';

// ── Local assistant (Ollama) ────────────────────────────────────────────────────
// Everything here is optional and runs against the Ollama server in OLLAMA_URL only.
// Drafts are suggestions: nothing is saved until the person confirms the form.

export const AssistantModel = z
  .object({
    name: z.string(),
    /** Bytes on disk. */
    size: z.number(),
    /** Can read photos; receipt scan needs this. */
    vision: z.boolean(),
  })
  .meta({ id: 'AssistantModel' });
export type AssistantModel = z.infer<typeof AssistantModel>;

export const AssistantModelChoice = z.object({ model: z.string().trim().min(1).max(200) });

export const AssistantTestResult = z.object({ model: z.string(), ms: z.number().int() });
export type AssistantTestResult = z.infer<typeof AssistantTestResult>;

/**
 * What the model returns when reading a receipt or a sentence. Plain decimals as printed;
 * the server turns them into milli-units for the chosen vehicle. Length limits keep a small
 * model from rambling (Ollama's grammar enforces them).
 */
export const DraftOutput = z.object({
  kind: z.enum(RECORD_KINDS),
  /** Words that name the vehicle ("civic", "the truck"), from a typed sentence. */
  vehicle: z.string().max(80).nullable(),
  date: z.string().max(10).nullable().describe('YYYY-MM-DD'),
  odometer: z.number().nullable(),
  station: z.string().max(120).nullable().describe('Gas station or shop name'),
  title: z.string().max(120).nullable().describe('What was done, for anything but fuel'),
  total: z.number().nullable().describe('Total paid'),
  pricePerUnit: z.number().nullable().describe('Fuel price per gallon, litre or kWh'),
  volume: z.number().nullable().describe('Fuel amount'),
  volumeUnit: z.enum(['gal', 'l', 'kwh']).nullable(),
  items: z
    .array(z.object({ description: z.string().max(80), amount: z.number().nullable() }))
    .max(20),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

/** A record form, filled in. Money and fuel in milli-units, fuel in the vehicle's unit. */
export const RecordDraft = z
  .object({
    vehicleId: z.number().int().nullable(),
    kind: z.enum(RECORD_KINDS),
    date: z.string().nullable(),
    odometer: z.number().int().nullable(),
    title: z.string().nullable(),
    station: z.string().nullable(),
    cost: z.number().int().nullable(),
    pricePerUnit: z.number().int().nullable(),
    volume: z.number().int().nullable(),
    notes: z.string().nullable(),
  })
  .meta({ id: 'RecordDraft' });
export type RecordDraft = z.infer<typeof RecordDraft>;

export const QuickEntryInput = z.object({
  text: z.string().trim().min(3).max(500),
  vehicleId: z.number().int().positive().nullable().optional(),
});

export const AskInput = z.object({ question: z.string().trim().min(3).max(500) });

/** Step 1 of a question: which records answer it. */
export const AskPick = z.object({
  recordIds: z.array(z.number().int()).max(8),
  reminderIds: z.array(z.number().int()).max(4),
  found: z.boolean().describe('false only when nothing listed answers the question'),
});

/** Step 2: the answer, written from only the records picked in step 1. */
export const AskOutput = z.object({
  answer: z.string().max(600),
  found: z.boolean(),
});

export const AskAnswer = z
  .object({
    /** False when the person's records don't hold the answer. */
    found: z.boolean(),
    answer: z.string().nullable(),
    sources: z.array(
      z.object({
        recordId: z.number().int(),
        vehicleId: z.number().int(),
        vehicle: z.string(),
        date: z.string(),
        kind: z.enum(RECORD_KINDS),
        title: z.string().nullable(),
      }),
    ),
    /** Reminders the answer used (due dates live there, not in records). */
    reminders: z.array(
      z.object({
        reminderId: z.number().int(),
        vehicleId: z.number().int(),
        vehicle: z.string(),
        title: z.string(),
        dueDate: z.string().nullable(),
        dueOdometer: z.number().int().nullable(),
      }),
    ),
    model: z.string(),
  })
  .meta({ id: 'AskAnswer' });
export type AskAnswer = z.infer<typeof AskAnswer>;
