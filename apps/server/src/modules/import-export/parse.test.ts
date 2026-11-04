import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../lib/csv';
import { detectFormat, parseAmount, parseBool, parseDate, rowsToRecords } from './parse';

describe('parseAmount', () => {
  it.each([
    ['$1,234.56', 1_234_560],
    ['1.234,56 €', 1_234_560],
    ['12,5', 12_500],
    ['3.499', 3_499],
    ['1,234,567', 1_234_567_000],
    ['', null],
    ['  ', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });
  it('rejects text', () => {
    expect(parseAmount('n/a')).toBeUndefined();
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-03-14', 'mdy', '2026-03-14'],
    ['2026-03-14T10:00:00', 'mdy', '2026-03-14'],
    ['3/14/2026', 'mdy', '2026-03-14'],
    ['14/3/2026', 'mdy', '2026-03-14'], // day > 12 decides
    ['14.03.2026', 'dmy', '2026-03-14'],
    ['04/05/26', 'dmy', '2026-05-04'],
    ['04/05/26', 'mdy', '2026-04-05'],
    ['2/30/2026', 'mdy', null],
    ['yesterday', 'mdy', null],
  ] as const)('%s (%s) → %s', (raw, order, expected) => {
    expect(parseDate(raw, order)).toBe(expected);
  });
});

describe('parseBool', () => {
  it('reads the usual spellings', () => {
    expect(['True', 'yes', '1', 'x'].map((v) => parseBool(v, false))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(['False', 'no', '0'].map((v) => parseBool(v, true))).toEqual([false, false, false]);
    expect(parseBool('', true)).toBe(true);
  });
});

describe('rowsToRecords', () => {
  it('reads LubeLogger fuel exports (experimental preset)', () => {
    const csv = parseCsv(
      'Date,Odometer,FuelConsumed,Cost,FuelEconomy,IsFillToFull,MissedFuelUp,Notes,Tags\n' +
        '1/15/2024,61402,10.82,37.86,19.4,True,False,Costco,commute highway\n' +
        '1/29/2024,61612,5.1,17.85,0,False,True,,\n',
    );
    expect(detectFormat(csv[0] as string[])).toBe('lubelogger');
    const { format, parsed } = rowsToRecords(csv, { kind: 'fuel', dateOrder: 'mdy' });
    expect(format).toBe('lubelogger');
    expect(parsed[0]?.input).toMatchObject({
      kind: 'fuel',
      date: '2024-01-15',
      odometer: 61402,
      cost: 37_860,
      notes: 'Costco',
      tags: ['commute', 'highway'],
      fuel: { volume: 10_820, isFull: true, missedPrevious: false, pricePerUnit: 3_499 },
    });
    expect(parsed[1]?.input?.fuel).toMatchObject({ isFull: false, missedPrevious: true });
  });

  it('reads LubeLogger service exports', () => {
    const csv = parseCsv(
      'Date,Odometer,Description,Cost,Notes,Tags\n2024-02-01,61800,Oil change,64.18,0W-20,maintenance\n',
    );
    const { parsed } = rowsToRecords(csv, { kind: 'service', dateOrder: 'mdy' });
    expect(parsed[0]?.input).toMatchObject({
      kind: 'service',
      title: 'Oil change',
      cost: 64_180,
      tags: ['maintenance'],
    });
  });

  it('round-trips Axlebook exports including the kind column', () => {
    const csv = parseCsv(
      'date,odometer,kind,title,cost,notes,tags,expense_category,fuel_volume,price_per_unit,full_tank,missed_previous,fuel_grade,station\n' +
        '2026-01-02,1000,expense,Registration,120.00,,dmv; yearly,registration,,,,,,\n',
    );
    const { format, parsed } = rowsToRecords(csv, { kind: 'service', dateOrder: 'mdy' });
    expect(format).toBe('axlebook');
    expect(parsed[0]?.input).toMatchObject({
      kind: 'expense',
      expenseCategory: 'registration',
      tags: ['dmv', 'yearly'],
      cost: 120_000,
    });
  });

  it('reports bad rows with their line numbers instead of failing the file', () => {
    const csv = parseCsv(
      'Date,Odometer,Description,Cost\nnot a date,1,x,1\n2024-01-01,2,y,abc\n2024-01-01,3,z,5\n',
    );
    const { parsed } = rowsToRecords(csv, { kind: 'repair', dateOrder: 'mdy' });
    expect(parsed.map((p) => p.error ?? 'ok')).toEqual(['date', 'cost', 'ok']);
    expect(parsed[0]?.row).toBe(2);
  });
});
