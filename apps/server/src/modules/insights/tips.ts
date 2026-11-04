import type { Tip, VehicleCategory } from '@axlebook/shared';

export interface TipInput {
  category: VehicleCategory;
  fuelType: string;
  /** 1–12, today's month (seasonal tips assume the northern hemisphere). */
  month: number;
  /** Fill-ups oldest first, with their segment status and economy. */
  fills: { status: 'baseline' | 'partial' | 'ok' | 'missed' | 'invalid'; economy: number | null }[];
  /** Active reminders: title + status. */
  reminders: { title: string; status: 'overdue' | 'due_soon' | 'upcoming' | 'inactive' }[];
}

const ECONOMY_RELATED = [
  'oil',
  'air filter',
  'spark',
  'plug',
  'tire',
  'tyre',
  'rotation',
  'alignment',
  'belt',
  'chain',
  'clutch',
  'track',
];

const EVERGREEN: Record<VehicleCategory, string[]> = {
  car: ['tire_pressure', 'smooth_driving', 'remove_weight', 'cruise_control'],
  motorcycle: ['moto_chain', 'tire_pressure', 'smooth_driving'],
  dirtbike: ['offroad_air_filter', 'moto_chain'],
  atv: ['offroad_air_filter', 'tire_pressure'],
  snowmobile: ['sled_clutch', 'sled_track'],
  semi: ['semi_idle', 'semi_speed', 'semi_tires_alignment', 'semi_aero'],
  trailer: ['trailer_tires', 'trailer_bearings'],
};

const tip = (
  id: string,
  severity: Tip['severity'],
  code: string,
  params: Tip['params'] = {},
): Tip => ({
  id,
  source: 'data',
  severity,
  code,
  params,
  title: null,
  body: null,
});

/**
 * Tips worked out from the vehicle's own data, no AI needed: trends in economy,
 * overdue jobs that cost fuel, logging habits that blur the numbers, the season,
 * and a couple of standing tips for the kind of vehicle.
 */
export function dataTips(input: TipInput): Tip[] {
  const tips: Tip[] = [];
  const hasFuel = input.category !== 'trailer';
  const electric = input.fuelType === 'electric';

  if (hasFuel) {
    const ok = input.fills
      .filter((f) => f.status === 'ok' && f.economy != null)
      .map((f) => f.economy as number);
    if (input.fills.length === 0) tips.push(tip('no-fuel', 'info', 'no_fuel_data'));
    if (ok.length >= 6) {
      const recent = ok.slice(-3);
      const before = ok.slice(0, -3);
      const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
      const change = avg(recent) / avg(before) - 1;
      if (change <= -0.08)
        tips.push(
          tip('economy-down', 'warning', 'economy_down', { pct: Math.round(-change * 100) }),
        );
      else if (change >= 0.08)
        tips.push(tip('economy-up', 'info', 'economy_up', { pct: Math.round(change * 100) }));
    }
    const last10 = input.fills.slice(-10);
    const partial = last10.filter((f) => f.status === 'partial').length;
    if (last10.length >= 5 && partial / last10.length > 0.4)
      tips.push(
        tip('partial-fills', 'suggestion', 'partial_fills', {
          pct: Math.round((partial / last10.length) * 100),
        }),
      );
    const missed = last10.filter((f) => f.status === 'missed').length;
    if (missed > 0)
      tips.push(tip('missed-fills', 'suggestion', 'missed_fillups', { count: missed }));
  }

  for (const r of input.reminders.filter((x) => x.status === 'overdue')) {
    const t = r.title.toLowerCase();
    if (hasFuel && ECONOMY_RELATED.some((k) => t.includes(k))) {
      tips.push(tip(`overdue-${t}`, 'warning', 'overdue_affects_economy', { title: r.title }));
    }
  }

  const m = input.month;
  const powersports = ['motorcycle', 'dirtbike', 'atv'].includes(input.category);
  if (hasFuel && !electric && (m === 12 || m <= 2))
    tips.push(tip('winter-fuel', 'info', 'season_winter_fuel'));
  if (electric && (m === 12 || m <= 2)) tips.push(tip('winter-ev', 'info', 'season_winter_ev'));
  if (powersports && (m === 10 || m === 11))
    tips.push(tip('storage', 'suggestion', 'season_storage'));
  if ((powersports || input.category === 'snowmobile') && (m === 3 || m === 4)) {
    tips.push(
      tip(
        'spring',
        'suggestion',
        input.category === 'snowmobile' ? 'season_sled_storage' : 'season_spring',
      ),
    );
  }
  if (input.category === 'snowmobile' && m >= 9 && m <= 11)
    tips.push(tip('preseason', 'suggestion', 'season_preseason'));

  const evergreen = (
    electric ? ['ev_precondition', 'ev_battery_care', 'tire_pressure'] : EVERGREEN[input.category]
  ).slice(0, 2);
  for (const code of evergreen) tips.push(tip(`tip-${code}`, 'info', code));

  const order = { warning: 0, suggestion: 1, info: 2 } as const;
  return tips.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 7);
}
