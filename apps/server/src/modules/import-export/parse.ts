import {
  EXPENSE_CATEGORIES,
  RECORD_KINDS,
  type RecordInput,
  type RecordKind,
  toMilli,
} from '@axlebook/shared';

export type CsvFormat = 'axlebook' | 'lubelogger' | 'fuelly' | 'drivvo' | 'simplyauto' | 'custom';
export type DateOrder = 'mdy' | 'dmy';

/** Canonical field → accepted header spellings (compared lowercased, letters and digits only). */
const ALIASES: Record<string, string[]> = {
  date: ['date', 'servicedate', 'filldate'],
  odometer: ['odometer', 'mileage', 'odo', 'odometerreading'],
  kind: ['kind', 'type', 'recordtype'],
  title: ['title', 'description', 'item', 'service'],
  cost: ['cost', 'total', 'totalcost', 'amount', 'price'],
  notes: ['notes', 'note', 'comments', 'comment'],
  tags: ['tags', 'tag'],
  expenseCategory: ['expensecategory', 'category'],
  fuelVolume: ['fuelvolume', 'fuelconsumed', 'gallons', 'liters', 'litres', 'volume'],
  pricePerUnit: ['priceperunit', 'unitprice', 'pricepergallon', 'priceperliter', 'priceperlitre'],
  isFull: ['fulltank', 'isfilltofull', 'filltofull', 'full', 'isfull'],
  missedPrevious: ['missedprevious', 'missedfuelup', 'missed'],
  grade: ['fuelgrade', 'grade', 'octane'],
  station: ['station', 'gasstation', 'location'],
};

export const AXLEBOOK_HEADERS = [
  'date',
  'odometer',
  'kind',
  'title',
  'cost',
  'notes',
  'tags',
  'expense_category',
  'fuel_volume',
  'price_per_unit',
  'full_tank',
  'missed_previous',
  'fuel_grade',
  'station',
] as const;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export function mapHeaders(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(ALIASES))
      if (!map.has(field) && aliases.includes(n)) map.set(field, i);
  });
  return map;
}

export function detectFormat(headers: string[]): CsvFormat {
  const n = new Set(headers.map(norm));
  if (n.has('kind') && n.has('title') && n.has('fuelvolume')) return 'axlebook';
  if (
    n.has('fuelconsumed') ||
    n.has('isfilltofull') ||
    n.has('missedfuelup') ||
    (n.has('description') && n.has('odometer'))
  )
    return 'lubelogger';
  return 'custom';
}

/** "$1,234.56", "1.234,56", "12,5", "3.499" → milli-units. Null for blank, undefined for garbage. */
export function parseAmount(raw: string | undefined): number | null | undefined {
  if (raw == null || raw.trim() === '') return null;
  let s = raw.replace(/[^\d.,-]/g, '');
  if (s === '' || s === '-') return undefined;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever separator comes last is the decimal point.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  return toMilli(s) ?? undefined;
}

export function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback;
  return /^(true|yes|y|1|x|✓)$/i.test(raw.trim());
}

/** ISO, YYYY/MM/DD, or M/D/Y vs D/M/Y (by `order`, unless a part > 12 decides it). */
export function parseDate(raw: string | undefined, order: DateOrder): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
      ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : null;
  };
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (order === 'dmy' ? b > 12 && a <= 12 : a > 12 && b <= 12) [a, b] = [b, a];
    return order === 'dmy' ? valid(y, b, a) : valid(y, a, b);
  }
  return null;
}

export interface ParsedRow {
  row: number;
  input?: RecordInput;
  error?: string;
}

/** Turn CSV rows (header first) into record inputs. `kind` applies when there's no kind column. */
export function rowsToRecords(
  rows: string[][],
  opts: { kind: RecordKind; dateOrder: DateOrder; format?: CsvFormat; lines?: number[] },
): { format: CsvFormat; parsed: ParsedRow[] } {
  const [header = [], ...body] = rows;
  const format = opts.format ?? detectFormat(header);
  const cols = mapHeaders(header);
  const get = (r: string[], f: string) => {
    const i = cols.get(f);
    return i == null ? undefined : r[i]?.trim();
  };
  const tagSplit = format === 'lubelogger' ? /[\s,;]+/ : /[;,]/;

  const parsed = body.map((r, idx): ParsedRow => {
    const row = opts.lines?.[idx] ?? idx + 2; // 1-based, after the header
    const kindRaw = get(r, 'kind')?.toLowerCase();
    const kind = (
      kindRaw && (RECORD_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : opts.kind
    ) as RecordKind;
    const date = parseDate(get(r, 'date'), opts.dateOrder);
    if (!date) return { row, error: 'date' };
    const odoRaw = get(r, 'odometer');
    const odometer = odoRaw ? Math.round(Number(odoRaw.replace(/[^\d.]/g, ''))) : null;
    if (odoRaw && !Number.isFinite(odometer)) return { row, error: 'odometer' };
    const cost = parseAmount(get(r, 'cost'));
    if (cost === undefined) return { row, error: 'cost' };
    const tags = (get(r, 'tags') ?? '')
      .split(tagSplit)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
    const input: RecordInput = {
      kind,
      date,
      odometer,
      title: get(r, 'title') || null,
      cost: Math.max(0, cost ?? 0),
      notes: get(r, 'notes') || null,
      tags,
    };
    if (kind === 'expense') {
      const cat = get(r, 'expenseCategory')?.toLowerCase();
      // "Car insurance" and "Road tax" count as their category too.
      input.expenseCategory = EXPENSE_CATEGORIES.find((c) => cat?.includes(c)) ?? 'other';
    }
    if (kind === 'fuel') {
      const volume = parseAmount(get(r, 'fuelVolume'));
      if (!volume || volume <= 0) return { row, error: 'fuel_volume' };
      const price = parseAmount(get(r, 'pricePerUnit'));
      input.fuel = {
        volume,
        pricePerUnit: price ?? (cost ? Math.round((cost * 1000) / volume) : null),
        isFull: parseBool(get(r, 'isFull'), true),
        missedPrevious: parseBool(get(r, 'missedPrevious'), false),
        grade: get(r, 'grade') || null,
        station: get(r, 'station') || null,
      };
      input.title = null;
    } else if (!input.title) {
      input.title = kind === 'expense' ? (input.expenseCategory ?? 'expense') : kind;
    }
    return { row, input };
  });
  return { format, parsed };
}
