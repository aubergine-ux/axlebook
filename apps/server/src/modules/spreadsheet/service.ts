import { randomUUID } from 'node:crypto';
import {
  type FuelUnit,
  type OdometerUnit,
  type SheetPlan,
  SPREADSHEET_FIELDS,
  type SpreadsheetAnalysis,
  type SpreadsheetCommitResult,
  SpreadsheetPlan,
  type SpreadsheetPreview,
  type VehiclePlan,
  vehicleTitle,
} from '@axlebook/shared';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { User } from '../../db/schema';
import type { Ai } from '../../lib/ai';
import { AppError } from '../../lib/errors';
import type { RecordService } from '../records/service';
import { garageVehicleIds, requireVehicle } from '../vehicles/access';
import type { VehicleService } from '../vehicles/service';
import { applyPlan, fingerprint, type PlannedRow } from './apply';
import {
  completeVehicles,
  type ExistingVehicle,
  matchPlan,
  type PlanOptions,
  squash,
} from './plan';
import { headersOf, readWorkbook, type Sheet } from './workbook';

interface Upload {
  userId: number;
  fileName: string;
  sheets: Sheet[];
  expires: number;
}

const TTL_MS = 60 * 60 * 1000;
const MAX_UPLOADS = 30;

export class SpreadsheetImporter {
  private uploads = new Map<string, Upload>();

  constructor(
    private db: DB,
    private config: Config,
    private ai: Ai,
    private vehicles: VehicleService,
    private records: RecordService,
  ) {}

  private prune() {
    const now = Date.now();
    for (const [id, u] of this.uploads) if (u.expires < now) this.uploads.delete(id);
    while (this.uploads.size >= MAX_UPLOADS) {
      const oldest = this.uploads.keys().next().value;
      if (oldest == null) break;
      this.uploads.delete(oldest);
    }
  }

  private upload(user: User, id: string): Upload {
    const u = this.uploads.get(id);
    if (!u || u.userId !== user.id || u.expires < Date.now()) throw new AppError('upload_expired');
    u.expires = Date.now() + TTL_MS;
    return u;
  }

  /** Vehicles this user can import into. */
  private async editable(user: User): Promise<ExistingVehicle[]> {
    let ids: number[];
    if (user.role === 'viewer') return [];
    if (user.role === 'admin') {
      ids = (
        await this.db.selectFrom('vehicles').select('id').where('owner_id', '=', user.id).execute()
      ).map((r) => r.id);
      for (const [id, a] of await garageVehicleIds(this.db, user))
        if (a !== 'view' && !ids.includes(id)) ids.push(id);
    } else {
      ids = [...(await garageVehicleIds(this.db, user))]
        .filter(([, a]) => a !== 'view')
        .map(([id]) => id);
    }
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', 'in', ids)
      .where('archived_at', 'is', null)
      .execute();
    return rows.map((v) => ({
      id: v.id,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      nickname: v.nickname,
      unitNumber: v.unit_number,
      vin: v.vin,
      category: v.category,
      odometerUnit: v.odometer_unit as OdometerUnit,
      fuelUnit: v.fuel_unit as FuelUnit,
      fuelType: v.fuel_type as VehiclePlan['fuelType'],
    }));
  }

  private async options(user: User, fileName: string): Promise<PlanOptions> {
    const metric = this.config.defaults.unitSystem === 'metric';
    const pref = await this.db
      .selectFrom('users')
      .select('unit_system')
      .where('id', '=', user.id)
      .executeTakeFirst();
    const m = pref?.unit_system ? pref.unit_system === 'metric' : metric;
    return {
      fileName,
      existing: await this.editable(user),
      defaultUnits: m
        ? { odometerUnit: 'km', fuelUnit: 'l', dateOrder: 'dmy' }
        : { odometerUnit: 'mi', fuelUnit: 'gal_us', dateOrder: 'mdy' },
    };
  }

