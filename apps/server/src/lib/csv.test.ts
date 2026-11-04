import { describe, expect, it } from 'vitest';
import { parseCsv, stringifyCsv } from './csv';

describe('csv', () => {
  it('parses quoted fields, escaped quotes, commas and newlines', () => {
    const text = 'a,b,c\r\n1,"two, too","say ""hi"""\n3,"multi\nline",\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, too', 'say "hi"'],
      ['3', 'multi\nline', ''],
    ]);
  });
  it('strips a BOM and skips blank lines', () => {
    expect(parseCsv('﻿x,y\n\n1,2')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });
  it('round-trips through stringify', () => {
    const rows = [
      ['date', 'notes'],
      ['2026-01-01', 'Pads, "OEM"\nrotors'],
    ];
    expect(parseCsv(stringifyCsv(rows))).toEqual(rows);
  });
  it('neutralizes spreadsheet formulas but keeps negative numbers', () => {
    expect(stringifyCsv([['=HYPERLINK("x")', '-12.5', '@cmd']])).toBe(
      `"'=HYPERLINK(""x"")",-12.5,'@cmd\r\n`,
    );
  });
});
