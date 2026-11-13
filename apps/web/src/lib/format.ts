import {
  computeEconomy,
  convertDistance,
  type DateFormat,
  displayUnitsFor,
  type FuelUnit,
  formatMoney,
  fromMilli,
  isDistanceUnit,
  nativeEconomy,
  type OdometerUnit,
  type UnitSystem,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authStatusQuery } from '../api/auth';
import { configQuery } from '../api/system';

/**
 * A calendar date (YYYY-MM-DD) the way this person wants dates written: the locale's own style,
 * or a fixed numeric order. No time zones are involved.
 */
export function formatDate(
  iso: string,
  format: DateFormat,
  locale: string,
  style: 'medium' | 'short' = 'medium',
): string {
  const day = iso.slice(0, 10);
  const [y = '', m = '', d = ''] = day.split('-');
  if (format === 'ymd') return day;
  if (format === 'mdy') return `${m}/${d}/${y}`;
  if (format === 'dmy') return `${d}/${m}/${y}`;
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** Locale-, currency- and unit-aware formatters for the signed-in user. */
export function useFormat() {
  const { t, i18n } = useTranslation();
  const { data: config } = useQuery(configQuery);
  const { data: status } = useQuery(authStatusQuery);
  const locale = i18n.language;
  // A person's own currency only changes the symbol; amounts are never converted.
  const currency = status?.user?.currency ?? config?.currency ?? 'USD';
  const dateFormat = status?.user?.dateFormat ?? 'auto';
  const unitSystem: UnitSystem =
    status?.user?.unitSystem ?? config?.defaultUnitSystem ?? 'imperial';
  const display = displayUnitsFor(unitSystem);

  const number = (n: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, opts).format(n);
  const decimals = (n: number, max = 2) => number(n, { maximumFractionDigits: max });

  return {
    currency,
    unitSystem,
    display,
    money: (milli: number, precise = false) => formatMoney(milli, { currency, locale, precise }),
    /** "$2.1K" for chart axes. */
    moneyCompact: (milli: number) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(milli / 1000),
    number,
    decimals,
    /** Calendar date stored as YYYY-MM-DD; formatted without timezone shifts. */
    date: (iso: string, style: 'medium' | 'short' = 'medium') =>
      formatDate(iso, dateFormat, locale, style),
    month: (ym: string) =>
      new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${ym}-01T00:00:00Z`),
      ),
    /** A reading in the vehicle's own unit, as shown on its dash. */
    distance: (value: number, unit: OdometerUnit) =>
      t(`units.distance.${unit}`, { value: number(Math.round(value)) }),
    /** A distance converted to the user's preferred unit. */
    distanceUser: (value: number, unit: OdometerUnit) =>
      isDistanceUnit(unit)
        ? t(`units.distance.${display.distance}`, {
            value: number(Math.round(convertDistance(value, unit, display.distance))),
          })
        : t(`units.distance.${unit}`, { value: number(Math.round(value)) }),
    volume: (milli: number, unit: FuelUnit) =>
      `${decimals(fromMilli(milli), 3)} ${t(`units.fuelShort.${unit}`)}`,
    /** Native economy (vehicle distance per vehicle volume unit) in the user's economy unit. */
    economy: (value: number | null | undefined, odo: OdometerUnit, fuel: FuelUnit) => {
      if (value == null) return null;
      // Engine hours → fuel per hour; EVs → distance per kWh.
      const native = nativeEconomy(value, odo, fuel);
      if (native?.kind === 'per_hour')
        return t('units.perHour', {
          value: decimals(native.value, 2),
          unit: t(`units.fuelShort.${native.unit}`),
        });
      if (native?.kind === 'per_kwh')
        return t('units.perKwh', { value: decimals(native.value, 1), unit: native.unit });
      const v = computeEconomy(value, odo, 1, fuel, display.economy);
      return v == null ? null : t(`units.economy.${display.economy}`, { value: decimals(v, 1) });
    },
    /** milli-currency per vehicle distance unit → per user distance unit. */
    costPerDistance: (milliPerUnit: number | null | undefined, unit: OdometerUnit) => {
      if (milliPerUnit == null) return null;
      if (!isDistanceUnit(unit))
        return formatMoney(Math.round(milliPerUnit), { currency, locale, precise: true });
      const perUser = milliPerUnit / convertDistance(1, unit, display.distance);
      return formatMoney(Math.round(perUser), { currency, locale, precise: true });
    },
  };
}

export type Format = ReturnType<typeof useFormat>;
