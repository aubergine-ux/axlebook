import { describe, expect, it } from 'vitest';
import { decodeTextFile } from './text-file';

describe('decodeTextFile', () => {
  it('reads UTF-8, with or without a BOM', () => {
    const enc = new TextEncoder();
    expect(decodeTextFile(enc.encode('Date,Shop\n2024-01-01,Café'))).toBe(
      'Date,Shop\n2024-01-01,Café',
    );
    expect(decodeTextFile(enc.encode('﻿Date'))).toBe('Date');
  });

  it('falls back to Windows-1252 for CSVs saved by Excel on Windows', () => {
    // "Café 90°F" in cp1252: é = 0xE9, ° = 0xB0.
    const bytes = Uint8Array.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x39, 0x30, 0xb0, 0x46]);
    expect(decodeTextFile(bytes)).toBe('Café 90°F');
  });

  it('refuses binary files', () => {
    expect(decodeTextFile(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      null,
    );
    expect(decodeTextFile(Uint8Array.from([0x61, 0x00, 0x62]))).toBe(null);
    expect(decodeTextFile(new TextEncoder().encode('a,b\n1,2\n\u001a'))).toBe('a,b\n1,2\n');
  });
});
