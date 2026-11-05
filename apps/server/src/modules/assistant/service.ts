import {
  type AskAnswer,
  AskOutput,
  AskPick,
  convertVolume,
  DraftOutput,
  divideMilli,
  type FuelUnit,
  formatMoney,
  isLiquidUnit,
  multiplyMilli,
  type RecordDraft,
  today,
  toMilli,
  vehicleTitle,
} from '@axlebook/shared';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { User } from '../../db/schema';
import type { Ai } from '../../lib/ai';
import { AppError } from '../../lib/errors';
import { getInstanceSettings } from '../../lib/instance-settings';
import { garageVehicleIds } from '../vehicles/access';

interface GarageVehicle {
  id: number;
  title: string;
  nickname: string | null;
  make: string;
  model: string;
  year: number;
  unitNumber: string | null;
  odometerUnit: string;
  fuelUnit: FuelUnit;
  canEdit: boolean;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

const STOP = new Set(
  'the a an my on of in for to and or was is did i when what how much many last time ever have has had do does at with from'.split(
    ' ',
  ),
);

/** A number the model read, if it's plausible for this field. */
const within = (n: number | null | undefined, max: number) =>
  n != null && Number.isFinite(n) && n > 0 && n <= max ? n : null;

/** YYYY-MM-DD that exists, isn't before 1980 and isn't tomorrow or later. */
export function plausibleDate(raw: string | null, todayIso: string): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw >= '1980-01-01' && raw <= todayIso ? raw : null;
}

