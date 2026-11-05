import {
  convertDistance,
  convertVolume,
  divideMilli,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type FuelUnit,
  multiplyMilli,
  type OdometerUnit,
  RecordInput,
  type RecordKind,
  type SheetPlan,
  type SpreadsheetPlan,
  toMilli,
} from '@axlebook/shared';
import { parseBool } from '../import-export/parse';
import {
  bodyRows,
  fuelUnitFrom,
  kindOf,
  matchColumns,
  odometerUnitFrom,
  rowKeys,
  squash,
} from './plan';
import { headersOf, parseAnyDate, rowNumberOf, type Sheet } from './workbook';

export interface PlannedRow {
  sheet: string;
  /** 1-based row number as the spreadsheet shows it. */
  row: number;
  key: string;
  input?: RecordInput;
  error?: string;
  /** Totals rows, blank-ish rows and rows marked "skip" are left out silently. */
  skip?: true;
}

type NumberStyle = 'dot' | 'comma';

/** Is "," the decimal separator in this column? Decided once from all its values. */
export function numberStyle(values: string[]): NumberStyle {
  let comma = 0;
  let dot = 0;
  for (const raw of values) {
    const v = raw.replace(/[^\d.,]/g, '');
    // "12,5" "1.234,56" are comma-decimal; "12.5" "1,234.56" "3.499" are dot-decimal.
    // "12,345" and "1.234" alone are ambiguous and don't count.
    if (/^\d+,\d{1,2}$/.test(v) || /^\d{1,3}(\.\d{3})+,\d+$/.test(v)) comma++;
    else if (
      /^\d+\.\d{1,2}$/.test(v) ||
      /^\d{1,3}(,\d{3})+\.\d+$/.test(v) ||
      /^\d+\.\d{4,}$/.test(v)
    )
      dot++;
  }
  return comma > dot ? 'comma' : 'dot';
}

/** "$1,234.56" / "1.234,56" / "12,5" / "(45.00)" → a number. Null for blank, undefined for junk. */
export function parseNumber(
  raw: string | undefined,
  style: NumberStyle = 'dot',
): number | null | undefined {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '' || /^[-–—]$|^n\/?a$/i.test(t)) return null;
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t);
  let s = t.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return undefined;
  if (style === 'comma') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if ((s.match(/\./g) ?? []).length > 1) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

/** Odometers are whole numbers; "84,100", "84.100" and "84 100" all mean 84100 here. */
export function parseOdometer(raw: string | undefined): number | null | undefined {
  if (raw == null || raw.trim() === '' || /^[-–—]+$|^n\/?a$/i.test(raw.trim())) return null;
  const s = raw.trim().replace(/\s*(mi|miles|km|kms|hrs?|hours)\.?$/i, '');
  if (/^\d{1,3}([,.\s]\d{3})+$/.test(s)) return Number(s.replace(/[,.\s]/g, ''));
  const n = Number(s.replace(/,/g, '.').replace(/[^\d.]/g, ''));
  if (!/\d/.test(s) || !Number.isFinite(n)) return undefined;
  return Math.round(n);
}

const toMilliAbs = (n: number | null | undefined) => (n == null ? n : toMilli(Math.abs(n)));

function expenseCategoryOf(...texts: (string | undefined)[]): ExpenseCategory {
  for (const t of texts) {
    if (!t) continue;
    const v = t.toLowerCase();
    if ((EXPENSE_CATEGORIES as readonly string[]).includes(v)) return v as ExpenseCategory;
    if (/insur/.test(v)) return 'insurance';
    if (/regist|plate|tags?\b|licen|dmv|2290|irp|permit/.test(v)) return 'registration';
    if (/tax|ifta/.test(v)) return 'tax';
    if (/park/.test(v)) return 'parking';
    if (/toll|ez-?pass|turnpike/.test(v)) return 'toll';
    if (/loan|payment|finance|lease/.test(v)) return 'loan';
  }
  return 'other';
}

const DESCRIPTIVE = /what|did|done|desc|item|job|work|service|detail|repair|task|maint/i;
const TOTALS = /^(totals?|sum|subtotal|grand total|average|avg|mean|ytd)\b/i;

/** A row of column names (a repeated header, or the header of a second table). */
function looksLikeHeader(r: string[]): boolean {
  const cells = r.map((c) => c.trim()).filter(Boolean);
  if (cells.length < 3 || cells.some((c) => c.length > 40 || /\d{3}/.test(c))) return false;
  return Object.keys(matchColumns(cells)).length >= 3;
}

export interface ApplyResult {
  rows: PlannedRow[];
}