  /** Read the file, keep it for an hour, and propose a plan (matched, then refined by the local AI). */
  async analyze(
    user: User,
    fileName: string,
    data: Buffer,
    useAi: boolean,
  ): Promise<SpreadsheetAnalysis> {
    if (user.role === 'viewer') throw new AppError('forbidden');
    const sheets = await readWorkbook(fileName, data);
    const opts = await this.options(user, fileName);
    let plan = matchPlan(sheets, opts);
    let planSource: SpreadsheetAnalysis['planSource'] = 'matcher';
    let aiError: string | null = null;
    if (useAi && this.ai.enabled) {
      try {
        plan = await this.aiPlan(sheets, plan, opts);
        planSource = 'ai';
      } catch (err) {
        aiError = err instanceof AppError ? String(err.params?.reason ?? err.code) : 'error';
      }
    } else if (useAi) {
      aiError = 'disabled';
    }
    this.prune();
    const uploadId = randomUUID();
    this.uploads.set(uploadId, { userId: user.id, fileName, sheets, expires: Date.now() + TTL_MS });
    return {
      uploadId,
      fileName,
      sheets: sheets.map((s) => {
        const sp = plan.sheets.find((p) => p.sheet === s.name);
        const headerRow = sp?.headerRow ?? 0;
        return {
          name: s.name,
          rowCount: Math.max(0, s.rows.length - headerRow - 1),
          headers: headersOf(s.rows, headerRow),
          sample: s.rows
            .slice(headerRow + 1, headerRow + 6)
            .map((r) => r.map((c) => c.slice(0, 80))),
        };
      }),
      plan,
      planSource,
      aiError,
    };
  }

  /**
   * Ask the local model to read the sheets and improve the plan. Everything it returns is checked
   * against the real headers and data; anything that doesn't fit falls back to the matcher's choice.
   */
  private async aiPlan(
    sheets: Sheet[],
    base: SpreadsheetPlan,
    opts: PlanOptions,
  ): Promise<SpreadsheetPlan> {
    const brief = sheets.slice(0, 8).map((s) => {
      const p = base.sheets.find((x) => x.sheet === s.name);
      const hr = p?.headerRow ?? 0;
      return {
        sheet: s.name,
        rows: s.rows.length,
        firstRows: s.rows.slice(0, hr + 7).map((r) => r.slice(0, 20).map((c) => c.slice(0, 32))),
      };
    });
    const out = await this.ai.json(SpreadsheetPlan, {
      maxTokens: 4000,
      system: [
        'You map a spreadsheet of vehicle maintenance and fuel logs onto an import plan. Answer only with JSON matching the schema.',
        'Rules:',
        '- Column names must be copied exactly from the header row, or null.',
        '- headerRow is the 0-based index of the row holding column names.',
        '- A sheet holding several vehicles uses vehicleColumn; otherwise set vehicleKey to the vehicle the sheet is about (often the sheet name).',
        '- kindValues maps each distinct value of kindColumn to service, repair, upgrade, fuel, expense or skip.',
        '- Each entry in vehicles is one vehicle: key is the exact text that names it (vehicleKey or a vehicleColumn value). Fill in year, make, model, category (car, motorcycle, dirtbike, atv, snowmobile, semi, trailer) and units from the names and headers.',
        '- odometerUnit is hr for engine hours; fuelUnit is kwh for electric vehicles.',
        '- Use existingVehicleId only for a listed existing vehicle that is clearly the same one.',
        '- Leave out sheets that are summaries or charts (include false).',
      ].join('\n'),
      user: [
        `File: ${opts.fileName}`,
        `Existing vehicles: ${JSON.stringify(opts.existing.map((v) => ({ id: v.id, name: [v.nickname, vehicleTitle({ year: v.year, make: v.make, model: v.model, trim: v.trim })].filter(Boolean).join(' · ') })))}`,
        `Sheets: ${JSON.stringify(brief)}`,
        `A starting plan from simple header matching (improve it): ${JSON.stringify(base)}`,
      ].join('\n\n'),
    });
    return this.sanitize(sheets, out, base, opts);
  }

