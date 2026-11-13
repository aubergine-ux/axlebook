import { describe, expect, it } from 'vitest';
import { distancePerDay, predictDue } from './usage';

const today = '2026-11-13';

describe('distancePerDay', () => {
  it('averages over the readings it has', () => {
    expect(
      distancePerDay(
        [
          { date: '2026-10-04', odometer: 50_000 },
          { date: '2026-11-13', odometer: 51_200 },
        ],
        today,
      ),
    ).toBe(30);
  });

  it('follows recent driving, counted from the last reading before the window', () => {
    const perDay = distancePerDay(
      [
        // Two years of barely moving…
        { date: '2024-01-01', odometer: 10_000 },
        { date: '2026-05-01', odometer: 10_500 },
        // …then a new commute. The window (180 days) starts 2026-05-17.
        { date: '2026-08-09', odometer: 13_500 },
        { date: '2026-11-07', odometer: 16_500 },
      ],
      today,
    );
    // 6,000 over the 190 days from the May reading to November, not 6,500 over three years.
    expect(perDay).toBeCloseTo(6000 / 190, 5);
  });

  it('uses the whole history when nothing is recent', () => {
    expect(
      distancePerDay(
        [
          { date: '2025-01-01', odometer: 1000 },
          { date: '2025-04-11', odometer: 2000 },
        ],
        today,
      ),
    ).toBe(10);
    // One reading inside a 5-day window: it's measured from the reading before the window.
    expect(
      distancePerDay(
        [
          { date: '2026-11-13', odometer: 2100 },
          { date: '2025-01-01', odometer: 1000 },
          { date: '2025-04-11', odometer: 2000 },
        ],
        today,
        5,
      ),
    ).toBeCloseTo(100 / 581, 5);
    // A recent stretch of only five days says nothing; fall back to everything.
    expect(
      distancePerDay(
        [
          { date: '2025-01-01', odometer: 1000 },
          { date: '2026-11-05', odometer: 2000 },
          { date: '2026-11-10', odometer: 2100 },
        ],
        today,
        5,
      ),
    ).toBeCloseTo(1100 / 678, 5);
  });

  it('orders same-day readings by odometer', () => {
    expect(
      distancePerDay(
        [
          { date: '2026-11-01', odometer: 1400 },
          { date: '2026-10-01', odometer: 1000 },
          { date: '2026-11-01', odometer: 1310 },
        ],
        today,
      ),
    ).toBeCloseTo(400 / 31, 5);
  });

  it("is null without enough to go on, or when the vehicle hasn't moved", () => {
    expect(distancePerDay([], today)).toBeNull();
    expect(distancePerDay([{ date: '2026-11-01', odometer: 500 }], today)).toBeNull();
    expect(
      distancePerDay(
        [
          { date: '2026-11-01', odometer: 500 },
          { date: '2026-11-10', odometer: 900 },
        ],
        today,
      ),
    ).toBeNull();
    expect(
      distancePerDay(
        [
          { date: '2026-01-01', odometer: 500 },
          { date: '2026-11-10', odometer: 500 },
        ],
        today,
      ),
    ).toBeNull();
  });
});

describe('predictDue', () => {
  const r = (dueMode: 'date' | 'distance' | 'either', dueDate: string | null, odo: number | null) =>
    ({ dueMode, dueDate, dueOdometer: odo }) as const;

  it('turns distance left into a date at the usual pace, rounding up', () => {
    expect(predictDue(r('distance', null, 51_000), 50_000, 30, today)).toEqual({
      predictedDueDate: '2026-12-17', // 34 days
      predictedBy: 'distance',
    });
  });

  it('takes whichever comes first for "either"', () => {
    expect(predictDue(r('either', '2026-12-01', 51_000), 50_000, 30, today)).toEqual({
      predictedDueDate: '2026-12-01',
      predictedBy: 'date',
    });
    expect(predictDue(r('either', '2027-06-01', 51_000), 50_000, 30, today)).toEqual({
      predictedDueDate: '2026-12-17',
      predictedBy: 'distance',
    });
    // No date set: the distance decides.
    expect(predictDue(r('either', null, 51_000), 50_000, 30, today).predictedBy).toBe('distance');
  });

  it('is due today once the distance has passed, whatever the pace', () => {
    expect(predictDue(r('distance', null, 50_000), 50_400, null, today)).toEqual({
      predictedDueDate: today,
      predictedBy: 'distance',
    });
  });

  it('ignores the axis the reminder does not use', () => {
    expect(predictDue(r('date', '2027-01-01', 50_100), 50_000, 30, today)).toEqual({
      predictedDueDate: '2027-01-01',
      predictedBy: 'date',
    });
    expect(predictDue(r('distance', '2026-11-20', 51_000), 50_000, 30, today).predictedBy).toBe(
      'distance',
    );
  });

  it('gives up without a pace, an odometer, or anything close enough to matter', () => {
    const none = { predictedDueDate: null, predictedBy: null };
    expect(predictDue(r('distance', null, 51_000), 50_000, null, today)).toEqual(none);
    expect(predictDue(r('distance', null, 51_000), 50_000, 0, today)).toEqual(none);
    expect(predictDue(r('distance', null, 51_000), null, 30, today)).toEqual(none);
    expect(predictDue(r('distance', null, null), 50_000, 30, today)).toEqual(none);
    expect(predictDue(r('distance', null, 500_000), 50_000, 1, today)).toEqual(none);
    // With a date as well, the date still stands.
    expect(predictDue(r('either', '2027-03-01', 500_000), 50_000, 1, today)).toEqual({
      predictedDueDate: '2027-03-01',
      predictedBy: 'date',
    });
  });
});
