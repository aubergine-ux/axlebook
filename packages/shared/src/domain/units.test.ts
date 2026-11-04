import { describe, expect, it } from 'vitest';
import { computeEconomy, convertDistance, convertVolume, displayUnitsFor } from './units';

describe('conversions', () => {
  it('converts distance both ways', () => {
    expect(convertDistance(100, 'mi', 'km')).toBeCloseTo(160.9344);
    expect(convertDistance(160.9344, 'km', 'mi')).toBeCloseTo(100);
    expect(convertDistance(5, 'km', 'km')).toBe(5);
  });
  it('converts volume', () => {
    expect(convertVolume(1, 'gal_us', 'l')).toBeCloseTo(3.785411784);
    expect(convertVolume(1, 'gal_uk', 'gal_us')).toBeCloseTo(1.20095, 4);
  });
});

describe('computeEconomy', () => {
  it('computes MPG and L/100km', () => {
    expect(computeEconomy(300, 'mi', 10, 'gal_us', 'mpg_us')).toBeCloseTo(30);
    // 30 mpg(US) ≈ 7.84 L/100km
    expect(computeEconomy(300, 'mi', 10, 'gal_us', 'l_per_100km')).toBeCloseTo(7.8405, 3);
    expect(computeEconomy(500, 'km', 40, 'l', 'km_per_l')).toBeCloseTo(12.5);
  });
  it('returns null for non-positive inputs', () => {
    expect(computeEconomy(0, 'mi', 10, 'gal_us', 'mpg_us')).toBeNull();
    expect(computeEconomy(100, 'mi', 0, 'gal_us', 'mpg_us')).toBeNull();
    expect(computeEconomy(-5, 'mi', 1, 'gal_us', 'mpg_us')).toBeNull();
  });
  it('picks display units', () => {
    expect(displayUnitsFor('imperial').economy).toBe('mpg_us');
    expect(displayUnitsFor('metric').distance).toBe('km');
  });
});