  /** Keep only the parts of a proposed plan that fit the data. Used for AI plans and user edits alike. */
  sanitize(
    sheets: Sheet[],
    proposed: SpreadsheetPlan,
    base: SpreadsheetPlan | null,
    opts: PlanOptions,
  ): SpreadsheetPlan {
    const plans: SheetPlan[] = [];
    for (const sheet of sheets) {
      const fallback = base?.sheets.find((p) => p.sheet === sheet.name);
      const p = proposed.sheets.find((x) => x.sheet === sheet.name);
      if (!p) {
        if (fallback) plans.push(fallback);
        continue;
      }
      const headerRow =
        p.headerRow < Math.min(sheet.rows.length, 20) ? p.headerRow : (fallback?.headerRow ?? 0);
      const headers = headersOf(sheet.rows, headerRow);
      const sameHeader = fallback?.headerRow === headerRow;
      // Proposed headers that exist win. Where the proposal leaves a field empty, the matcher's
      // header comes back (small models drop fields) unless the proposal used it for something else.
      const ok = (h: string | null | undefined): h is string => h != null && headers.includes(h);
      const proposedCols: Record<string, string | null> = {
        ...Object.fromEntries(
          SPREADSHEET_FIELDS.map((f) => [f, ok(p.columns[f]) ? p.columns[f] : null]),
        ),
        vehicle: ok(p.vehicleColumn) ? p.vehicleColumn : null,
        kind: ok(p.kindColumn) ? p.kindColumn : null,
      };
      const fallbackCols: Record<string, string | null | undefined> = {
        ...(fallback?.columns ?? {}),
        vehicle: fallback?.vehicleColumn,
        kind: fallback?.kindColumn,
      };
      const used = new Set(Object.values(proposedCols).filter(Boolean));
      for (const f of Object.keys(proposedCols)) {
        const alt = fallbackCols[f];
        if (proposedCols[f] == null && base && sameHeader && ok(alt) && !used.has(alt)) {
          proposedCols[f] = alt;
          used.add(alt);
        }
      }
      const columns = Object.fromEntries(
        SPREADSHEET_FIELDS.map((f) => [f, proposedCols[f] ?? null]),
      ) as SheetPlan['columns'];
      const kindColumn = proposedCols.kind ?? null;
      const ki = kindColumn ? headers.indexOf(kindColumn) : -1;
      const distinct = new Set(
        ki < 0
          ? []
          : sheet.rows
              .slice(headerRow + 1)
              .map((r) => (r[ki] ?? '').trim().toLowerCase())
              .filter(Boolean),
      );
      const kindValues = [
        ...p.kindValues.filter((k) => distinct.has(k.value.trim().toLowerCase())),
        ...(fallback?.kindColumn === kindColumn ? (fallback?.kindValues ?? []) : []),
      ].filter(
        (k, i, all) => all.findIndex((x) => x.value.toLowerCase() === k.value.toLowerCase()) === i,
      );
      const mapped = new Set([...Object.values(columns), kindColumn].filter(Boolean));
      const merged: SheetPlan = {
        sheet: sheet.name,
        include: p.include,
        headerRow,
        vehicleColumn: proposedCols.vehicle ?? null,
        vehicleKey: p.vehicleKey?.trim().slice(0, 120) || null,
        kindColumn,
        kindValues,
        defaultKind: p.defaultKind,
        columns,
        extraNoteColumns: [
          ...new Set(p.extraNoteColumns.filter((h) => headers.includes(h) && !mapped.has(h))),
        ].slice(0, 12),
        dateOrder: p.dateOrder,
      };
      // A plan that reads fewer dates than the fallback is worse; don't take it.
      if (fallback && base && merged.include && fallback.include) {
        const good = (sp: SheetPlan) =>
          applyPlan([sheet], { sheets: [sp], vehicles: [] }, opts.fileName).rows.filter(
            (r) => r.input,
          ).length;
        if (good(merged) < good(fallback) * 0.8) {
          plans.push({ ...fallback, include: merged.include });
          continue;
        }
      }
      plans.push(merged);
    }
    const allowed = new Set(opts.existing.map((v) => v.id));
    const given = proposed.vehicles.map((v) => ({
      ...v,
      existingVehicleId:
        v.existingVehicleId != null && allowed.has(v.existingVehicleId)
          ? v.existingVehicleId
          : null,
      make: v.make?.trim().slice(0, 60) || null,
      model: v.model?.trim().slice(0, 60) || null,
      trim: v.trim?.trim().slice(0, 60) || null,
      nickname: v.nickname?.trim().slice(0, 60) || null,
      year:
        v.year != null && v.year >= 1886 && v.year <= new Date().getFullYear() + 2 ? v.year : null,
    }));
    // AI entries fill gaps the matcher left, but keep the matcher's parse where the AI gave nothing.
    const fromBase = new Map((base?.vehicles ?? []).map((v) => [squash(v.key), v]));
    const merged = given.map((g) => {
      const b = fromBase.get(squash(g.key));
      return b && base
        ? {
            ...g,
            year: g.year ?? b.year,
            make: g.make ?? b.make,
            model: g.model ?? b.model,
            trim: g.trim ?? b.trim,
            nickname: g.nickname ?? b.nickname,
          }
        : g;
    });
    for (const b of base?.vehicles ?? [])
      if (!merged.some((g) => squash(g.key) === squash(b.key))) merged.push(b);
    return { sheets: plans, vehicles: completeVehicles(sheets, plans, merged, opts) };
  }

