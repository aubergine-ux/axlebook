import { decodeTextFile } from '@axlebook/shared';
import readXlsxFile from 'read-excel-file/node';
import { parseCsv, sniffDelimiter } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { parseDate } from '../import-export/parse';

export interface Sheet {
  name: string;
  /** Non-empty rows only. */
  rows: string[][];
  /** The row number the spreadsheet shows for each of `rows` (1-based), counting the blank ones. */
  rowNumbers?: number[];
}

/** The row number a spreadsheet app would show for `rows[i]`. */
export const rowNumberOf = (sheet: Sheet, i: number) => sheet.rowNumbers?.[i] ?? i + 1;

const MAX_ROWS = 50_000;

function cell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    // Excel dates carry no zone; read them as calendar dates.
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number')
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v).trim();
}

/** Read .xlsx (any number of sheets) or delimited text (.csv/.tsv) into rows of strings. */
export async function readWorkbook(fileName: string, data: Buffer): Promise<Sheet[]> {
  const isZip = data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const isOle = data
    .subarray(0, 8)
    .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (isOle)
    throw new AppError('unsupported_file', { reason: 'xls', hint: 'Save as .xlsx or .csv' });
  let sheets: Sheet[];
  if (isZip) {
    let parsed: Awaited<ReturnType<typeof readXlsxFile>>;
    try {
      parsed = await readXlsxFile(data);
    } catch {
      throw new AppError('unsupported_file', { reason: 'unreadable' });
    }
    sheets = parsed.map((s) => ({ name: s.sheet, rows: s.data.map((r) => r.map(cell)) }));
  } else {
    const text = decodeTextFile(data);
    if (text == null) throw new AppError('unsupported_file', { reason: 'binary' });
    const base = fileName.replace(/\.[^.]+$/, '') || 'Sheet1';
    const rows = parseCsv(text, sniffDelimiter(text), { keepBlank: true });
    sheets = [{ name: base, rows: rows.map((r) => r.map((c) => c.trim())) }];
  }
  sheets = sheets
    .map((s) => {
      const kept = s.rows.flatMap((r, i) => (r.some((c) => c !== '') ? [{ r, n: i + 1 }] : []));
      return { name: s.name, rows: kept.map((k) => k.r), rowNumbers: kept.map((k) => k.n) };
    })
    .filter((s) => s.rows.length > 0);
  if (sheets.length === 0)
    throw new AppError('validation_failed', { field: 'file', reason: 'empty' });
  if (sheets.reduce((n, s) => n + s.rows.length, 0) > MAX_ROWS) {
    throw new AppError('validation_failed', {
      field: 'file',
      reason: 'too_many_rows',
      max: MAX_ROWS,
    });
  }
  return sheets;
}

const looksNumeric = (v: string) =>
  /^[-+$€£¥]?\s?[\d.,]+\s?[%a-z]{0,3}$/i.test(v) || /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(v);

/** The header row: the first of the top 10 rows that has 2+ cells and is mostly text. */
export function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length - 1, 10); i++) {
    const filled = (rows[i] ?? []).filter((c) => c !== '');
    if (
      filled.length >= 2 &&
      filled.filter((c) => !looksNumeric(c)).length >= Math.ceil(filled.length * 0.6)
    )
      return i;
  }
  return 0;
}

/** Header names, with blanks and duplicates made unique ("Notes", "Notes (2)", "Column 5"). */
export function headersOf(rows: string[][], headerRow: number): string[] {
  const raw = rows[headerRow] ?? [];
  const width = Math.max(
    raw.length,
    ...rows.slice(headerRow + 1, headerRow + 50).map((r) => r.length),
  );
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, i) => {
    const base = (raw[i] ?? '').trim() || `Column ${i + 1}`;
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n > 1 ? `${base} (${n})` : base;
  });
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
  // A sentence that mentions a month ("Prices from Oct 30, 2026 …") isn't a date.
  if (words.length > 4 || s.length > 32) return null;
  const mi = words.findIndex((w) => MONTHS.includes(w.slice(0, 3)) && /^[a-z]+$/.test(w));
  if (mi < 0) return null;
  const nums = words.filter((w) => /^\d+$/.test(w)).map(Number);
  const year = nums.find((n) => n > 31) ?? (nums.length === 2 ? nums[1] : undefined);
  const day = nums.find((n) => n >= 1 && n <= 31 && n !== year) ?? 1;
  if (year == null) return null;
  const y = year < 100 ? 2000 + year : year;
  return parseDate(`${y}-${MONTHS.indexOf((words[mi] ?? '').slice(0, 3)) + 1}-${day}`, order);
}
