import { describe, expect, it } from 'vitest';
import { computeFuelEconomy, type FillInput } from './fuel-economy';

let nextId = 1;
const fill = (odometer: number, gallons: number, opts: Partial<FillInput> = {}): FillInput => ({
  id: nextId++,
  date: `2026-01-${String((nextId % 28) + 1).padStart(2, '0')}`,
  odometer,
  volume: Math.round(gallons * 1000),
  isFull: true,
  missedPrevious: false,
  ...opts,
});

describe('computeFuelEconomy', () => {
  it('returns nothing useful for no fills or a single fill', () => {
    expect(computeFuelEconomy([])).toMatchObject({ fills: [], average: null, last: null });
    const r = computeFuelEconomy([fill(1000, 10)]);
    expect(r.fills[0]?.status).toBe('baseline');
    expect(r.average).toBeNull();
  });

  it('computes full-to-full segments', () => {
    const r = computeFuelEconomy([fill(1000, 12), fill(1300, 10), fill(1550, 10)]);
    expect(r.fills.map((f) => f.status)).toEqual(['baseline', 'ok', 'ok']);
    expect(r.fills[1]?.economy).toBeCloseTo(30);
    expect(r.fills[2]?.economy).toBeCloseTo(25);
    // Σ distance / Σ fuel = 550 / 20, not (30 + 25) / 2
    expect(r.average).toBeCloseTo(27.5);
    expect(r.last).toBeCloseTo(25);
  });

  it('carries partial fills into the next full fill', () => {
    const r = computeFuelEconomy([fill(1000, 12), fill(1150, 4, { isFull: false }), fill(1300, 6)]);
    expect(r.fills.map((f) => f.status)).toEqual(['baseline', 'partial', 'ok']);
    expect(r.fills[2]).toMatchObject({ distance: 300, volume: 10_000 });
    expect(r.fills[2]?.economy).toBeCloseTo(30);
  });

  it('voids a segment that contains a missed fill-up and resets the baseline', () => {
    const r = computeFuelEconomy([
      fill(1000, 12),
      fill(1600, 10, { missedPrevious: true }), // a fill-up between was never logged
      fill(1900, 10),
    ]);
    expect(r.fills.map((f) => f.status)).toEqual(['baseline', 'missed', 'ok']);
    expect(r.fills[1]?.economy).toBeNull();
    expect(r.fills[2]?.economy).toBeCloseTo(30);
    expect(r.average).toBeCloseTo(30);
  });

  it('voids the segment when the missed flag is on a partial fill inside it', () => {
    const r = computeFuelEconomy([
      fill(1000, 12),
      fill(1200, 5, { isFull: false, missedPrevious: true }),
      fill(1400, 6),
    ]);
    expect(r.fills[2]?.status).toBe('missed');
    expect(r.average).toBeNull();
  });

  it('ignores fuel added before the first full fill', () => {
    const r = computeFuelEconomy([fill(900, 3, { isFull: false }), fill(1000, 12), fill(1300, 10)]);
    expect(r.fills.map((f) => f.status)).toEqual(['partial', 'baseline', 'ok']);
    expect(r.fills[2]?.volume).toBe(10_000);
  });

  it('sorts by odometer regardless of input order', () => {
    const a = fill(1000, 12);
    const b = fill(1300, 10);
    const c = fill(1550, 10);
    expect(computeFuelEconomy([c, a, b]).average).toBeCloseTo(27.5);
  });

  it('marks duplicate or backwards odometers invalid without breaking later segments', () => {
    const r = computeFuelEconomy([fill(1000, 12), fill(1000, 5), fill(1300, 10)]);
    expect(r.fills.map((f) => f.status)).toEqual(['baseline', 'invalid', 'ok']);
    expect(r.fills[2]?.economy).toBeCloseTo(30);
  });

  it('works in metric units (km per liter)', () => {
    const r = computeFuelEconomy([fill(10_000, 40), fill(10_600, 45)]);
    expect(r.fills[1]?.economy).toBeCloseTo(600 / 45);
  });
});