/** Turn every included sheet's rows into record inputs (or row errors) according to the plan. */
export function applyPlan(sheets: Sheet[], plan: SpreadsheetPlan, fileName: string): ApplyResult {
  const out: PlannedRow[] = [];
  for (const sp of plan.sheets) {
    if (!sp.include) continue;
    const sheet = sheets.find((s) => s.name === sp.sheet);
    if (!sheet) continue;
    out.push(...applySheet(sheet, sp, fileName));
  }
  return { rows: out };
}

function applySheet(sheet: Sheet, sp: SheetPlan, fileName: string): PlannedRow[] {
  const headers = headersOf(sheet.rows, sp.headerRow);
  const idx = (h: string | null) => (h == null ? -1 : headers.indexOf(h));
  const c = Object.fromEntries(Object.entries(sp.columns).map(([f, h]) => [f, idx(h)])) as Record<
    keyof SheetPlan['columns'],
    number
  >;
  const kindI = idx(sp.kindColumn);
  const extras = sp.extraNoteColumns.map((h) => [h, idx(h)] as const).filter(([, i]) => i >= 0);
  // With no description column, an extra column that reads like one ("What I did") gives the title.
  const describeI = c.title >= 0 ? c.title : (extras.find(([h]) => DESCRIPTIVE.test(h))?.[1] ?? -1);
  const body = bodyRows(sheet, sp);
  const keys = rowKeys(sheet, sp, fileName);
  const colValues = (i: number) => (i < 0 ? [] : body.map((r) => r[i] ?? ''));
  const styles = {
    cost: numberStyle(colValues(c.cost)),
    fuelVolume: numberStyle(colValues(c.fuelVolume)),
    pricePerUnit: numberStyle(colValues(c.pricePerUnit)),
  };
  const kindMap = new Map(sp.kindValues.map((k) => [k.value.trim().toLowerCase(), k.kind]));

  // Once the log ends (a totals row, or the header of another table below it), rows without a
  // date are something else: a footnote, a to-do list, a parts table.
  let ended = false;
  return body.map((r, i): PlannedRow => {
    const row = rowNumberOf(sheet, sp.headerRow + 1 + i);
    const base = { sheet: sheet.name, row, key: keys[i] ?? 'Vehicle' };
    const get = (j: number) => (j < 0 ? undefined : (r[j] ?? '').trim() || undefined);
    const dated = parseAnyDate(get(c.date), sp.dateOrder) != null;

    if (!dated && r.some((cell) => TOTALS.test(cell.trim()))) {
      ended = true;
      return { ...base, skip: true };
    }
    if (!dated && looksLikeHeader(r)) {
      ended = true;
      return { ...base, skip: true };
    }
    if (!dated && ended) return { ...base, skip: true };
    const filled = r.filter((cell) => cell.trim() !== '').length;
    if (filled <= 1 && !dated) return { ...base, skip: true };

    const kindRaw = get(kindI);
    const volumeN = parseNumber(get(c.fuelVolume), styles.fuelVolume);
    let kind: RecordKind;
    if (kindI >= 0 && kindRaw) {
      const mapped = kindMap.get(kindRaw.toLowerCase()) ?? kindOf(kindRaw) ?? sp.defaultKind;
      if (mapped === 'skip') return { ...base, skip: true };
      kind = mapped;
    } else if (volumeN != null && volumeN > 0 && c.fuelVolume >= 0) {
      kind = 'fuel';
    } else if (
      sp.defaultKind === 'fuel' &&
      c.fuelVolume >= 0 &&
      volumeN == null &&
      get(describeI)
    ) {
      // A fuel log with the odd service row mixed in: no fuel amount, but a description.
      kind = kindOf(get(describeI) ?? '') ?? 'service';
      if (kind === 'fuel') kind = 'service';
    } else {
      kind = sp.defaultKind;
    }

    const date = parseAnyDate(get(c.date), sp.dateOrder);
    if (!date) return { ...base, error: get(c.date) ? 'date' : 'date_missing' };
    const odometer = parseOdometer(get(c.odometer));
    if (odometer === undefined) return { ...base, error: 'odometer' };
    const costN = parseNumber(get(c.cost), styles.cost);
    if (costN === undefined) return { ...base, error: 'cost' };
    let cost = toMilliAbs(costN) ?? null;

    const extraNotes = extras
      .filter(([, j]) => j !== describeI || kind === 'fuel')
      .map(([h, j]) => [h, get(j)] as const)
      .filter(([, v]) => v)
      .map(([h, v]) => `${h}: ${v}`);
    const notes = [get(c.notes), ...extraNotes].filter(Boolean).join('\n') || null;
    const tags = (get(c.tags) ?? '')
      .split(/[,;|]/)
      .map((t) => t.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20);
    let title = get(kind === 'fuel' ? c.title : describeI)?.slice(0, 200) ?? null;

    const input: RecordInput = {
      kind,
      date,
      odometer: odometer ?? null,
      title,
      cost: cost ?? 0,
      notes,
      tags,
    };

    if (kind === 'fuel') {
      if (volumeN === undefined) return { ...base, error: 'fuel_volume' };
      const volume = toMilliAbs(volumeN);
      const priceN = parseNumber(get(c.pricePerUnit), styles.pricePerUnit);
      let price = priceN === undefined ? null : (toMilliAbs(priceN) ?? null);
      let vol = volume ?? null;
      // Any two of volume, price and total give the third.
      if (!vol && price && cost) vol = divideMilli(cost, price);
      if (!vol || vol <= 0) return { ...base, error: 'fuel_volume' };
      if (!price && cost) price = divideMilli(cost, vol);
      if (!cost && price) cost = multiplyMilli(vol, price);
      input.cost = cost ?? 0;
      const fullRaw = get(c.isFull);
      input.fuel = {
        volume: vol,
        pricePerUnit: price,
        // "Partial" / "Top-off" in the full column means not full.
        isFull:
          fullRaw && /partial|top|half|no|false|n\b/i.test(fullRaw)
            ? false
            : parseBool(fullRaw, true),
        missedPrevious: parseBool(get(c.missedPrevious), false),
        grade: get(c.grade)?.slice(0, 40) ?? null,
        station: get(c.station)?.slice(0, 120) ?? null,
      };
      // A fuel row's description is usually the station or a note, not a title.
      if (title) {
        input.notes = [title, notes].filter(Boolean).join('\n') || null;
        input.title = null;
      }
    } else {
      if (kind === 'expense')
        input.expenseCategory = expenseCategoryOf(
          get(c.expenseCategory),
          kindRaw,
          title ?? undefined,
        );
      if (!title) {
        // No description column: the kind cell ("Oil change") or the expense category is the best title.
        title =
          (kindRaw &&
          kindMap.get(kindRaw.toLowerCase()) !== undefined &&
          !/^(service|repair|upgrade|expense|maintenance)$/i.test(kindRaw)
            ? kindRaw
            : null) ?? (kind === 'expense' ? (input.expenseCategory ?? 'expense') : kind);
        input.title = title.slice(0, 200);
      }
    }
    const check = RecordInput.safeParse(input);
    if (!check.success) {
      return {
        ...base,
        error: check.error.issues.map((x) => x.path.join('.') || x.message).join(', '),
      };
    }
    return { ...base, input };
  });
}

