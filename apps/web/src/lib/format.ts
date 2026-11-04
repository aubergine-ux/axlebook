import { formatMoney, type OdometerUnit } from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { configQuery } from '../api/system';

/** Locale- and currency-aware formatters for the current user. */
export function useFormat() {
  const { t, i18n } = useTranslation();
  const { data: config } = useQuery(configQuery);
  const locale = i18n.language;
  const currency = config?.currency ?? 'USD';

  const number = (n: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, opts).format(n);

  return {
    currency,
    money: (milli: number, precise = false) => formatMoney(milli, { currency, locale, precise }),
    number,
    /** Calendar date stored as YYYY-MM-DD; formatted without timezone shifts. */
    date: (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${iso.slice(0, 10)}T00:00:00Z`),
      ),
    distance: (value: number, unit: OdometerUnit) =>
      t(`units.distance.${unit}`, { value: number(value, { maximumFractionDigits: 0 }) }),
  };
}
