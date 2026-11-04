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