/** Best vehicle for some words ("civic", "old blue", "truck 42"), or null if unclear. */
export function matchVehicle<T extends GarageVehicle>(text: string | null, garage: T[]): T | null {
  const want = new Set(words(text ?? '').filter((w) => !STOP.has(w)));
  if (want.size) {
    const scored = garage
      .map((v) => {
        const name = new Set(
          words(
            [v.nickname, v.make, v.model, String(v.year), v.unitNumber].filter(Boolean).join(' '),
          ),
        );
        return { v, score: [...want].filter((w) => name.has(w)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const [best, next] = scored;
    if (best && (!next || best.score > next.score)) return best.v;
  }
  return garage.length === 1 ? (garage[0] as T) : null;
}

/** Turn what the model read into a form draft for this vehicle (or none chosen yet). */
export function toDraft(
  out: DraftOutput,
  vehicle: GarageVehicle | null,
  todayIso: string,
): RecordDraft {
  let volume = toMilli(within(out.volume, 2000) ?? Number.NaN);
  let price = toMilli(within(out.pricePerUnit, 1000) ?? Number.NaN);
  let total = toMilli(within(out.total, 1_000_000) ?? Number.NaN);
  const kind = volume ? 'fuel' : out.kind;

  if (kind === 'fuel') {
    // Volume as printed (gal / l / kWh) into the vehicle's own unit.
    const from: FuelUnit | null =
      out.volumeUnit === 'l'
        ? 'l'
        : out.volumeUnit === 'kwh'
          ? 'kwh'
          : out.volumeUnit === 'gal'
            ? vehicle?.fuelUnit === 'gal_uk'
              ? 'gal_uk'
              : 'gal_us'
            : null;
    const to = vehicle?.fuelUnit ?? null;
    if (volume && from && to && from !== to) {
      if (isLiquidUnit(from) && isLiquidUnit(to)) {
        const converted = Math.round(convertVolume(volume, from, to));
        if (price) price = Math.round((price * volume) / converted);
        volume = converted;
      } else {
        // kWh on a receipt for a petrol car (or the reverse): don't guess.
        volume = null;
        price = null;
      }
    }
    // Any two of volume, price and total give the third.
    if (!total && volume && price) total = multiplyMilli(volume, price);
    if (!price && volume && total) price = divideMilli(total, volume);
    if (!volume && price && total) volume = divideMilli(total, price);
  }

  // A name or title that is just a number or an amount was misread.
  const text = (v: string | null | undefined) =>
    v && !/^[\s$€£¥#.,\d-]+$/.test(v) ? v.trim() || null : null;
  const items = out.items
    .filter((i) => i.description.trim())
    .map((i) =>
      i.amount != null ? `${i.description.trim()}: ${i.amount.toFixed(2)}` : i.description.trim(),
    );
  // A fuel receipt's lines just repeat the fill-up; keep them for anything else.
  const notes = [
    kind !== 'fuel' ? text(out.station) : null,
    kind !== 'fuel' && items.length ? items.join('\n') : null,
  ]
    .filter(Boolean)
    .join('\n');
  const odometer = within(out.odometer, 10_000_000);
  return {
    vehicleId: vehicle?.id ?? null,
    kind,
    date: plausibleDate(out.date, todayIso),
    odometer: odometer == null ? null : Math.round(odometer),
    title: kind === 'fuel' ? null : (text(out.title) ?? text(out.items[0]?.description)),
    station: kind === 'fuel' ? text(out.station) : null,
    cost: total ?? null,
    pricePerUnit: kind === 'fuel' ? (price ?? null) : null,
    volume: kind === 'fuel' ? (volume ?? null) : null,
    notes: notes || null,
  };
}

/** Units as people write them, for the record lines the model reads. */
const UNIT_WORDS: Record<string, string> = {
  gal_us: 'gal',
  gal_uk: 'UK gal',
  l: 'L',
  kwh: 'kWh',
  mi: 'mi',
  km: 'km',
  hr: 'hours',
};

const DRAFT_RULES = [
  'Fill in only what is actually there. Use null for anything missing; never guess numbers.',
  'kind is fuel for a fill-up or charge; service for routine maintenance; repair for fixing something broken; upgrade for added parts; expense for insurance, registration, tax, parking, tolls or loan payments.',
  'Amounts are plain numbers without currency symbols. Dates are YYYY-MM-DD.',
  'volumeUnit is gal, l or kwh as written; null if not stated.',
].join('\n');

export class AssistantService {
  constructor(
    private readonly db: DB,
    private readonly config: Config,
    private readonly ai: Ai,
  ) {}

  /** The person's garage: vehicles they own or that are shared with them. */
  private async garage(user: User): Promise<GarageVehicle[]> {
    const access = await garageVehicleIds(this.db, user);
    if (!access.size) return [];
    const rows = await this.db
      .selectFrom('vehicles')
      .select([
        'id',
        'year',
        'make',
        'model',
        'trim',
        'nickname',
        'unit_number',
        'odometer_unit',
        'fuel_unit',
      ])
      .where('id', 'in', [...access.keys()])
      .where('archived_at', 'is', null)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      title: r.nickname ? `${r.nickname} (${vehicleTitle(r)})` : vehicleTitle(r),
      nickname: r.nickname,
      make: r.make,
      model: r.model,
      year: r.year,
      unitNumber: r.unit_number,
      odometerUnit: r.odometer_unit,
      fuelUnit: r.fuel_unit as FuelUnit,
      canEdit: user.role !== 'viewer' && access.get(r.id) !== 'view',
    }));
  }

  private async editable(user: User) {
    if (user.role === 'viewer') throw new AppError('forbidden');
    return (await this.garage(user)).filter((v) => v.canEdit);
  }

  private pick(garage: GarageVehicle[], vehicleId: number | null | undefined, text: string | null) {
    if (vehicleId != null) {
      const v = garage.find((g) => g.id === vehicleId);
      if (!v) throw new AppError('not_found', { entity: 'vehicle' });
      return v;
    }
    return matchVehicle(text, garage);
  }

  /** Read a receipt photo into a draft record. Needs a model that can read photos. */
  async receipt(user: User, image: Buffer, vehicleId?: number | null): Promise<RecordDraft> {
    const garage = await this.editable(user);
    const vehicle = this.pick(garage, vehicleId, null);
    const status = await this.ai.status();
    if (!status.enabled) throw new AppError('ai_disabled');
    if (!status.vision) throw new AppError('ai_failed', { reason: 'no_vision' });
    const now = today(this.config.timeZone);
    const out = await this.ai.json(DraftOutput, {
      system: `You read photos of receipts for a vehicle logbook.\n${DRAFT_RULES}\nvehicle is always null for a receipt. List the line items as printed.`,
      user: `Today is ${now}. Read this receipt.`,
      images: [image.toString('base64')],
      maxTokens: 900,
    });
    return toDraft({ ...out, vehicle: null }, vehicle, now);
  }

  /** One typed sentence ("filled up 10.8 gal at 3.49, 61402 mi, civic") into a draft. */
  async entry(user: User, text: string, vehicleId?: number | null): Promise<RecordDraft> {
    const garage = await this.editable(user);
    const now = today(this.config.timeZone);
    const list = garage.map((v) => `- ${v.title}`).join('\n') || '- (none yet)';
    const out = await this.ai.json(DraftOutput, {
      system: [
        'You turn one sentence about a vehicle into a logbook entry.',
        DRAFT_RULES,
        'vehicle is the words in the sentence that name the vehicle, or null. "yesterday" and weekdays are relative to today. items is empty unless the sentence lists several things.',
        'volume is the amount of fuel (gallons, litres, kWh); pricePerUnit is the price of one gallon, litre or kWh; total is what was paid altogether. station is a business name, never a number. title says what was done in a few words, never an amount.',
        'Examples, if today were 2026-06-10:',
        '"gas 12.1 gallons $3.19 a gallon at 45210 on the f150" -> {"kind":"fuel","vehicle":"f150","date":null,"odometer":45210,"station":null,"title":null,"total":null,"pricePerUnit":3.19,"volume":12.1,"volumeUnit":"gal","items":[]}',
        '"new brake pads on the outback last friday, 189 at Midas, 98400 km" -> {"kind":"repair","vehicle":"outback","date":"2026-06-05","odometer":98400,"station":"Midas","title":"Brake pads","total":189,"pricePerUnit":null,"volume":null,"volumeUnit":null,"items":[]}',
      ].join('\n'),
      user: `Today is ${now}.\nThe person's vehicles:\n${list}\n\nSentence: ${JSON.stringify(text)}`,
      maxTokens: 500,
    });
    const vehicle = this.pick(garage, vehicleId, out.vehicle ?? text);
    return toDraft(out, vehicle, now);
  }

  /** Answer a question from the person's own records only, citing the records used. */
  async ask(user: User, question: string): Promise<AskAnswer> {
    const garage = await this.garage(user);
    const none: AskAnswer = {
      found: false,
      answer: null,
      sources: [],
      reminders: [],
      model: this.ai.model,
    };
    if (!this.ai.enabled) throw new AppError('ai_disabled');
    if (!garage.length) return none;

    // Narrow to the vehicles the question names, if it names any.
    const named = garage.filter(
      (v) =>
        matchVehicle(question, [v]) &&
        words(question).some((w) =>
          words(`${v.nickname ?? ''} ${v.make} ${v.model} ${v.unitNumber ?? ''}`).includes(w),
        ),
    );
    const scope = named.length ? named : garage;
    const ids = scope.map((v) => v.id);
    const rows = await this.db
      .selectFrom('records')
      .select([
        'id',
        'vehicle_id',
        'kind',
        'date',
        'odometer',
        'title',
        'cost',
        'notes',
        'fuel_volume',
        'station',
        'expense_category',
      ])
      .where('vehicle_id', 'in', ids)
      .orderBy('date', 'desc')
      .orderBy('id', 'desc')
      .limit(3000)
      .execute();
    const reminders = await this.db
      .selectFrom('reminders')
      .select(['id', 'vehicle_id', 'title', 'due_date', 'due_odometer'])
      .where('vehicle_id', 'in', ids)
      .where('archived_at', 'is', null)
      .orderBy('due_date')
      .limit(40)
      .execute();
    if (!rows.length && !reminders.length) return none;

    // Records that share words with the question, plus the latest few for context.
    const q = new Set(
      words(question)
        .filter((w) => !STOP.has(w))
        .flatMap((w) =>
          /^(gas|fuel|fill|filled|petrol|diesel|mpg|economy|charge|charging)$/.test(w)
            ? [w, 'fuel']
            : [w],
        ),
    );
    const scored = rows.map((r, i) => {
      const text = words(
        [r.kind, r.title, r.notes, r.station, r.expense_category].filter(Boolean).join(' '),
      );
      const hits = text.filter(
        (w) => q.has(w) || [...q].some((x) => x.length > 3 && w.startsWith(x.slice(0, 4))),
      ).length;
      return { r, score: hits * 10 - i / 1000 };
    });
    const chosen = new Map<number, (typeof rows)[number]>();
    for (const { r } of scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40))
      chosen.set(r.id, r);
    for (const r of rows.slice(0, 15)) chosen.set(r.id, r);
    const context = [...chosen.values()].sort((a, b) => b.date.localeCompare(a.date));

    const { currency } = await getInstanceSettings(this.db, this.config);
    const byId = new Map(garage.map((v) => [v.id, v]));
    const money = (m: number) => formatMoney(m, { currency, locale: 'en-US' });
    const line = (r: (typeof rows)[number]) => {
      const v = byId.get(r.vehicle_id);
      return [
        `#${r.id}`,
        r.date,
        v?.title,
        r.kind === 'fuel' ? 'fill-up' : r.kind,
        r.title ??
          (r.kind === 'fuel' && r.fuel_volume
            ? `${(r.fuel_volume / 1000).toFixed(2)} ${UNIT_WORDS[v?.fuelUnit ?? 'l']}`
            : null),
        r.odometer != null ? `${r.odometer} ${UNIT_WORDS[v?.odometerUnit ?? 'mi']}` : null,
        r.cost ? money(r.cost) : null,
        r.station,
        r.notes ? r.notes.replace(/\s+/g, ' ').slice(0, 120) : null,
      ]
        .filter(Boolean)
        .join(' | ');
    };
    const reminderLine = (r: (typeof reminders)[number]) => {
      const v = byId.get(r.vehicle_id);
      return [
        `R${r.id}`,
        'reminder',
        v?.title,
        r.title,
        r.due_date ? `due ${r.due_date}` : null,
        r.due_odometer != null
          ? `due at ${r.due_odometer} ${UNIT_WORDS[v?.odometerUnit ?? 'mi']}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ');
    };
    const newestFirst =
      'Records are listed newest first: for "last" or "most recent", the first matching record is the one.';

    // Step 1: which records and reminders answer the question? (Small models stay accurate
    // when they only have to pick.)
    const picked = await this.ai.json(AskPick, {
      system: [
        "You find the entries in a person's vehicle logbook that answer their question.",
        newestFirst,
        'Reminders hold what is due next (due dates and distances); records hold what was done in the past.',
        'A question about when something is due, next, coming up or overdue is answered by a reminder, not a record.',
        'Put the numbers of the records that answer it (after #) in recordIds and of the reminders (after R) in reminderIds, most relevant first.',
        'Set found to false, with no ids, when nothing listed answers the question. Never guess.',
      ].join('\n'),
      user: `Vehicles: ${scope.map((v) => v.title).join('; ')}\n\nReminders:\n${reminders.map(reminderLine).join('\n') || '(none)'}\n\nRecords (newest first):\n${context.map(line).join('\n') || '(none)'}\n\nQuestion: ${question}`,
      maxTokens: 120,
    });
    // Only entries the model was actually shown can be cited.
    const shown = new Map(context.map((r) => [r.id, r]));
    const sameJob = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      a.kind === b.kind && (a.title ?? '').toLowerCase() === (b.title ?? '').toLowerCase();
    // For "last" / "most recent", the model only has to recognise the job; the newest record
    // of that job is found here, since small models often pick an older one.
    const latest = /\b(last|latest|most recent|recent|newest|previous)\b/i.test(question);
    const used = [
      ...new Set(
        picked.recordIds
          .map((id) => shown.get(id))
          .filter((r): r is (typeof rows)[number] => r != null)
          .map((r) => (latest ? (context.find((c) => sameJob(c, r)) ?? r) : r)),
      ),
    ]
      .slice(0, 5)
      .sort((a, b) => b.date.localeCompare(a.date));
    const dueShown = new Map(reminders.map((r) => [r.id, r]));
    const due = [...new Set(picked.reminderIds)]
      .map((id) => dueShown.get(id))
      .filter((r): r is (typeof reminders)[number] => r != null);
    // The ids are the dependable part of a small model's pick (it sometimes lists the right
    // records and still says found: false); step 2 decides whether they really answer it.
    if (!used.length && !due.length) return none;

    // Step 2: answer from just those entries.
    const out = await this.ai.json(AskOutput, {
      system: [
        "You answer a question about a person's vehicle logbook from the entries given, and nothing else.",
        newestFirst,
        'Answer in one or two plain sentences. Copy dates, distances and amounts exactly as they appear.',
        "For when something is due, use the reminder's due date or distance, not a past record.",
        'Set found to false if these entries do not answer the question after all.',
      ].join('\n'),
      user: `${due.length ? `Reminders:\n${due.map(reminderLine).join('\n')}\n\n` : ''}${used.length ? `Records (newest first):\n${used.map(line).join('\n')}\n\n` : ''}Question: ${question}`,
      maxTokens: 250,
    });
    if (!out.found || !out.answer.trim()) return none;
    return {
      found: true,
      answer: out.answer.trim(),
      sources: used.map((r) => ({
        recordId: r.id,
        vehicleId: r.vehicle_id,
        vehicle: byId.get(r.vehicle_id)?.title ?? '',
        date: r.date,
        kind: r.kind,
        title: r.title,
      })),
      reminders: due.map((r) => ({
        reminderId: r.id,
        vehicleId: r.vehicle_id,
        vehicle: byId.get(r.vehicle_id)?.title ?? '',
        title: r.title,
        dueDate: r.due_date,
        dueOdometer: r.due_odometer,
      })),
      model: this.ai.model,
    };
  }
}
