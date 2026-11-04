export const ODOMETER_UNITS = ['mi', 'km'] as const;
export type OdometerUnit = (typeof ODOMETER_UNITS)[number];

export const FUEL_UNITS = ['gal_us', 'gal_uk', 'l'] as const;
export type FuelUnit = (typeof FUEL_UNITS)[number];

export const UNIT_SYSTEMS = ['imperial', 'metric'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const ECONOMY_UNITS = ['mpg_us', 'mpg_uk', 'l_per_100km', 'km_per_l'] as const;
export type EconomyUnit = (typeof ECONOMY_UNITS)[number];

export const KM_PER_MI = 1.609344;
const LITERS_PER: Record<FuelUnit, number> = { gal_us: 3.785411784, gal_uk: 4.54609, l: 1 };

export function convertDistance(value: number, from: OdometerUnit, to: OdometerUnit): number {
  if (from === to) return value;
  return from === 'mi' ? value * KM_PER_MI : value / KM_PER_MI;
}

export function convertVolume(value: number, from: FuelUnit, to: FuelUnit): number {
  if (from === to) return value;
  return (value * LITERS_PER[from]) / LITERS_PER[to];
}

export interface DisplayUnits {
  distance: OdometerUnit;
  volume: FuelUnit;
  economy: EconomyUnit;
}

export function displayUnitsFor(system: UnitSystem): DisplayUnits {
  return system === 'metric'
    ? { distance: 'km', volume: 'l', economy: 'l_per_100km' }
    : { distance: 'mi', volume: 'gal_us', economy: 'mpg_us' };
}

/**
 * Convert a distance travelled on a volume of fuel into the requested economy unit.
 * Returns null for non-positive inputs (economy is undefined).
 */
export function computeEconomy(
  distance: number,
  distanceUnit: OdometerUnit,
  volume: number,
  volumeUnit: FuelUnit,
  target: EconomyUnit,
): number | null {
  if (!(distance > 0) || !(volume > 0)) return null;
  const km = convertDistance(distance, distanceUnit, 'km');
  const liters = convertVolume(volume, volumeUnit, 'l');
  switch (target) {
    case 'km_per_l':
      return km / liters;
    case 'l_per_100km':
      return (liters / km) * 100;
    case 'mpg_us':
      return convertDistance(km, 'km', 'mi') / convertVolume(liters, 'l', 'gal_us');
    case 'mpg_uk':
      return convertDistance(km, 'km', 'mi') / convertVolume(liters, 'l', 'gal_uk');
  }
}
