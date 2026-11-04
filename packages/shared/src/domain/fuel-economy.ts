/**
 * Full-to-full fuel economy.
 *
 * Fill-ups are ordered by odometer (then date, then id). A segment ends at each
 * full fill. Its distance runs from the previous full fill, and its fuel is the sum
 * of every fill after that one, up to and including this one, so partial fills
 * accumulate into the next full fill.
 * If any fill in a segment is flagged `missedPrevious` (the owner didn't log a fill-up
 * before it), the fuel for that segment is unknown: its economy is null and the
 * baseline resets at the full fill that closes it.
 *
 * Volumes are integer milli-units of the vehicle's fuel unit. Economy is returned as
 * distance per (whole) volume unit in the vehicle's own units, e.g. mi per US gallon.
 */
export interface FillInput {
  id: number;
  date: string;
  odometer: number;
  /** milli-units of the vehicle's fuel unit */
  volume: number;
  isFull: boolean;
  missedPrevious: boolean;
}

export type FillStatus =
  /** First full fill: sets the baseline, no economy yet. */
  | 'baseline'
  /** Partial fill: its fuel is carried into the next full fill. */
  | 'partial'
  /** Economy computed. */
  | 'ok'
  /** Segment contains a missed fill-up: economy unknown. */
  | 'missed'
  /** Odometer didn't advance since the previous full fill. */
  | 'invalid';

export interface FillEconomy {
  id: number;
  status: FillStatus;
  /** Distance of the segment closed by this fill. */
  distance: number | null;
  /** Fuel of the segment closed by this fill, milli-units. */
  volume: number | null;
  /** distance per volume unit, or null */
  economy: number | null;
}

export interface FuelEconomyResult {
  fills: FillEconomy[];
  /** Sum over valid segments only. */
  totalDistance: number;
  totalVolume: number;
  /** Σ distance ÷ Σ fuel over valid segments (not an average of averages). */
  average: number | null;
  /** Most recent valid segment's economy. */
  last: number | null;
}

export function sortFills<T extends Pick<FillInput, 'id' | 'date' | 'odometer'>>(fills: T[]): T[] {
  return [...fills].sort(
    (a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date) || a.id - b.id,
  );
}

export function computeFuelEconomy(input: FillInput[]): FuelEconomyResult {
  const fills: FillEconomy[] = [];
  let baseline: number | null = null;
  let accVolume = 0;
  let tainted = false;
  let totalDistance = 0;
  let totalVolume = 0;
  let last: number | null = null;

  for (const f of sortFills(input)) {
    if (baseline === null) {
      // Nothing to measure against yet. Fuel before the first full fill is unmeasurable.
      fills.push({
        id: f.id,
        status: f.isFull ? 'baseline' : 'partial',
        distance: null,
        volume: null,
        economy: null,
      });
      if (f.isFull) baseline = f.odometer;
      continue;
    }
    accVolume += f.volume;
    if (f.missedPrevious) tainted = true;
    if (!f.isFull) {
      fills.push({ id: f.id, status: 'partial', distance: null, volume: null, economy: null });
      continue;
    }
    const distance = f.odometer - baseline;
    if (tainted) {
      fills.push({ id: f.id, status: 'missed', distance, volume: accVolume, economy: null });
    } else if (distance <= 0 || accVolume <= 0) {
      fills.push({ id: f.id, status: 'invalid', distance, volume: accVolume, economy: null });
    } else {
      const economy = distance / (accVolume / 1000);
      fills.push({ id: f.id, status: 'ok', distance, volume: accVolume, economy });
      totalDistance += distance;
      totalVolume += accVolume;
      last = economy;
    }
    baseline = f.odometer;
    accVolume = 0;
    tainted = false;
  }

  return {
    fills,
    totalDistance,
    totalVolume,
    average: totalVolume > 0 ? totalDistance / (totalVolume / 1000) : null,
    last,
  };
}
