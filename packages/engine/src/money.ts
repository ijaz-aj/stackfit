// Money arithmetic. CONTRIBUTING.md hard rule 1: integer minor units plus an ISO
// currency code, all arithmetic in minor units, formatting only at the render
// boundary. Rule 4 puts it here rather than in a component.
//
// Everything is exact-integer or explicitly-rounded, and rounding is always
// half-away-from-zero, so the same inputs give the same output on any platform.

import {
  CURRENCY_MINOR_UNIT_EXPONENT,
  FX_RATE_SCALE,
  type CurrencyCode,
  type FxConfig,
  type Money,
} from '@stackfit/schema';

export function zeroMoney(currency: CurrencyCode): Money {
  return { amountMinor: 0, currency };
}

/** Rounds half away from zero, so -0.5 → -1 and 0.5 → 1 rather than Math.round's bias. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`cannot add ${a.currency} to ${b.currency}: convert first`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function sumMoney(currency: CurrencyCode, amounts: readonly Money[]): Money {
  return amounts.reduce<Money>((total, amount) => addMoney(total, amount), zeroMoney(currency));
}

export function subtractMoney(a: Money, b: Money): Money {
  return addMoney(a, { amountMinor: -b.amountMinor, currency: b.currency });
}

/**
 * Multiplies by a real-valued factor. A unit count, a rate, a discount. The
 * result is rounded to whole minor units, because a third of a paisa is not a
 * thing anyone can invoice.
 */
export function scaleMoney(amount: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new Error(`cannot scale money by a non-finite factor: ${factor}`);
  }
  return {
    amountMinor: roundHalfAwayFromZero(amount.amountMinor * factor),
    currency: amount.currency,
  };
}

function rateMicrosFor(fx: FxConfig, currency: CurrencyCode): number {
  const rate = fx.rates.find((candidate) => candidate.currency === currency);
  if (rate === undefined) {
    throw new Error(`no FX rate for ${currency} in the rate table dated ${fx.asOf}`);
  }
  return rate.rateMicros;
}

/** BigInt division rounding half away from zero. Keeps FX exact for any amount. */
function divideRoundHalf(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * absNumerator + absDenominator) / (2n * absDenominator);
  return negative ? -quotient : quotient;
}

/**
 * Converts between currencies using the configured rate table.
 *
 * Done in BigInt on purpose. An amount of a few million in INR minor units
 * multiplied by a rate in millionths overflows the 2^53 range where JavaScript
 * numbers stop being exact, and a TCO that silently loses precision on large
 * deals is exactly the drift acceptance test §12.7 exists to catch.
 */
export function convertMoney(amount: Money, to: CurrencyCode, fx: FxConfig): Money {
  if (amount.currency === to) return amount;

  const fromRate = BigInt(rateMicrosFor(fx, amount.currency));
  const toRate = BigInt(rateMicrosFor(fx, to));

  // Adjust for differing minor-unit exponents (all supported currencies are
  // currently 2, so this is a no-op today and correct if a 0-exponent currency
  // such as JPY is ever added).
  const fromExponent = CURRENCY_MINOR_UNIT_EXPONENT[amount.currency];
  const toExponent = CURRENCY_MINOR_UNIT_EXPONENT[to];
  const exponentShift = toExponent - fromExponent;

  let numerator = BigInt(amount.amountMinor) * toRate;
  let denominator = fromRate;

  if (exponentShift > 0) numerator *= 10n ** BigInt(exponentShift);
  if (exponentShift < 0) denominator *= 10n ** BigInt(-exponentShift);

  return { amountMinor: Number(divideRoundHalf(numerator, denominator)), currency: to };
}

/** True when the rate table's own base rate is the identity, as FxConfig requires. */
export function isIdentityBaseRate(fx: FxConfig): boolean {
  return rateMicrosFor(fx, fx.base) === FX_RATE_SCALE;
}

/**
 * Money as a readable string, for a rationale sentence.
 *
 * Hard rule 1 puts formatting at the render boundary and this does not break
 * it: a `rationale` line is prose, already a string by the time anything reads
 * it, so a figure inside one has left the typed world whatever we do. The only
 * question is what it looks like.
 *
 * It must look like the rest of the interface. The first version wrote
 * "USD 2,604" on the reasoning that an engine figure should be visibly an
 * engine figure, and it landed in a card next to "$411,903", the same currency
 * in two notations, which reads as two different currencies. Nobody reading a
 * proposal should have to work out whether those are the same money.
 *
 * So: the same `Intl` call the render boundary makes, with the same fixed
 * locale. Fixed rather than the reader's, because the engine may not vary its
 * output by environment. Two people opening one scenario must see one
 * sentence.
 */
const PROSE_LOCALE: Readonly<Record<string, string>> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'en-IE',
};

export function moneyInWords(amount: Money): string {
  const exponent = CURRENCY_MINOR_UNIT_EXPONENT[amount.currency];
  return new Intl.NumberFormat(PROSE_LOCALE[amount.currency] ?? 'en-US', {
    style: 'currency',
    currency: amount.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount.amountMinor / 10 ** exponent);
}
