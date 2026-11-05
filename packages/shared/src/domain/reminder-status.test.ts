import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, monthKey, today } from './dates';
import {
  compareReminders,
  computeReminderStatus,
  nextDue,
  type ReminderDue,
  type ReminderStatus,
} from './reminder-status';

const base: ReminderDue = {
  dueMode: 'either',
  dueDate: null,
  dueOdometer: null,
  soonDays: 30,
  soonDistance: 500,
  archived: false,
};
const TODAY = '2026-11-04';

describe('computeReminderStatus', () => {
  it.each([
    ['date far away', { dueMode: 'date', dueDate: '2027-03-01' }, null, 'upcoming'],
    ['date within 30 days', { dueMode: 'date', dueDate: '2026-11-30' }, null, 'due_soon'],
    ['date due today', { dueMode: 'date', dueDate: TODAY }, null, 'due_soon'],
    ['date passed', { dueMode: 'date', dueDate: '2026-11-03' }, null, 'overdue'],
    ['distance far away', { dueMode: 'distance', dueOdometer: 90_000 }, 84_000, 'upcoming'],
    ['distance within 500', { dueMode: 'distance', dueOdometer: 84_400 }, 84_000, 'due_soon'],
    ['distance exactly reached', { dueMode: 'distance', dueOdometer: 84_000 }, 84_000, 'due_soon'],
    ['distance passed', { dueMode: 'distance', dueOdometer: 83_688 }, 84_000, 'overdue'],
    [
      'distance with unknown odometer',
      { dueMode: 'distance', dueOdometer: 83_000 },
      null,
      'upcoming',
    ],
    [
      'either: date fine, distance overdue',
      { dueDate: '2027-06-01', dueOdometer: 83_000 },
      84_000,
      'overdue',
    ],
    [
      'either: date soon, distance fine',
      { dueDate: '2026-11-10', dueOdometer: 99_000 },
      84_000,
      'due_soon',
    ],
    [
      'date mode ignores distance',
      { dueMode: 'date', dueDate: '2027-06-01', dueOdometer: 1 },
      84_000,
      'upcoming',
    ],
    [
      'distance mode ignores date',
      { dueMode: 'distance', dueDate: '2020-01-01', dueOdometer: 99_000 },
      84_000,
      'upcoming',
    ],
    ['no due point at all', {}, 84_000, 'upcoming'],
  ] as const)('%s', (_label, patch, odo, expected) => {
    expect(computeReminderStatus({ ...base, ...patch } as ReminderDue, TODAY, odo).status).toBe(
      expected,
    );
  });

  it('reports what is left on each axis', () => {
    const s = computeReminderStatus(
      { ...base, dueDate: '2026-11-14', dueOdometer: 84_312 },
      TODAY,
      84_000,
    );
    expect(s).toEqual({ status: 'due_soon', daysLeft: 10, distanceLeft: 312 });
  });

  it('treats archived reminders as inactive', () => {
    expect(
      computeReminderStatus({ ...base, dueDate: '2020-01-01', archived: true }, TODAY, 0).status,
    ).toBe('inactive');
  });
});

describe('nextDue', () => {
  it('counts from the completion, not from the old due point', () => {
    expect(
      nextDue({ months: 6, distance: 5000 }, { date: '2026-11-04', odometer: 84_120 }),
    ).toEqual({
      dueDate: '2027-05-04',
      dueOdometer: 89_120,
    });
  });
  it('handles single-axis intervals and unknown odometers', () => {
    expect(nextDue({ months: 12, distance: null }, { date: '2026-01-15', odometer: 5 })).toEqual({
      dueDate: '2027-01-15',
      dueOdometer: null,
    });
    expect(
      nextDue({ months: null, distance: 3000 }, { date: '2026-01-15', odometer: null }),
    ).toEqual({
      dueDate: null,
      dueOdometer: null,
    });
  });
});

describe('dates', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-11-04', 24, '2028-11-04'],
  ])('addMonths(%s, %i) = %s', (from, n, expected) => {
    expect(addMonths(from, n)).toBe(expected);
  });
  it('adds days and measures gaps across DST and leap years', () => {
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-11-04', '2026-11-03')).toBe(-1);
  });
});

describe('compareReminders', () => {
  const r = (status: ReminderStatus, daysLeft: number | null, distanceLeft: number | null) => ({
    status,
    daysLeft,
    distanceLeft,
    dueDate: null,
  });

  it('puts overdue first, then the soonest, with unknowns last', () => {
    const list = [
      r('upcoming', 90, null),
      r('overdue', -3, null),
      r('due_soon', null, 200),
      r('due_soon', 10, null),
      r('due_soon', 10, 50),
      r('due_soon', 10, 100),
      r('upcoming', null, null),
      r('inactive', null, null),
    ];
    expect([...list].sort(compareReminders)).toEqual([
      r('overdue', -3, null),
      r('due_soon', 10, 50),
      r('due_soon', 10, 100),
      r('due_soon', 10, null),
      r('due_soon', null, 200),
      r('upcoming', 90, null),
      r('upcoming', null, null),
      r('inactive', null, null),
    ]);
    expect(compareReminders(r('upcoming', null, null), r('upcoming', null, null))).toBe(0);
  });
});

describe('today and monthKey', () => {
  it("gives today's date in a time zone, and the month of a date", () => {
    expect(today('UTC')).toBe(new Date().toISOString().slice(0, 10));
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Kiritimati (UTC+14) and Niue (UTC-11) are never on the same date.
    expect(today('Pacific/Kiritimati')).not.toBe(today('Pacific/Niue'));
    expect(monthKey('2026-11-04')).toBe('2026-11');
  });
});
