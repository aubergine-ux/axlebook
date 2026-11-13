import { addDays, daysBetween } from './dates';
import type { DueMode } from './reminder-status';

export interface OdometerPoint {
  date: string;
  odometer: number;
}

/** Shortest stretch of readings worth averaging; less than this is noise. */
const MIN_SPAN_DAYS = 14;
/** Predictions further out than this aren't worth showing. */
const MAX_DAYS_AHEAD = 3650;

/**
 * Average distance (or engine hours) per day from odometer readings.
 * Recent driving counts: readings from the last `windowDays` are used, starting from the last
 * reading before that window. When that stretch is too short, the whole history is used. Null
 * when there isn't enough to go on, or the vehicle hasn't moved.
 */
export function distancePerDay(
  readings: OdometerPoint[],
  todayIso: string,
  windowDays = 180,
): number | null {
  const sorted = [...readings].sort(
    (a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer,
  );
  const rate = (points: OdometerPoint[]) => {
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last) return null;
    const days = daysBetween(first.date, last.date);
    const distance = last.odometer - first.odometer;
    return days >= MIN_SPAN_DAYS && distance > 0 ? distance / days : null;
  };
  const cutoff = addDays(todayIso, -windowDays);
  const firstRecent = sorted.findIndex((p) => p.date >= cutoff);
  const recent = firstRecent < 0 ? [] : sorted.slice(Math.max(0, firstRecent - 1));
  return rate(recent) ?? rate(sorted);
}

export interface DuePrediction {
  /** The day the reminder is expected to come due, or null when it can't be told. */
  predictedDueDate: string | null;
  /** Which axis gets there first. */
  predictedBy: 'date' | 'distance' | null;
}

/**
 * When a reminder will actually come due: its date, or the day the odometer is expected to reach
 * the due reading at the vehicle's usual pace, whichever is first. A distance already passed is
 * due today.
 */
export function predictDue(
  r: { dueMode: DueMode; dueDate: string | null; dueOdometer: number | null },
  currentOdometer: number | null,
  perDay: number | null,
  todayIso: string,
): DuePrediction {
  const byDate = r.dueMode !== 'distance' ? r.dueDate : null;
  let byDistance: string | null = null;
  if (r.dueMode !== 'date' && r.dueOdometer != null && currentOdometer != null) {
    const left = r.dueOdometer - currentOdometer;
    if (left <= 0) byDistance = todayIso;
    else if (perDay != null && perDay > 0) {
      const days = Math.ceil(left / perDay);
      if (days <= MAX_DAYS_AHEAD) byDistance = addDays(todayIso, days);
    }
  }
  if (byDistance && (!byDate || byDistance < byDate))
    return { predictedDueDate: byDistance, predictedBy: 'distance' };
  if (byDate) return { predictedDueDate: byDate, predictedBy: 'date' };
  return { predictedDueDate: null, predictedBy: null };
}