/**
 * Rows headed for a vehicle already in Axlebook are in the sheet's units ("Miles", "Liters"),
 * which can differ from the vehicle's. Convert them; hours vs distance or kWh vs liquid fuel
 * can't be converted, so those rows become errors rather than wrong numbers.
 */
export function toVehicleUnits(
  rows: PlannedRow[],
  plan: SpreadsheetPlan,
  target: (key: string) => { odometerUnit: OdometerUnit; fuelUnit: FuelUnit } | null,
): PlannedRow[] {
  const units = new Map(
    plan.sheets.map((sp) => [
      sp.sheet,
      {
        odometer: odometerUnitFrom(sp.columns.odometer),
        fuel: fuelUnitFrom(sp.columns.fuelVolume, sp.columns.pricePerUnit, sp.columns.cost),
      },
    ]),
  );
  return rows.map((r) => {
    const to = r.input && target(r.key);
    const from = units.get(r.sheet);
    if (!r.input || !to || !from) return r;
    const input = { ...r.input };
    if (from.odometer && from.odometer !== to.odometerUnit && input.odometer != null) {
      const odo = convertDistance(input.odometer, from.odometer, to.odometerUnit);
      if (!Number.isFinite(odo)) return { ...r, input: undefined, error: 'units' };
      input.odometer = Math.round(odo);
    }
    if (from.fuel && from.fuel !== to.fuelUnit && input.fuel) {
      const vol = convertVolume(input.fuel.volume, from.fuel, to.fuelUnit);
      if (!Number.isFinite(vol) || vol <= 0) return { ...r, input: undefined, error: 'units' };
      const volume = Math.round(vol);
      const price = input.fuel.pricePerUnit;
      input.fuel = {
        ...input.fuel,
        volume,
        pricePerUnit: price == null ? price : Math.round((price * input.fuel.volume) / volume),
      };
    }
    return { ...r, input };
  });
}

/** Same fingerprint as the CSV importer, so re-importing a sheet doesn't duplicate records. */
export const fingerprint = (r: {
  kind: string;
  date: string;
  odometer?: number | null;
  cost?: number | null;
  title?: string | null;
}) => [r.kind, r.date, r.odometer ?? '', r.cost ?? 0, (r.title ?? '').toLowerCase()].join('|');

export const keyOf = squash;
