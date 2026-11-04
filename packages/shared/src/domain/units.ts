/**
 * Units. A vehicle records usage on its own meter: miles, kilometres, or engine hours
 * (dirt bikes, ATVs, snowmobiles, reefers, equipment). Energy is stored in the vehicle's
 * own unit too: gallons, litres, or kWh for EVs. Hours never convert to distance and kWh
 * never converts to liquid volume; those pairs are reported in their native units.
 */
export const ODOMETER_UNITS = ['mi', 'km', 'hr'] as const;
export type OdometerUnit = (typeof ODOMETER_UNITS)[number];
export type DistanceUnit = Exclude<OdometerUnit, 'hr'>;

export const FUEL_UNITS = ['gal_us', 'gal_uk', 'l', 'kwh'] as const;
export type FuelUnit = (typeof FUEL_UNITS)[number];
export type LiquidUnit = Exclude<FuelUnit, 'kwh'>;

export const UNIT_SYSTEMS = ['imperial', 'metric'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const ECONOMY_UNITS = ['mpg_us', 'mpg_uk', 'l_per_100km', 'km_per_l'] as const;
export type EconomyUnit = (typeof ECONOMY_UNITS)[number];

export const KM_PER_MI = 1.609344;
const LITERS_PER: Record<LiquidUnit, number> = { gal_us: 3.785411784, gal_uk: 4.54609, l: 1 };

export const isDistanceUnit = (u: OdometerUnit): u is DistanceUnit => u !== 'hr';
export const isLiquidUnit = (u: FuelUnit): u is LiquidUnit => u !== 'kwh';

/** Convert between miles and kilometres. Hours only "convert" to hours (anything else is NaN). */
export function convertDistance(value: number, from: OdometerUnit, to: OdometerUnit): number {
  if (from === to) return value;
  if (!isDistanceUnit(from) || !isDistanceUnit(to)) return Number.NaN;
  return from === 'mi' ? value * KM_PER_MI : value / KM_PER_MI;
}

/** Convert between liquid volumes. kWh only "converts" to kWh (anything else is NaN). */
export function convertVolume(value: number, from: FuelUnit, to: FuelUnit): number {
  if (from === to) return value;
  if (!isLiquidUnit(from) || !isLiquidUnit(to)) return Number.NaN;
  return (value * LITERS_PER[from]) / LITERS_PER[to];
}

export interface DisplayUnits {
  distance: DistanceUnit;
  volume: LiquidUnit;
  economy: EconomyUnit;
}

export function displayUnitsFor(system: UnitSystem): DisplayUnits {
  return system === 'metric'
    ? { distance: 'km', volume: 'l', economy: 'l_per_100km' }
    : { distance: 'mi', volume: 'gal_us', economy: 'mpg_us' };
}

/**
 * Convert a distance travelled on a volume of fuel into a standard economy unit.
 * Returns null for non-positive inputs, and for hour meters or kWh (no standard unit;
 * use `nativeEconomy`).
 */
export function computeEconomy(
  distance: number,
  distanceUnit: OdometerUnit,
  volume: number,
  volumeUnit: FuelUnit,
  target: EconomyUnit,
): number | null {
  if (!(distance > 0) || !(volume > 0)) return null;
  if (!isDistanceUnit(distanceUnit) || !isLiquidUnit(volumeUnit)) return null;
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

/**
 * How economy reads when no standard unit applies:
 * - hour meters: fuel per hour (e.g. 1.4 gal/h), since "per hour" is how riders think
 * - kWh with distance: distance per kWh (e.g. 3.6 mi/kWh)
 */
export type NativeEconomy =
  | { kind: 'per_hour'; value: number; unit: FuelUnit }
  | { kind: 'per_kwh'; value: number; unit: DistanceUnit }
  | null;

export function nativeEconomy(
  distancePerVolume: number,
  odo: OdometerUnit,
  fuel: FuelUnit,
): NativeEconomy {
  if (!(distancePerVolume > 0)) return null;
  if (odo === 'hr') return { kind: 'per_hour', value: 1 / distancePerVolume, unit: fuel };
  if (fuel === 'kwh') return { kind: 'per_kwh', value: distancePerVolume, unit: odo };
  return null;
}
