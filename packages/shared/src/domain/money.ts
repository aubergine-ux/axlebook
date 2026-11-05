/**
 * Money is stored as integer thousandths of the instance currency ("milli-units").
 * 3 decimals cover pump prices like $3.499/gal and 3-decimal currencies (KWD, BHD),
 * while keeping sums exact. Never store money as a float.
 */
export const MILLI = 1000;

const DECIMAL_RE = /^([+-])?(\d*)(?:[.,](\d*))?$/;

/** Parse a user-entered decimal ("12.5", "12,50", 12.5) into milli-units. Returns null if invalid. */
export function toMilli(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * MILLI);
  }
  const trimmed = value.trim().replace(/[\s_]/g, '');
  const m = DECIMAL_RE.exec(trimmed);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const whole = m[2] === '' ? 0 : Number(m[2]);
  const fracDigits = (m[3] ?? '').padEnd(4, '0');
  // Round half away from zero on the 4th decimal.
  const frac = Number(fracDigits.slice(0, 3)) + (Number(fracDigits[3]) >= 5 ? 1 : 0);
  return sign * (whole * MILLI + frac);
}

export function fromMilli(milli: number): number {
  return milli / MILLI;
}

/** quantity (milli-units) × unit price (milli-units) → total (milli-units), rounded. */
export function multiplyMilli(quantityMilli: number, priceMilli: number): number {
  return Math.round((quantityMilli * priceMilli) / MILLI);
}

/** total (milli) ÷ quantity (milli) → unit price (milli), rounded. Null when quantity is 0. */
export function divideMilli(totalMilli: number, quantityMilli: number): number | null {
  if (quantityMilli === 0) return null;
  return Math.round((totalMilli * MILLI) / quantityMilli);
}

export interface FormatMoneyOptions {
  currency: string;
  locale?: string;
  /** Show up to 3 decimals (unit prices like 3.499). Defaults to the currency's standard digits. */
  precise?: boolean;
}

export function formatMoney(
  milli: number,
  { currency, locale, precise }: FormatMoneyOptions,
): string {
  const base = new Intl.NumberFormat(locale, { style: 'currency', currency });
  // Currency formats always resolve their digit count (2 for USD, 0 for JPY, 3 for KWD).
  const digits = base.resolvedOptions().maximumFractionDigits as number;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: precise ? Math.max(digits, 3) : digits,
  }).format(fromMilli(milli));
}
