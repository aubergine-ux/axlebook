import {
  divideMilli,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  multiplyMilli,
  RecordInput,
  type RecordKind,
  type SheetPlan,
  type SpreadsheetPlan,
  toMilli,
} from '@axlebook/shared';
import { parseBool, parseDate } from '../import-export/parse';
import { bodyRows, kindOf, rowKeys, squash } from './plan';
import { headersOf, type Sheet } from './workbook';

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
  if (raw == null || raw.trim() === '') return null;
  const s = raw.trim().replace(/\s*(mi|miles|km|kms|hrs?|hours)\.?$/i, '');
  if (/^\d{1,3}([,.\s]\d{3})+$/.test(s)) return Number(s.replace(/[,.\s]/g, ''));
  const n = Number(s.replace(/,/g, '.').replace(/[^\d.]/g, ''));
  if (!/\d/.test(s) || !Number.isFinite(n)) return undefined;
  return Math.round(n);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Dates in any form people type them, plus Excel serial numbers. */
export function parseAnyDate(raw: string | undefined, order: 'mdy' | 'dmy'): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = parseDate(s, order);
  if (iso) return iso;
  // Excel serial day numbers (when a date cell wasn't formatted as a date).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n > 20_000 && n < 80_000)
      return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  }
  // "Jan 5, 2024", "5 January 2024", "January 2024" (first of the month)
  const words = s
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/[,.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const mi = words.findIndex((w) => MONTHS.includes(w.slice(0, 3)) && /^[a-z]+$/.test(w));
  if (mi < 0) return null;
  const nums = words.filter((w) => /^\d+$/.test(w)).map(Number);
  const year = nums.find((n) => n > 31) ?? (nums.length === 2 ? nums[1] : undefined);
  const day = nums.find((n) => n >= 1 && n <= 31 && n !== year) ?? 1;
  if (year == null) return null;
  const y = year < 100 ? 2000 + year : year;
  return parseDate(`${y}-${MONTHS.indexOf((words[mi] ?? '').slice(0, 3)) + 1}-${day}`, order);
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

  return body.map((r, i): PlannedRow => {
    const row = sp.headerRow + 2 + i;
    const base = { sheet: sheet.name, row, key: keys[i] ?? 'Vehicle' };
    const get = (j: number) => (j < 0 ? undefined : (r[j] ?? '').trim() || undefined);

    if (r.some((cell) => TOTALS.test(cell.trim())) && !parseAnyDate(get(c.date), sp.dateOrder))
      return { ...base, skip: true };
    const filled = r.filter((cell) => cell.trim() !== '').length;
    if (filled <= 1 && !get(c.date)) return { ...base, skip: true };

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

/** Same fingerprint as the CSV importer, so re-importing a sheet doesn't duplicate records. */
export const fingerprint = (r: {
  kind: string;
  date: string;
  odometer?: number | null;
  cost?: number | null;
  title?: string | null;
}) => [r.kind, r.date, r.odometer ?? '', r.cost ?? 0, (r.title ?? '').toLowerCase()].join('|');

export const keyOf = squash;
