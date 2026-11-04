import { describe, expect, it } from 'vitest';
import { dataTips, type TipInput } from './tips';

const ok = (economy: number) => ({ status: 'ok' as const, economy });
const base: TipInput = {
  category: 'car',
  fuelType: 'gasoline',
  month: 6,
  fills: [],
  reminders: [],
};
const codes = (i: Partial<TipInput>) => dataTips({ ...base, ...i }).map((t) => t.code);

describe('data-driven tips', () => {
  it('asks for fill-ups when there are none, and adds standing tips for the vehicle type', () => {
    expect(codes({})).toEqual(['no_fuel_data', 'tire_pressure', 'smooth_driving']);
    expect(codes({ category: 'semi' })).toContain('semi_idle');
    expect(codes({ category: 'trailer' })).not.toContain('no_fuel_data');
  });

  it('spots a drop or a rise in recent economy', () => {
    const down = dataTips({
      ...base,
      fills: [ok(30), ok(31), ok(30), ok(29), ok(26), ok(25), ok(25)],
    });
    expect(down[0]).toMatchObject({
      code: 'economy_down',
      severity: 'warning',
      params: { pct: 16 },
    });
    expect(codes({ fills: [ok(25), ok(25), ok(26), ok(25), ok(29), ok(30), ok(30)] })).toContain(
      'economy_up',
    );
    expect(codes({ fills: [ok(25), ok(25), ok(25), ok(25), ok(25), ok(26)] })).not.toContain(
      'economy_down',
    );
  });

  it('flags overdue jobs that cost fuel, but not unrelated ones', () => {
    const c = codes({
      reminders: [
        { title: 'Oil and filter change', status: 'overdue' },
        { title: 'Registration renewal', status: 'overdue' },
      ],
    });
    expect(c.filter((x) => x === 'overdue_affects_economy')).toHaveLength(1);
  });

  it('notices logging habits that blur the average', () => {
    const fills = [
      ok(30),
      { status: 'partial' as const, economy: null },
      { status: 'partial' as const, economy: null },
      { status: 'partial' as const, economy: null },
      ok(30),
      { status: 'missed' as const, economy: null },
    ];
    expect(codes({ fills })).toEqual(expect.arrayContaining(['partial_fills', 'missed_fillups']));
  });

  it('gives seasonal tips for the vehicle type', () => {
    expect(codes({ month: 1 })).toContain('season_winter_fuel');
    expect(codes({ month: 1, fuelType: 'electric' })).toEqual(
      expect.arrayContaining(['season_winter_ev', 'ev_precondition']),
    );
    expect(codes({ month: 10, category: 'motorcycle' })).toContain('season_storage');
    expect(codes({ month: 10, category: 'snowmobile' })).toContain('season_preseason');
    expect(codes({ month: 4, category: 'snowmobile' })).toContain('season_sled_storage');
  });
});

describe('tidy', () => {
  it('drops a sentence the length limit cut off', async () => {
    const { tidy } = await import('./service');
    expect(tidy('Expect about 19 mpg.  Short trips lower it. The owner should expect a')).toBe(
      'Expect about 19 mpg. Short trips lower it.',
    );
    expect(tidy('All fine here.')).toBe('All fine here.');
    expect(tidy('no full stop at all')).toBe('no full stop at all');
  });
});
