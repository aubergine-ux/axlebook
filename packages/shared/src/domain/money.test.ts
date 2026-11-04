import { describe, expect, it } from 'vitest';
import { divideMilli, formatMoney, multiplyMilli, toMilli } from './money';

describe('toMilli', () => {
  it.each([
    ['12', 12000],
    ['12.5', 12500],
    ['3.499', 3499],
    ['3,499', 3499],
    ['0.0005', 1],
    ['0.0004', 0],
    ['-4.20', -4200],
    ['.75', 750],
    ['1 234.56', 1234560],
  ])('parses %s', (input, expected) => {
    expect(toMilli(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.2.3', '.', '--1'])('rejects %s', (input) => {
    expect(toMilli(input)).toBeNull();
  });

  it('rounds numbers', () => {
    expect(toMilli(0.1 + 0.2)).toBe(300);
    expect(toMilli(Number.NaN)).toBeNull();
  });
});

describe('arithmetic', () => {
  it('multiplies volume by price', () => {
    // 12.345 gal × $3.499 = $43.195155 → 43195
    expect(multiplyMilli(12345, 3499)).toBe(43195);
  });
  it('divides total by volume', () => {
    expect(divideMilli(43195, 12345)).toBe(3499);
    expect(divideMilli(1000, 0)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('uses currency digits', () => {
    expect(formatMoney(12500, { currency: 'USD', locale: 'en-US' })).toBe('$12.50');
    expect(formatMoney(1500000, { currency: 'JPY', locale: 'en-US' })).toBe('¥1,500');
  });
  it('shows 3 decimals when precise', () => {
    expect(formatMoney(3499, { currency: 'USD', locale: 'en-US', precise: true })).toBe('$3.499');
    expect(formatMoney(3490, { currency: 'USD', locale: 'en-US', precise: true })).toBe('$3.49');
  });
});
