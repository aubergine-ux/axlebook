import type { TFunction } from 'i18next';
import type { z } from 'zod';

/** Turn Zod issues into one translated message per top-level field. */
export function fieldErrors(issues: z.core.$ZodIssue[], t: TFunction): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? '');
    if (!field || out[field]) continue;
    out[field] = messageFor(issue, t);
  }
  return out;
}

function messageFor(issue: z.core.$ZodIssue, t: TFunction): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined || issue.input === null
        ? t('validation.required')
        : t('validation.number');
    case 'too_small':
      if (issue.origin === 'string') return t('validation.required');
      return t('validation.min', { min: issue.minimum });
    case 'too_big':
      if (issue.origin === 'string') return t('validation.tooLong', { max: issue.maximum });
      return t('validation.max', { max: issue.maximum });
    default:
      return t('validation.invalid');
  }
}

/**
 * An odometer or hour-meter reading as typed: "84,100" and "84 100" are 84100, "120.5"
 * hours rounds to 121. NaN when it isn't a number.
 */
export function parseReading(raw: string): number {
  const s = raw.trim().replace(/\s*(mi|km|h|hrs?|hours)\.?$/i, '');
  if (/^\d{1,3}([,\s.]\d{3})+$/.test(s)) return Number(s.replace(/[,\s.]/g, ''));
  if (!/^\d+([.,]\d+)?$/.test(s)) return Number.NaN;
  return Math.round(Number(s.replace(',', '.')));
}
