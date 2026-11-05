import {
  addMonths,
  computeReminderStatus,
  daysBetween,
  type FuelType,
  type MaintenanceSchedule,
  type MpgEstimate,
  MpgEstimateOutput,
  nextDue,
  recordMatches,
  type ScheduleItem,
  ScheduleOutput,
  scheduleTemplate,
  type TemplateInterval,
  type Tip,
  TipsOutput,
  today,
  type VehicleTips,
  vehicleTitle,
} from '@axlebook/shared';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { User, VehicleRow } from '../../db/schema';
import type { Ai } from '../../lib/ai';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { currentOdometers, fuelEconomyReport } from '../odometer/routes';
import { requireVehicle } from '../vehicles/access';
import { dataTips } from './tips';

const UNIT_WORDS = {
  mi: 'miles',
  km: 'kilometres',
  hr: 'engine hours',
  gal_us: 'US gallons',
  gal_uk: 'imperial gallons',
  l: 'litres',
  kwh: 'kWh',
} as const;
/** What the shared schedule helpers need, from a database row. */
const templateKey = (v: VehicleRow) => ({
  category: v.category,
  odometerUnit: v.odometer_unit,
  fuelType: v.fuel_type as FuelType,
});
/** Trim text the model wrote, dropping a sentence cut off by the length limit. */
export function tidy(text: string): string {
  const s = text.trim().replace(/\s+/g, ' ');
  if (/[.!?)"”]$/.test(s)) return s;
  const end = Math.max(s.lastIndexOf('. '), s.lastIndexOf('! '), s.lastIndexOf('? '));
  return end > 20 ? s.slice(0, end + 1) : s;
}
const normTitle = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface Saved<T> {
  data: T;
  model: string;
  created_at: string;
}

export class InsightService {
  constructor(
    private readonly db: DB,
    private readonly config: Config,
    private readonly ai: Ai,
  ) {}

  private async load<T>(
    vehicleId: number,
    kind: 'mpg' | 'schedule' | 'tips',
  ): Promise<Saved<T> | null> {
    const row = await this.db
      .selectFrom('vehicle_insights')
      .selectAll()
      .where('vehicle_id', '=', vehicleId)
      .where('kind', '=', kind)
      .executeTakeFirst();
    return row
      ? { data: JSON.parse(row.data) as T, model: row.model, created_at: row.created_at }
      : null;
  }

  private async save(
    vehicleId: number,
    kind: 'mpg' | 'schedule' | 'tips',
    data: unknown,
    model: string,
  ) {
    const json = JSON.stringify(data);
    const ts = nowIso();
    await this.db
      .insertInto('vehicle_insights')
      .values({ vehicle_id: vehicleId, kind, data: json, model, created_at: ts })
      .onConflict((oc) =>
        oc.columns(['vehicle_id', 'kind']).doUpdateSet({ data: json, model, created_at: ts }),
      )
      .execute();
  }

  /** Facts the AI may use. Never the VIN, plate, notes or anything personal. */
  private async facts(v: VehicleRow) {
    const odo = (await currentOdometers(this.db, [v.id])).get(v.id) ?? null;
    const first = await this.db
      .selectFrom('odometer_readings')
      .select(['date', 'odometer'])
      .where('vehicle_id', '=', v.id)
      .orderBy('date')
      .executeTakeFirst();
    const since = v.purchase_date ?? first?.date ?? null;
    const t = today(this.config.timeZone);
    const yearsOwned = since ? Math.max(0, daysBetween(since, t) / 365.25) : null;
    const perYear =
      first && odo != null && yearsOwned && yearsOwned > 0.25
        ? Math.round((odo - first.odometer) / yearsOwned)
        : null;
    return {
      vehicle: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`,
      category: v.category,
      fuelType: v.fuel_type,
      ageYears: Math.max(0, Number(t.slice(0, 4)) - v.year),
      currentReading: odo,
      readingUnit: UNIT_WORDS[v.odometer_unit],
      yearsOwned: yearsOwned != null ? Math.round(yearsOwned * 10) / 10 : null,
      usagePerYear: perYear,
    };
  }

  // ── Fuel economy estimate ─────────────────────────────────────────────────

  async mpg(user: User, vehicleId: number): Promise<MpgEstimate | null> {
    await requireVehicle(this.db, user, vehicleId, 'view');
    const saved = await this.load<MpgEstimate>(vehicleId, 'mpg');
    if (!saved) return null;
    // Refresh the comparison with the latest fill-ups.
    const actual = (await fuelEconomyReport(this.db, vehicleId)).average;
    return {
      ...saved.data,
      actual,
      difference: actual && saved.data.combined ? actual / saved.data.combined - 1 : null,
    };
  }

  async estimateMpg(user: User, vehicleId: number): Promise<MpgEstimate> {
    const v = await requireVehicle(this.db, user, vehicleId, 'edit');
    if (!this.ai.enabled) throw new AppError('ai_disabled');
    const facts = await this.facts(v);
    const unit =
      v.odometer_unit === 'hr'
        ? `engine hours per ${UNIT_WORDS[v.fuel_unit]}`
        : `${UNIT_WORDS[v.odometer_unit]} per ${UNIT_WORDS[v.fuel_unit].replace(/s$/, '')}`;
    const services = await this.db
      .selectFrom('records')
      .select(['date', 'title'])
      .where('vehicle_id', '=', v.id)
      .where('kind', 'in', ['service', 'repair', 'upgrade'])
      .orderBy('date', 'desc')
      .limit(15)
      .execute();
    const out = await this.ai.json(MpgEstimateOutput, {
      maxTokens: 700,
      system:
        'You estimate real-world fuel economy for vehicles. Use what you know about the model (official ratings where they exist), then adjust for age, total usage and wear. Be realistic and conservative. Answer only with JSON matching the schema.',
      user: [
        `Vehicle: ${facts.vehicle} (${facts.category}, ${facts.fuelType}).`,
        `Age: ${facts.ageYears} years. Owned for: ${facts.yearsOwned ?? 'unknown'} years.`,
        `Current reading: ${facts.currentReading ?? 'unknown'} ${facts.readingUnit}. Usage per year: ${facts.usagePerYear ?? 'unknown'} ${facts.readingUnit}.`,
        services.length
          ? `Recent work: ${services.map((s) => `${s.title} (${s.date})`).join('; ')}.`
          : 'No service history recorded.',
        '',
        `Give the expected combined economy in ${unit} as "combined", a realistic "low" and "high", and city/highway if they apply (else null).`,
        '"factors": 2 to 5 short phrases about what affects it (e.g. "high mileage", "short trips"). "summary": one or two plain sentences for the owner.',
        '"confidence": how sure you are about this exact vehicle.',
      ].join('\n'),
    });
    // Keep the range coherent whatever the model said.
    const [low, combined, high] = [out.low, out.combined, out.high].sort((a, b) => a - b) as [
      number,
      number,
      number,
    ];
    if (!(combined > 0) || combined > 500)
      throw new AppError('ai_failed', { reason: 'implausible' });
    const actual = (await fuelEconomyReport(this.db, vehicleId)).average;
    const result: MpgEstimate = {
      ...out,
      low: low > 0 ? low : combined,
      combined,
      high,
      factors: out.factors.slice(0, 5).map(tidy),
      summary: tidy(out.summary),
      actual,
      difference: actual ? actual / combined - 1 : null,
      generatedAt: nowIso(),
      model: this.ai.model,
    };
    await this.save(vehicleId, 'mpg', result, this.ai.model);
    return result;
  }

  // ── Maintenance schedule ──────────────────────────────────────────────────

  async schedule(user: User, vehicleId: number): Promise<MaintenanceSchedule> {
    const v = await requireVehicle(this.db, user, vehicleId, 'view');
    const saved = await this.load<{ basis: string; items: TemplateInterval[] }>(
      vehicleId,
      'schedule',
    );
    if (saved)
      return this.present(
        v,
        'ai',
        saved.data.basis,
        saved.data.items,
        saved.model,
        saved.created_at,
      );
    return this.present(v, 'builtin', '', scheduleTemplate(templateKey(v)), '', nowIso());
  }

  /** Ask the local AI to tailor the built-in schedule to this exact vehicle. */
  async tailorSchedule(user: User, vehicleId: number): Promise<MaintenanceSchedule> {
    const v = await requireVehicle(this.db, user, vehicleId, 'edit');
    if (!this.ai.enabled) throw new AppError('ai_disabled');
    const facts = await this.facts(v);
    const base = scheduleTemplate(templateKey(v));
    const records = await this.db
      .selectFrom('records')
      .select(['id', 'date', 'odometer', 'title'])
      .where('vehicle_id', '=', v.id)
      .where('kind', 'in', ['service', 'repair', 'upgrade', 'expense'])
      .orderBy('date', 'desc')
      .limit(80)
      .execute();
    const unit = UNIT_WORDS[v.odometer_unit];
    const out = await this.ai.json(ScheduleOutput, {
      maxTokens: 2500,
      system:
        "You are a careful service advisor. Produce the manufacturer-style maintenance schedule for one vehicle under normal use. Prefer the maker's published intervals for this exact model; otherwise keep the typical intervals given. Don't invent unusual services. Answer only with JSON matching the schema.",
      user: [
        `Vehicle: ${facts.vehicle} (${facts.category}, ${facts.fuelType}), currently at ${facts.currentReading ?? 'unknown'} ${unit}.`,
        `Typical schedule for this kind of vehicle (intervals in months and ${unit}):`,
        ...base.map(
          (b) =>
            `- ${b.title}: ${b.intervalMonths ?? '—'} months / ${b.intervalDistance ?? '—'} ${unit}`,
        ),
        '',
        `Service history (id, date, reading, title):`,
        ...(records.length
          ? records.map((r) => `- ${r.id} | ${r.date} | ${r.odometer ?? '—'} | ${r.title ?? ''}`)
          : ['- none']),
        '',
        `Return 6 to 18 items. intervalDistance is in ${unit} (null if time-only); intervalMonths null if distance-only.`,
        'lastRecordId: the id of the most recent history entry that did that job, or null. notes: one short tip or null.',
        `basis: one sentence on what the schedule is based on (e.g. "${v.make}'s published schedule for this generation, normal driving").`,
      ].join('\n'),
    });
    const titles = new Map(records.map((r) => [r.id, (r.title ?? '').toLowerCase()]));
    const words = (x: string) =>
      new Set(
        normTitle(x)
          .split(' ')
          .filter((w) => w.length > 3),
      );
    const seen = new Set<string>();
    const items: (TemplateInterval & { lastRecordId: number | null })[] = [];
    for (const i of out.items) {
      const key = normTitle(i.title);
      if (!key || seen.has(key) || (i.intervalMonths == null && i.intervalDistance == null))
        continue;
      // Nonsense intervals (zero, negative, centuries) are dropped, as a reminder would refuse them.
      const months = i.intervalMonths ?? 1;
      const distance = i.intervalDistance ?? 1;
      if (months <= 0 || months > 240 || distance <= 0 || distance > 1_000_000) continue;
      seen.add(key);
      const match = base.find((b) => normTitle(b.title) === key);
      items.push({
        id: match?.id ?? key.replace(/ /g, '-'),
        title: i.title.trim(),
        // Small models drop one of the two intervals; the typical schedule fills the gap.
        intervalMonths: i.intervalMonths ?? match?.intervalMonths ?? null,
        intervalDistance: i.intervalDistance ?? match?.intervalDistance ?? null,
        notes: i.notes ? tidy(i.notes) : (match?.notes ?? null),
        keywords:
          match?.keywords ??
          key
            .split(' ')
            .filter((w) => w.length > 3)
            .slice(0, 3),
        exclude: match?.exclude ?? [],
        lastRecordId: null,
      });
      // Small models like to point every item at the same record; only keep a link that fits the job.
      const item = items[items.length - 1];
      const linked = i.lastRecordId != null ? titles.get(i.lastRecordId) : undefined;
      if (item && linked !== undefined) {
        const shared = [...words(i.title)].some((w) => words(linked).has(w));
        if (recordMatches(item, linked) || shared) item.lastRecordId = i.lastRecordId;
      }
      if (items.length >= 20) break;
    }
    if (items.length < 3) throw new AppError('ai_failed', { reason: 'too_few_items' });
    await this.save(vehicleId, 'schedule', { basis: out.basis.trim(), items }, this.ai.model);
    return this.present(v, 'ai', out.basis.trim(), items, this.ai.model, nowIso());
  }

  /** Fill in last done / next due / existing reminder for each schedule item. */
  private async present(
    v: VehicleRow,
    source: 'builtin' | 'ai',
    basis: string,
    items: (TemplateInterval & { lastRecordId?: number | null })[],
    model: string,
    generatedAt: string,
  ): Promise<MaintenanceSchedule> {
    const t = today(this.config.timeZone);
    const odo = (await currentOdometers(this.db, [v.id])).get(v.id) ?? null;
    const records = await this.db
      .selectFrom('records')
      .leftJoin('record_tags', 'record_tags.record_id', 'records.id')
      .leftJoin('tags', 'tags.id', 'record_tags.tag_id')
      .select([
        'records.id',
        'records.date',
        'records.odometer',
        'records.title',
        'tags.name as tag',
      ])
      .where('records.vehicle_id', '=', v.id)
      .where('records.kind', '!=', 'fuel')
      .orderBy('records.date', 'desc')
      .execute();
    const byId = new Map<
      number,
      { id: number; date: string; odometer: number | null; text: string }
    >();
    for (const r of records) {
      const cur = byId.get(r.id) ?? {
        id: r.id,
        date: r.date,
        odometer: r.odometer,
        text: r.title ?? '',
      };
      if (r.tag) cur.text += ` ${r.tag}`;
      byId.set(r.id, cur);
    }
    const history = [...byId.values()];
    const reminders = await this.db
      .selectFrom('reminders')
      .select('title')
      .where('vehicle_id', '=', v.id)
      .where('archived_at', 'is', null)
      .execute();
    const reminderTitles = new Set(reminders.map((r) => normTitle(r.title)));
    const anchor = v.purchase_date ?? history.at(-1)?.date ?? t;

    const out: ScheduleItem[] = items.map((i) => {
      const last =
        (i.lastRecordId ? history.find((h) => h.id === i.lastRecordId) : undefined) ??
        history.find((h) => recordMatches(i, h.text));
      let dueDate: string | null = null;
      let dueOdo: number | null = null;
      if (last) {
        const n = nextDue(
          { months: i.intervalMonths, distance: i.intervalDistance },
          { date: last.date, odometer: last.odometer },
        );
        dueDate = n.dueDate;
        dueOdo =
          n.dueOdometer ?? (i.intervalDistance && odo != null ? odo + i.intervalDistance : null);
      } else {
        // Never logged: next multiple of the interval from the vehicle's start.
        if (i.intervalDistance && odo != null)
          dueOdo = (Math.floor(odo / i.intervalDistance) + 1) * i.intervalDistance;
        if (i.intervalMonths) {
          let d = anchor;
          while (d <= t) d = addMonths(d, i.intervalMonths);
          dueDate = d;
        }
      }
      return {
        title: i.title,
        intervalMonths: i.intervalMonths,
        intervalDistance: i.intervalDistance,
        notes: i.notes,
        lastDone: last ? { recordId: last.id, date: last.date, odometer: last.odometer } : null,
        nextDueDate: dueDate,
        nextDueOdometer: dueOdo,
        hasReminder: reminderTitles.has(normTitle(i.title)),
      };
    });
    return { source, basis, items: out, generatedAt, model };
  }

  /** Create reminders for the chosen schedule items (skipping ones that already exist). */
  async applySchedule(
    user: User,
    vehicleId: number,
    items: {
      title: string;
      intervalMonths: number | null;
      intervalDistance: number | null;
      notes: string | null;
    }[],
  ): Promise<{ created: number }> {
    const v = await requireVehicle(this.db, user, vehicleId, 'edit');
    const current = await this.schedule(user, vehicleId);
    const existing = new Set(
      (
        await this.db
          .selectFrom('reminders')
          .select('title')
          .where('vehicle_id', '=', v.id)
          .where('archived_at', 'is', null)
          .execute()
      ).map((r) => normTitle(r.title)),
    );
    const settings = await this.db
      .selectFrom('instance_settings')
      .select('value')
      .where('key', '=', 'instance')
      .executeTakeFirst();
    const prefs = settings
      ? (JSON.parse(settings.value) as {
          soonDays?: number;
          soonDistanceMi?: number;
          soonDistanceKm?: number;
        })
      : {};
    const soonDistance =
      v.odometer_unit === 'hr'
        ? 5
        : v.odometer_unit === 'km'
          ? (prefs.soonDistanceKm ?? 800)
          : (prefs.soonDistanceMi ?? 500);
    const odo = (await currentOdometers(this.db, [v.id])).get(v.id) ?? null;
    let created = 0;
    const ts = nowIso();
    for (const i of items) {
      if (existing.has(normTitle(i.title))) continue;
      if (i.intervalMonths == null && i.intervalDistance == null) continue;
      const shown = current.items.find((c) => normTitle(c.title) === normTitle(i.title));
      // Next due from the last time it was done, or from today and the current reading.
      const dueOdo = i.intervalDistance
        ? (shown?.nextDueOdometer ?? (odo != null ? odo + i.intervalDistance : null))
        : null;
      let dueMode: 'date' | 'distance' | 'either' =
        i.intervalMonths && i.intervalDistance ? 'either' : i.intervalMonths ? 'date' : 'distance';
      if (dueMode === 'either' && dueOdo == null) dueMode = 'date';
      if (dueMode === 'distance' && dueOdo == null) continue;
      const dueDate =
        dueMode === 'distance'
          ? null
          : (shown?.nextDueDate ?? addMonths(today(this.config.timeZone), i.intervalMonths ?? 12));
      const dueOdometer = dueMode === 'date' ? null : dueOdo;
      await this.db
        .insertInto('reminders')
        .values({
          vehicle_id: v.id,
          title: i.title,
          notes: i.notes,
          due_mode: dueMode,
          due_date: dueDate,
          due_odometer: dueOdometer,
          interval_months: dueMode === 'distance' ? null : i.intervalMonths,
          interval_distance: dueMode === 'date' ? null : i.intervalDistance,
          soon_days: prefs.soonDays ?? 30,
          soon_distance: soonDistance,
          created_at: ts,
          updated_at: ts,
        })
        .execute();
      existing.add(normTitle(i.title));
      created++;
    }
    return { created };
  }

  // ── Tailored tips ─────────────────────────────────────────────────────────

  private async tipInput(v: VehicleRow) {
    const fuel = await fuelEconomyReport(this.db, v.id);
    const t = today(this.config.timeZone);
    const odo = (await currentOdometers(this.db, [v.id])).get(v.id) ?? null;
    const reminders = await this.db
      .selectFrom('reminders')
      .selectAll()
      .where('vehicle_id', '=', v.id)
      .where('archived_at', 'is', null)
      .execute();
    return {
      fuel,
      input: {
        category: v.category,
        fuelType: v.fuel_type,
        month: Number(t.slice(5, 7)),
        fills: [...fuel.fills].reverse().map((f) => ({ status: f.status, economy: f.economy })),
        reminders: reminders.map((r) => ({
          title: r.title,
          status: computeReminderStatus(
            {
              dueMode: r.due_mode,
              dueDate: r.due_date,
              dueOdometer: r.due_odometer,
              soonDays: r.soon_days,
              soonDistance: r.soon_distance,
              archived: false,
            },
            t,
            odo,
          ).status,
        })),
      },
    };
  }

  async tips(user: User, vehicleId: number): Promise<VehicleTips> {
    const v = await requireVehicle(this.db, user, vehicleId, 'view');
    const { input } = await this.tipInput(v);
    const saved = await this.load<Tip[]>(vehicleId, 'tips');
    const tips = [...dataTips(input), ...(saved?.data ?? [])];
    return { tips, aiGeneratedAt: saved?.created_at ?? null, model: saved?.model ?? null };
  }

  /** Ask the local AI for advice specific to this make and model, given its data. */
  async aiTips(user: User, vehicleId: number): Promise<VehicleTips> {
    const v = await requireVehicle(this.db, user, vehicleId, 'edit');
    if (!this.ai.enabled) throw new AppError('ai_disabled');
    const facts = await this.facts(v);
    const { fuel, input } = await this.tipInput(v);
    const overdue = input.reminders.filter((r) => r.status === 'overdue').map((r) => r.title);
    const out = await this.ai.json(TipsOutput, {
      maxTokens: 1000,
      system:
        'You give practical, specific advice to a vehicle owner: how to get better fuel economy, avoid common problems, and look after this exact make and model. No generic filler; mention model-specific points when you know them. Never recommend unsafe or illegal modifications. Answer only with JSON matching the schema.',
      user: [
        `Vehicle: ${facts.vehicle} (${facts.category}, ${facts.fuelType}), ${facts.ageYears} years old, at ${facts.currentReading ?? 'unknown'} ${facts.readingUnit}, about ${facts.usagePerYear ?? 'unknown'} ${facts.readingUnit} a year.`,
        fuel.average
          ? `Average economy so far: ${fuel.average.toFixed(1)} (${facts.readingUnit} per unit of fuel).`
          : 'No fuel economy data yet.',
        overdue.length ? `Overdue maintenance: ${overdue.join(', ')}.` : 'Nothing overdue.',
        `The owner already sees general tips about: ${dataTips(input)
          .map((d) => (d.code ?? '').replace(/_/g, ' '))
          .join(', ')}. Don't repeat those or give generic advice anyone could guess.`,
        `Focus on this make, model and generation: known weak points and what to watch for at this age and ${facts.readingUnit}, the right fluids or parts, and anything about this model that affects economy.`,
        '',
        'Give 3 to 6 tips. title: under 60 characters. body: one to three plain sentences. severity: "warning" only for something that needs attention soon, "suggestion" for things to do, "info" otherwise.',
      ].join('\n'),
    });
    const aiTips: Tip[] = out.tips.slice(0, 6).map((t, i) => ({
      id: `ai-${i}`,
      source: 'ai',
      severity: t.severity,
      code: null,
      params: {},
      title: t.title.trim().slice(0, 120),
      body: tidy(t.body).slice(0, 600),
    }));
    if (aiTips.length === 0) throw new AppError('ai_failed', { reason: 'empty' });
    await this.save(vehicleId, 'tips', aiTips, this.ai.model);
    return { tips: [...dataTips(input), ...aiTips], aiGeneratedAt: nowIso(), model: this.ai.model };
  }

  title(v: VehicleRow) {
    return v.nickname ?? vehicleTitle(v);
  }
}
