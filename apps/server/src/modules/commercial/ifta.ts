import {
  convertDistance,
  convertVolume,
  type DistanceUnit,
  isDistanceUnit,
  isLiquidUnit,
  type LiquidUnit,
} from '@axlebook/shared';

export interface IftaReading {
  vehicleId: number;
  date: string;
  odometer: number;
  jurisdiction: string | null;
}
export interface IftaFuel {
  vehicleId: number;
  date: string;
  /** milli-units in the vehicle's fuel unit */
  volume: number;
  jurisdiction: string | null;
}
export interface IftaVehicle {
  id: number;
  odometerUnit: 'mi' | 'km' | 'hr';
  fuelUnit: 'gal_us' | 'gal_uk' | 'l' | 'kwh';
}

export function quarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

/**
 * IFTA worksheet for one quarter.
 *
 * Distance: readings are walked in odometer order; each reading with a jurisdiction marks
 * where the vehicle was from then on (a fill-up or a state-line reading). The distance to
 * the next reading belongs to that jurisdiction, and counts for the quarter when the
 * segment ends inside it. Fuel: purchases in the quarter, grouped by jurisdiction. Taxable
 * fuel = distance ÷ fleet economy (total distance ÷ total fuel), as on the IFTA return.
 */
export function iftaWorksheet(
  vehicles: IftaVehicle[],
  readings: IftaReading[],
  fuel: IftaFuel[],
  range: { from: string; to: string },
  out: { distance: DistanceUnit; volume: LiquidUnit },
) {
  const distance = new Map<string, number>();
  const purchased = new Map<string, number>();
  let unassigned = 0;
  let totalDistance = 0;
  let totalFuel = 0;

  for (const v of vehicles) {
    if (!isDistanceUnit(v.odometerUnit) || !isLiquidUnit(v.fuelUnit)) continue;
    const own = readings
      .filter((r) => r.vehicleId === v.id)
      .sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));
    let where: string | null = null;
    for (let i = 0; i < own.length; i++) {
      const a = own[i] as IftaReading;
      if (a.jurisdiction) where = a.jurisdiction;
      const b = own[i + 1];
      if (!b) break;
      if (b.date < range.from || b.date > range.to) continue;
      const d = convertDistance(b.odometer - a.odometer, v.odometerUnit, out.distance);
      if (!(d > 0)) continue;
      totalDistance += d;
      if (where) distance.set(where, (distance.get(where) ?? 0) + d);
      else unassigned += d;
    }
    for (const f of fuel.filter(
      (x) => x.vehicleId === v.id && x.date >= range.from && x.date <= range.to,
    )) {
      const vol = Math.round(convertVolume(f.volume, v.fuelUnit, out.volume));
      totalFuel += vol;
      const key = f.jurisdiction ?? '—';
      purchased.set(key, (purchased.get(key) ?? 0) + vol);
    }
  }

  const fleetEconomy = totalFuel > 0 ? totalDistance / (totalFuel / 1000) : null;
  const jurisdictions = [...new Set([...distance.keys(), ...purchased.keys()])].sort();
  const rows = jurisdictions.map((j) => {
    const dist = distance.get(j) ?? 0;
    const taxable = fleetEconomy ? Math.round((dist / fleetEconomy) * 1000) : 0;
    const bought = purchased.get(j) ?? 0;
    return {
      jurisdiction: j,
      distance: Math.round(dist * 10) / 10,
      taxableFuel: taxable,
      purchased: bought,
      net: taxable - bought,
    };
  });
  return {
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalFuel,
    fleetEconomy,
    rows,
    unassignedDistance: Math.round(unassigned * 10) / 10,
  };
}
