import {
  computeEconomy,
  convertDistance,
  displayUnitsFor,
  type FuelUnit,
  formatMoney,
  fromMilli,
  type OdometerUnit,
  type UnitSystem,
} from '@axlebook/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authStatusQuery } from '../api/auth';
import { configQuery } from '../api/system';

/** Locale-, currency- and unit-aware formatters for the signed-in user. */
export function useFormat() {
  const { t, i18n } = useTranslation();
  const { data: config } = useQuery(configQuery);
  const { data: status } = useQuery(authStatusQuery);
  const locale = i18n.language;
  const currency = config?.currency ?? 'USD';
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
      new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(
        new Date(`${iso.slice(0, 10)}T00:00:00Z`),
      ),
    month: (ym: string) =>
      new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${ym}-01T00:00:00Z`),
      ),
    /** A reading in the vehicle's own unit, as shown on its dash. */
    distance: (value: number, unit: OdometerUnit) =>
      t(`units.distance.${unit}`, { value: number(Math.round(value)) }),
    /** A distance converted to the user's preferred unit. */
    distanceUser: (value: number, unit: OdometerUnit) =>
      t(`units.distance.${display.distance}`, {
        value: number(Math.round(convertDistance(value, unit, display.distance))),
      }),
    volume: (milli: number, unit: FuelUnit) =>
      `${decimals(fromMilli(milli), 3)} ${t(`units.fuelShort.${unit}`)}`,
    /** Native economy (vehicle distance per vehicle volume unit) in the user's economy unit. */
    economy: (value: number | null | undefined, odo: OdometerUnit, fuel: FuelUnit) => {
      if (value == null) return null;
      const v = computeEconomy(value, odo, 1, fuel, display.economy);
      return v == null ? null : t(`units.economy.${display.economy}`, { value: decimals(v, 1) });
    },
    /** milli-currency per vehicle distance unit → per user distance unit. */
    costPerDistance: (milliPerUnit: number | null | undefined, unit: OdometerUnit) => {
      if (milliPerUnit == null) return null;
      const perUser = milliPerUnit / convertDistance(1, unit, display.distance);
      return formatMoney(Math.round(perUser), { currency, locale, precise: true });
    },
  };
}

export type Format = ReturnType<typeof useFormat>;
