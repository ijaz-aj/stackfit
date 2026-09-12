import { CURRENCY_MINOR_UNIT_EXPONENT, type CurrencyCode, type Money } from '@stackfit/schema';

/**
 * The locale a currency is read in, not the reader's.
 *
 * Rupees group in lakh and crore: ₹2,03,89,840, and ₹16.4Cr rather than
 * ₹164M. Formatting INR with Western grouping produced ₹20,389,840, which is
 * a number no Indian reader parses at a glance, and India is this tool's
 * primary region, so that was the common case rendered in the foreign
 * convention.
 *
 * Keyed off the *currency* rather than the browser, deliberately. A figure is
 * a fact about the client's money, not about who happens to be looking, and
 * two analysts reading one proposal must see identical numbers.
 */
const LOCALE_FOR: Readonly<Record<CurrencyCode, string>> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'en-IE',
};

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

  if (options.compact === true) {
    // ⚠ Compact notation carries its own precision, and forcing
    // maximumFractionDigits to 0 on top of it collapses every value inside a
    // magnitude bucket onto one label. USD 1,500,000, 2,000,000 and 2,400,000
    // all rendered as "$2M", which put the same label at three different
    // heights on a chart axis and overstated a 1.5M headline figure by a third.
    //
    // One fractional digit is the smallest precision that keeps a nice-numbered
    // tick set distinct. `format.test.ts` sweeps 900+ tick sets across four
    // decades of magnitude asserting exactly that, rather than trusting the
    // reasoning behind it.
    return new Intl.NumberFormat(LOCALE_FOR[money.currency], {
      style: 'currency',
      currency: money.currency,
      notation: 'compact',
      minimumFractionDigits: options.decimals ?? 0,
      maximumFractionDigits: options.decimals ?? 1,
    }).format(major);
  }

  const decimals = options.decimals ?? 0;
  return new Intl.NumberFormat(LOCALE_FOR[money.currency], {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

/**
 * A timestamp a person reads, not one a database prints.
 *
 * The session list showed `2026-09-12 15:27` against every row. That is
 * sortable and precise and it answers the wrong question: an analyst scanning
 * for the session they had open twenty minutes ago is looking for "now-ish",
 * and has to parse a date to find it. Recency is the only thing this column is
 * for, so recency is what it says.
 *
 * Pure, and `now` is a parameter. The comparison is calendar-day rather than
 * elapsed-hours, because 23:50 yesterday and 00:10 today are ten minutes apart
 * and nobody calls that "today".
 */
export function formatWhen(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(then)) / 86_400_000);

  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(then);

  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7)
    return `${new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(then)} ${time}`;

  // Past a week the clock stops mattering and the year starts to.
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(then);
}
