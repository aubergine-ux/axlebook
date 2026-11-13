import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY_PREFS, digestDue, inQuietHours, parseNotifyPrefs } from './notify';

describe('inQuietHours', () => {
  const night = { quietStart: '22:00', quietEnd: '07:00' };
  it('covers a range that runs past midnight, start included and end not', () => {
    expect(
      ['21:59', '22:00', '23:30', '00:00', '06:59', '07:00', '12:00'].map((c) =>
        inQuietHours(night, c),
      ),
    ).toEqual([false, true, true, true, true, false, false]);
  });
  it('covers a range within one day', () => {
    const nap = { quietStart: '13:00', quietEnd: '14:30' };
    expect(['12:59', '13:00', '14:29', '14:30'].map((c) => inQuietHours(nap, c))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
  it('is off without both ends, or when they are the same', () => {
    expect(inQuietHours({ quietStart: null, quietEnd: null }, '03:00')).toBe(false);
    expect(inQuietHours({ quietStart: '22:00', quietEnd: null }, '23:00')).toBe(false);
    expect(inQuietHours({ quietStart: null, quietEnd: '07:00' }, '03:00')).toBe(false);
    expect(inQuietHours({ quietStart: '08:00', quietEnd: '08:00' }, '08:00')).toBe(false);
  });
});

describe('digestDue', () => {
  const prefs = { digest: true, digestDay: 1, digestHour: 8 };
  const monday = (clock: string) => ({ date: '2026-11-16', weekday: 1, clock });
  it('is due once on its day, from its hour on', () => {
    expect(digestDue(prefs, monday('07:59'), null)).toBe(false);
    expect(digestDue(prefs, monday('08:00'), null)).toBe(true);
    expect(digestDue(prefs, monday('19:40'), '2026-11-09')).toBe(true);
    expect(digestDue(prefs, monday('19:40'), '2026-11-16')).toBe(false);
  });
  it('waits for the right weekday, and never fires when switched off', () => {
    expect(digestDue(prefs, { date: '2026-11-17', weekday: 2, clock: '09:00' }, null)).toBe(false);
    expect(digestDue({ ...prefs, digest: false }, monday('09:00'), null)).toBe(false);
  });
});

describe('parseNotifyPrefs', () => {
  it('fills in defaults and survives junk', () => {
    expect(parseNotifyPrefs(null)).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(parseNotifyPrefs('')).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(parseNotifyPrefs('{not json')).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(parseNotifyPrefs('{"quietStart":"25:00"}')).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(parseNotifyPrefs('{"digest":true,"quietStart":"22:00","quietEnd":"06:30"}')).toEqual({
      ...DEFAULT_NOTIFY_PREFS,
      digest: true,
      quietStart: '22:00',
      quietEnd: '06:30',
    });
    // A returned object is a copy, not the shared defaults.
    expect(parseNotifyPrefs(null)).not.toBe(DEFAULT_NOTIFY_PREFS);
  });
});
