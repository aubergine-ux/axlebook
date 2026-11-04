import { addMonths, daysBetween } from './dates';

export const DUE_MODES = ['date', 'distance', 'either'] as const;
export type DueMode = (typeof DUE_MODES)[number];
export type ReminderStatus = 'overdue' | 'due_soon' | 'upcoming' | 'inactive';

export interface ReminderDue {
  dueMode: DueMode;
  dueDate: string | null;
  dueOdometer: number | null;
  soonDays: number;
  soonDistance: number;
  archived: boolean;
}

export interface ReminderState {
  status: ReminderStatus;
  /** Days until due (negative when overdue), when the date axis applies. */
  daysLeft: number | null;
  /** Distance until due (negative when overdue), when the distance axis applies and the odometer is known. */
  distanceLeft: number | null;
}

const RANK: Record<ReminderStatus, number> = { inactive: 0, upcoming: 1, due_soon: 2, overdue: 3 };
const worst = (a: ReminderStatus, b: ReminderStatus) => (RANK[b] > RANK[a] ? b : a);

/**
 * Status on each active axis; for "either" the worst one wins.
 * Due today (0 days / 0 distance left) counts as due soon; past due is overdue.
 */
export function computeReminderStatus(
  r: ReminderDue,
  todayIso: string,
  currentOdometer: number | null,
): ReminderState {
  if (r.archived) return { status: 'inactive', daysLeft: null, distanceLeft: null };
  let status: ReminderStatus = 'upcoming';
  let daysLeft: number | null = null;
  let distanceLeft: number | null = null;

  if (r.dueMode !== 'distance' && r.dueDate) {
    daysLeft = daysBetween(todayIso, r.dueDate);
    status = worst(
      status,
      daysLeft < 0 ? 'overdue' : daysLeft <= r.soonDays ? 'due_soon' : 'upcoming',
    );
  }
  if (r.dueMode !== 'date' && r.dueOdometer != null && currentOdometer != null) {
    distanceLeft = r.dueOdometer - currentOdometer;
    status = worst(
      status,
      distanceLeft < 0 ? 'overdue' : distanceLeft <= r.soonDistance ? 'due_soon' : 'upcoming',
    );
  }
  return { status, daysLeft, distanceLeft };
}

/**
 * Next due point after completing a recurring reminder: counted from the completion
 * (the record's date and odometer), not from the old due point.
 */
export function nextDue(
  interval: { months: number | null; distance: number | null },
  completed: { date: string; odometer: number | null },
): { dueDate: string | null; dueOdometer: number | null } {
  return {
    dueDate: interval.months ? addMonths(completed.date, interval.months) : null,
    dueOdometer:
      interval.distance && completed.odometer != null
        ? completed.odometer + interval.distance
        : null,
  };
}

/** Sort key: overdue first, then due soon, then upcoming; then soonest. */
export function compareReminders(
  a: ReminderState & { dueDate: string | null },
  b: ReminderState & { dueDate: string | null },
): number {
  return (
    RANK[b.status] - RANK[a.status] ||
    (a.daysLeft ?? Number.POSITIVE_INFINITY) - (b.daysLeft ?? Number.POSITIVE_INFINITY) ||
    (a.distanceLeft ?? Number.POSITIVE_INFINITY) - (b.distanceLeft ?? Number.POSITIVE_INFINITY)
  );
}