  private async resolve(user: User, uploadId: string, plan: SpreadsheetPlan) {
    const up = this.upload(user, uploadId);
    const opts = await this.options(user, up.fileName);
    const clean = this.sanitize(up.sheets, plan, null, opts);
    const { rows } = applyPlan(up.sheets, clean, up.fileName);
    const byKey = new Map(clean.vehicles.map((v) => [squash(v.key), v]));

    // Duplicate check against what's already in existing vehicles, and within the file.
    const existingIds = [
      ...new Set(
        clean.vehicles.map((v) => v.existingVehicleId).filter((id): id is number => id != null),
      ),
    ];
    const seen = new Map<number | string, Set<string>>();
    if (existingIds.length) {
      const recs = await this.db
        .selectFrom('records')
        .select(['vehicle_id', 'kind', 'date', 'odometer', 'cost', 'title'])
        .where('vehicle_id', 'in', existingIds)
        .execute();
      for (const r of recs) {
        const set = seen.get(r.vehicle_id) ?? new Set<string>();
        set.add(fingerprint(r));
        seen.set(r.vehicle_id, set);
      }
    }
    const duplicates = new Set<PlannedRow>();
    for (const r of rows) {
      if (!r.input) continue;
      const v = byKey.get(squash(r.key));
      const bucket = v?.existingVehicleId ?? squash(r.key);
      const set = seen.get(bucket) ?? new Set<string>();
      const fp = fingerprint({ ...r.input, cost: r.input.cost ?? 0 });
      if (set.has(fp)) duplicates.add(r);
      set.add(fp);
      seen.set(bucket, set);
    }
    return { up, clean, rows, byKey, duplicates };
  }

  private problemsOf(v: VehiclePlan): string[] {
    if (v.existingVehicleId != null) return [];
    const p: string[] = [];
    if (v.year == null) p.push('year');
    if (!v.make) p.push('make');
    if (!v.model) p.push('model');
    return p;
  }

