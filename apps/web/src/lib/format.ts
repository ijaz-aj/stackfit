import { CURRENCY_MINOR_UNIT_EXPONENT, type CurrencyCode, type Money } from '@stackfit/schema';

/**
 * The render boundary (CONTRIBUTING.md hard rule 1). Money is an integer in minor
 * units everywhere else in this repo; this file is the only place it is allowed
 * to become a string with a decimal point in it.
 */
export function formatMoney(
  money: Money,
  options: { readonly decimals?: number; readonly compact?: boolean } = {},
): string {
  const exponent = CURRENCY_MINOR_UNIT_EXPONENT[money.currency];
  const major = money.amountMinor / 10 ** exponent;
  const decimals = options.decimals ?? 0;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...(options.compact === true ? { notation: 'compact' as const } : {}),
  }).format(major);
}

/** Parses what an analyst typed into minor units. Returns null for "not stated". */
export function toMinorUnits(text: string, currency: CurrencyCode): number | null {
  const trimmed = text.replace(/[\s,]/g, '');
  if (trimmed === '') return null;

  const major = Number(trimmed);
  if (!Number.isFinite(major) || major < 0) return null;

  // Rounded, not truncated: 1234.565 typed into a cap is a rounding question,
  // not a licence to drop a paisa silently.
  return Math.round(major * 10 ** CURRENCY_MINOR_UNIT_EXPONENT[currency]);
}

/** Minor units back into something an analyst can edit. */
export function toMajorUnitsText(money: Money | null): string {
  if (money === null) return '';
  const exponent = CURRENCY_MINOR_UNIT_EXPONENT[money.currency];
  const major = money.amountMinor / 10 ** exponent;
  return Number.isInteger(major) ? String(major) : major.toFixed(exponent);
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Title case for an enum value: `open_source_first` → `Open source first`. */
export function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
