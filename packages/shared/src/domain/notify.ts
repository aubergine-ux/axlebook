import { z } from 'zod';

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** How one person wants to be notified. Times are on the server's clock (its `TZ`). */
export const NotifyPrefs = z.object({
  /** No messages between these times; they're held and sent when quiet hours end. */
  quietStart: Clock.nullable(),
  quietEnd: Clock.nullable(),
  /** A weekly summary of everything overdue or due soon. */
  digest: z.boolean(),
  /** 0 = Sunday … 6 = Saturday */
  digestDay: z.number().int().min(0).max(6),
  /** Hour of the day, 0–23. */
  digestHour: z.number().int().min(0).max(23),
});
export type NotifyPrefs = z.infer<typeof NotifyPrefs>;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  quietStart: null,
  quietEnd: null,
  digest: false,
  digestDay: 1,
  digestHour: 8,
};

/** Reads stored preferences, falling back to the defaults for anything missing or invalid. */
export function parseNotifyPrefs(raw: string | null | undefined): NotifyPrefs {
  try {
    const parsed = NotifyPrefs.partial().safeParse(raw ? JSON.parse(raw) : {});
    if (parsed.success) return { ...DEFAULT_NOTIFY_PREFS, ...parsed.data };
  } catch {
    // Broken JSON: use the defaults.
  }
  return { ...DEFAULT_NOTIFY_PREFS };
}

const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/**
 * Whether `clock` (HH:MM) falls in quiet hours. The start is included and the end is not, and a
 * range may run past midnight (22:00–07:00). Quiet hours need both ends; equal ends mean none.
 */
export function inQuietHours(
  prefs: Pick<NotifyPrefs, 'quietStart' | 'quietEnd'>,
  clock: string,
): boolean {
  if (!prefs.quietStart || !prefs.quietEnd) return false;
  const start = minutes(prefs.quietStart);
  const end = minutes(prefs.quietEnd);
  const now = minutes(clock);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * Whether the weekly digest is due: it's the chosen weekday, the chosen hour has come, and it
 * hasn't already gone out today.
 */
export function digestDue(
  prefs: Pick<NotifyPrefs, 'digest' | 'digestDay' | 'digestHour'>,
  now: { date: string; weekday: number; clock: string },
  lastSentOn: string | null,
): boolean {
  return (
    prefs.digest &&
    now.weekday === prefs.digestDay &&
    minutes(now.clock) >= prefs.digestHour * 60 &&
    lastSentOn !== now.date
  );
}