  async preview(user: User, uploadId: string, plan: SpreadsheetPlan): Promise<SpreadsheetPreview> {
    const { clean, rows, byKey, duplicates } = await this.resolve(user, uploadId, plan);
    const vehicles = clean.vehicles.map((v) => {
      const mine = rows.filter(
        (r) => r.input && !duplicates.has(r) && squash(r.key) === squash(v.key),
      );
      const byKind: Record<string, number> = {};
      for (const r of mine) if (r.input) byKind[r.input.kind] = (byKind[r.input.kind] ?? 0) + 1;
      const dates = mine
        .map((r) => r.input?.date ?? '')
        .filter(Boolean)
        .sort();
      return {
        key: v.key,
        label:
          v.make && v.model && v.year
            ? [
                v.nickname,
                vehicleTitle({ year: v.year, make: v.make, model: v.model, trim: v.trim }),
              ]
                .filter(Boolean)
                .join(' · ')
            : v.key,
        existingVehicleId: v.existingVehicleId,
        records: mine.length,
        byKind,
        firstDate: dates[0] ?? null,
        lastDate: dates.at(-1) ?? null,
        problems: this.problemsOf(v),
      };
    });
    const valid = rows.filter((r) => r.input && !duplicates.has(r) && byKey.has(squash(r.key)));
    return {
      plan: clean,
      vehicles,
      total: rows.filter((r) => !r.skip).length,
      valid: valid.length,
      errors: rows
        .filter((r) => r.error)
        .slice(0, 200)
        .map((r) => ({ sheet: r.sheet, row: r.row, message: r.error ?? 'invalid' })),
      sample: valid
        .slice(0, 25)
        .map((r) => ({ vehicle: r.key, sheet: r.sheet, row: r.row, ...r.input })),
    };
  }

  async commit(
    user: User,
    uploadId: string,
    plan: SpreadsheetPlan,
  ): Promise<SpreadsheetCommitResult> {
    if (user.role === 'viewer') throw new AppError('forbidden');
    const { clean, rows, duplicates } = await this.resolve(user, uploadId, plan);
    // Only vehicles that have something to import get created.
    const used = new Set(
      rows.filter((r) => r.input && !duplicates.has(r)).map((r) => squash(r.key)),
    );
    const targets = clean.vehicles.filter((v) => used.has(squash(v.key)));
    for (const v of targets) {
      const missing = this.problemsOf(v);
      if (missing.length)
        throw new AppError('validation_failed', {
          field: 'vehicles',
          key: v.key,
          missing: missing.join(','),
        });
      if (v.existingVehicleId != null)
        await requireVehicle(this.db, user, v.existingVehicleId, 'edit');
    }
    const ids = new Map<string, { vehicleId: number; created: boolean }>();
    for (const v of targets) {
      if (v.existingVehicleId != null) {
        ids.set(squash(v.key), { vehicleId: v.existingVehicleId, created: false });
        continue;
      }
      const created = await this.vehicles.create(user, {
        category: v.category,
        year: v.year as number,
        make: v.make as string,
        model: v.model as string,
        trim: v.trim,
        nickname: v.nickname,
        odometerUnit: v.odometerUnit,
        fuelUnit: v.fuelUnit,
        fuelType: v.fuelType,
      });
      ids.set(squash(v.key), { vehicleId: created.id, created: true });
    }
    let imported = 0;
    let skipped = duplicates.size + rows.filter((r) => r.skip).length;
    const errors: SpreadsheetCommitResult['errors'] = rows
      .filter((r) => r.error)
      .map((r) => ({ sheet: r.sheet, row: r.row, message: r.error ?? 'invalid' }));
    // Oldest first, so odometer readings and reminders settle in order.
    const todo = rows
      .filter((r) => r.input && !duplicates.has(r) && ids.has(squash(r.key)))
      .sort(
        (a, b) =>
          (a.input?.date ?? '').localeCompare(b.input?.date ?? '') ||
          (a.input?.odometer ?? 0) - (b.input?.odometer ?? 0),
      );
    for (const r of todo) {
      const target = ids.get(squash(r.key));
      if (!target || !r.input) continue;
      try {
        await this.records.create(user, target.vehicleId, r.input);
        imported++;
      } catch (err) {
        skipped++;
        errors.push({
          sheet: r.sheet,
          row: r.row,
          message: err instanceof AppError ? err.code : 'error',
        });
      }
    }
    this.uploads.delete(uploadId);
    return {
      vehicles: targets.map((v) => ({
        key: v.key,
        ...(ids.get(squash(v.key)) as { vehicleId: number; created: boolean }),
      })),
      imported,
      skipped,
      errors: errors.slice(0, 200),
    };
  }
}
