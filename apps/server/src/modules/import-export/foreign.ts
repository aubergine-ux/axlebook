import { parseCsv } from '../../lib/csv';
import { AXLEBOOK_HEADERS } from './parse';

/**
 * Readers for other apps' exports. Each one rewrites the file into Axlebook's own CSV columns
 * (plus the source line of every row and the vehicle it belongs to), so the normal importer does
 * the validation, duplicate check and saving.
 */
export type ForeignFormat = 'fuelly' | 'drivvo' | 'simplyauto';

export interface Normalized {
  format: ForeignFormat;
  /** Axlebook header row, then one row per record. */
  rows: string[][];
  /** Line in the original file for each body row. */
  lines: number[];
  /** Vehicle name for each body row; empty when the file doesn't say. */
  vehicles: string[];
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const COLS = AXLEBOOK_HEADERS.length;
type Field = (typeof AXLEBOOK_HEADERS)[number];

function blank(values: Partial<Record<Field, string>>): string[] {
  const row = new Array<string>(COLS).fill('');
  for (const [k, v] of Object.entries(values)) row[AXLEBOOK_HEADERS.indexOf(k as Field)] = v ?? '';
  return row;
}

/** Look a column up by its squashed header: an exact name first, then a fragment. */
function finder(header: string[]) {
  const names = header.map(norm);
  return (exact: string[], contains: string[] = [], not?: RegExp) => {
    let i = names.findIndex((n) => exact.includes(n));
    if (i < 0) i = names.findIndex((n) => contains.some((c) => n.includes(c)) && !not?.test(n));
    return i;
  };
}

const at = (row: string[], i: number) => (i < 0 ? '' : (row[i] ?? '').trim());
const YES = /^(1|true|yes|y|x|✓|sim|sí|si|tak|ja|oui|igen)$/i;
const flag = (v: string) => (v === '' ? '' : YES.test(v) ? 'true' : 'false');
const invert = (v: string) => (v === '' ? '' : YES.test(v) ? 'false' : 'true');
const num = (v: string) => Number(v.replace(/[^\d.-]/g, ''));

function numbered(text: string): { row: string[]; line: number }[] {
  return parseCsv(text, ',', { keepBlank: true })
    .map((row, i) => ({ row, line: i + 1 }))
    .filter((r) => r.row.some((f) => f.trim() !== ''));
}

function result(format: ForeignFormat, out: { row: string[]; line: number; vehicle: string }[]) {
  return {
    format,
    rows: [[...AXLEBOOK_HEADERS], ...out.map((o) => o.row)],
    lines: out.map((o) => o.line),
    vehicles: out.map((o) => o.vehicle),
  };
}

// ── Fuelly ───────────────────────────────────────────────────────────────────

/** Fuelly's fuel-up export: one row per fill, `price` is per unit, flags are 1/0. */
function fuelly(rows: { row: string[]; line: number }[]): Normalized {
  const [head, ...body] = rows;
  const col = finder(head?.row ?? []);
  const c = {
    date: col(['fuelupdate']),
    odometer: col(['odometer']),
    volume: col(['gallons', 'litres', 'liters']),
    price: col(['price']),
    total: col(['totalcost', 'cost', 'total']),
    partial: col(['partialfuelup']),
    missed: col(['missedfuelup']),
    tags: col(['tags']),
    notes: col(['notes']),
    brand: col(['brand']),
    car: col(['carname']),
  };
  return result(
    'fuelly',
    body.map(({ row, line }) => {
      const volume = at(row, c.volume);
      const price = at(row, c.price);
      let total = at(row, c.total);
      if (!total && volume && price) {
        const t = num(volume) * num(price);
        if (Number.isFinite(t)) total = t.toFixed(2);
      }
      return {
        line,
        vehicle: at(row, c.car),
        row: blank({
          kind: 'fuel',
          date: at(row, c.date),
          odometer: at(row, c.odometer),
          cost: total,
          fuel_volume: volume,
          price_per_unit: price,
          full_tank: invert(at(row, c.partial)),
          missed_previous: flag(at(row, c.missed)),
          tags: at(row, c.tags),
          notes: at(row, c.notes),
          station: at(row, c.brand),
        }),
      };
    }),
  );
}

// ── Drivvo ───────────────────────────────────────────────────────────────────

const DRIVVO_SECTIONS: [RegExp, 'fuel' | 'service' | 'expense'][] = [
  [/^(refuel|abastec|repost|tankow)/, 'fuel'],
  [/^(service|servi)/, 'service'],
  [/^(expense|despesa|gasto|wydat)/, 'expense'],
];

/** Drivvo's export: one file, a `##Section` line before each table, each with its own header. */
function drivvo(rows: { row: string[]; line: number }[]): Normalized {
  const out: { row: string[]; line: number; vehicle: string }[] = [];
  let kind: 'fuel' | 'service' | 'expense' | null = null;
  let col: ReturnType<typeof finder> | null = null;
  for (const { row, line } of rows) {
    const first = (row[0] ?? '').trim();
    if (first.startsWith('##')) {
      const name = norm(first);
      kind = DRIVVO_SECTIONS.find(([re]) => re.test(name))?.[1] ?? null;
      col = null;
      continue;
    }
    if (!kind) continue;
    if (!col) {
      col = finder(row);
      continue;
    }
    const base = {
      date: at(row, col(['date', 'datetime'], ['date'])),
      odometer: at(row, col(['odometer'], ['odometer', 'odo'])),
      cost: at(row, col(['totalcost', 'totalvalue', 'cost', 'value', 'total'], ['totalcost'])),
      notes: at(row, col(['notes', 'note', 'observation', 'comments'], ['note', 'observ'])),
    };
    if (kind === 'fuel') {
      out.push({
        line,
        vehicle: '',
        row: blank({
          ...base,
          kind,
          fuel_volume: at(row, col(['volume', 'totalvolume'], ['volume'], /second|third/)),
          price_per_unit: at(row, col(['price', 'pricel', 'pricegal'], ['price'], /second|third/)),
          full_tank: flag(
            at(row, col(['fulltank', 'filledtankcompletely'], ['fulltank', 'filledtank', 'full'])),
          ),
          missed_previous: flag(at(row, col(['missed'], ['missed', 'forgot']))),
          fuel_grade: at(row, col(['fuel', 'fueltype'])),
          station: at(row, col(['gasstation', 'fuelstation', 'station'], ['station'])),
        }),
      });
    } else {
      const title = at(
        row,
        kind === 'service'
          ? col(['typeofservice', 'service', 'title'], ['typeofservice', 'servicetype'])
          : col(['typeofexpense', 'expense', 'title'], ['typeofexpense', 'expensetype']),
      );
      out.push({
        line,
        vehicle: '',
        row: blank({ ...base, kind, title, expense_category: kind === 'expense' ? title : '' }),
      });
    }
  }
  return result('drivvo', out);
}

// ── Simply Auto ──────────────────────────────────────────────────────────────

/**
 * Simply Auto's Fuel_Log.csv: fill-ups, services and expenses in one table, told apart by
 * `Record Type` (0, 1, 2), with the date split over Day / Month / Year columns.
 */
function simplyAuto(rows: { row: string[]; line: number }[]): Normalized {
  const [head, ...body] = rows;
  const col = finder(head?.row ?? []);
  const c = {
    vehicle: col(['vehicleid', 'vehicle']),
    odometer: col(['odometer']),
    qty: col(['qty', 'quantity']),
    partial: col(['partialtank']),
    missed: col(['missedfillup']),
    total: col(['totalcost', 'cost']),
    octane: col(['octane']),
    brand: col(['fuelbrand']),
    station: col(['fillingstation']),
    notes: col(['notes']),
    day: col(['day']),
    month: col(['month']),
    year: col(['year']),
    type: col(['recordtype']),
    desc: col(['recorddesc']),
  };
  // The app writes months the way Android counts them in some versions (January = 0).
  const zeroBased = body.some(({ row }) => at(row, c.month) === '0');
  const KINDS = ['fuel', 'service', 'expense'] as const;
  return result(
    'simplyauto',
    body.map(({ row, line }) => {
      const kind = KINDS[Number(at(row, c.type) || 0)] ?? 'service';
      const y = at(row, c.year);
      const m = Number(at(row, c.month)) + (zeroBased ? 1 : 0);
      const d = at(row, c.day);
      const date = y && d ? `${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}` : '';
      const desc = at(row, c.desc);
      const station = [at(row, c.station), at(row, c.brand)].filter(Boolean)[0] ?? '';
      return {
        line,
        vehicle: at(row, c.vehicle),
        row: blank({
          kind,
          date,
          odometer: at(row, c.odometer),
          cost: at(row, c.total),
          notes: at(row, c.notes),
          title: kind === 'fuel' ? '' : desc,
          expense_category: kind === 'expense' ? desc : '',
          ...(kind === 'fuel'
            ? {
                fuel_volume: at(row, c.qty),
                full_tank: invert(at(row, c.partial)),
                missed_previous: flag(at(row, c.missed)),
                fuel_grade: at(row, c.octane),
                station,
              }
            : {}),
        }),
      };
    }),
  );
}

/** Recognize a Fuelly, Drivvo or Simply Auto export and rewrite it; null for anything else. */
export function readForeign(text: string): Normalized | null {
  const rows = numbered(text);
  if (rows.length === 0) return null;
  if (rows.some((r) => (r.row[0] ?? '').trim().startsWith('##'))) return drivvo(rows);
  const names = new Set((rows[0]?.row ?? []).map(norm));
  if (names.has('fuelupdate')) return fuelly(rows);
  if (names.has('recordtype') && names.has('partialtank') && names.has('day'))
    return simplyAuto(rows);
  return null;
}
