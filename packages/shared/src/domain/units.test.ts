import { describe, expect, it } from 'vitest';
import {
  computeEconomy,
  convertDistance,
  convertVolume,
  displayUnitsFor,
  nativeEconomy,
} from './units';

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

describe('hour meters and kWh', () => {
  it('never converts hours to distance or kWh to liquid volume', () => {
    expect(convertDistance(10, 'hr', 'mi')).toBeNaN();
    expect(convertDistance(10, 'hr', 'hr')).toBe(10);
    expect(convertVolume(10, 'kwh', 'l')).toBeNaN();
    expect(computeEconomy(300, 'hr', 10, 'gal_us', 'mpg_us')).toBeNull();
    expect(computeEconomy(300, 'mi', 10, 'kwh', 'mpg_us')).toBeNull();
  });
  it('reports native economy as fuel per hour or distance per kWh', () => {
    // 20 hours on 30 gallons: 0.667 hours per gallon → 1.5 gal/h
    expect(nativeEconomy(20 / 30, 'hr', 'gal_us')).toEqual({
      kind: 'per_hour',
      value: 1.5,
      unit: 'gal_us',
    });
    expect(nativeEconomy(3.6, 'mi', 'kwh')).toEqual({ kind: 'per_kwh', value: 3.6, unit: 'mi' });
    expect(nativeEconomy(30, 'mi', 'gal_us')).toBeNull();
  });
});

describe('ordinary vehicles', () => {
  it('have no native economy: they use computeEconomy', () => {
    expect(nativeEconomy(30, 'mi', 'gal_us')).toBeNull();
    expect(nativeEconomy(0, 'hr', 'l')).toBeNull();
  });

  it('gives MPG in UK gallons and km/L', () => {
    // 300 mi on 10 US gal = 30 MPG (US) = 36.03 MPG (UK) = 12.75 km/L.
    expect(computeEconomy(300, 'mi', 10, 'gal_us', 'mpg_uk')).toBeCloseTo(36.03, 2);
    expect(computeEconomy(300, 'mi', 10, 'gal_us', 'km_per_l')).toBeCloseTo(12.75, 2);
  });
});
