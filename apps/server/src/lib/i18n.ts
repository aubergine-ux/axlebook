import en from '@axlebook/shared/locales/en/server.json';

const catalogs: Record<string, typeof en> = { en };

/** Minimal server-side translator for notification text: `t('notify.overdue', { title })`. */
export function translator(locale: string | null | undefined) {
  const cat = catalogs[locale ?? 'en'] ?? catalogs[(locale ?? 'en').split('-')[0] as string] ?? en;
  return (key: string, vars: Record<string, string | number> = {}): string => {
    const value = key
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], cat);
    const template = typeof value === 'string' ? value : key;
    return template.replace(/\{\{(\w+)\}\}/g, (_, v: string) => String(vars[v] ?? ''));
  };
}
