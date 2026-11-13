import type { InstanceSettings } from '@axlebook/shared';
import type { Config } from '../config';
import type { DB } from '../db/connection';
import { getSetting, setSetting } from './settings';

const KEY = 'instance';

export async function getInstanceSettings(db: DB, config: Config): Promise<InstanceSettings> {
  const stored = await getSetting<Partial<InstanceSettings>>(db, KEY, {});
  return {
    currency:
      (await getSetting<string | null>(db, 'currency', null)) ??
      stored.currency ??
      config.defaults.currency,
    soonDays: stored.soonDays ?? 30,
    soonDistanceMi: stored.soonDistanceMi ?? 500,
    soonDistanceKm: stored.soonDistanceKm ?? 800,
    onlineLookups: stored.onlineLookups ?? false,
  };
}

export async function updateInstanceSettings(
  db: DB,
  config: Config,
  patch: Partial<InstanceSettings>,
) {
  const next = { ...(await getInstanceSettings(db, config)), ...patch };
  await setSetting(db, KEY, next);
  await setSetting(db, 'currency', next.currency);
  return next;
}
