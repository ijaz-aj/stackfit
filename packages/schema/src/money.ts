// Money. CONTRIBUTING.md hard rule 1: an integer in minor units plus an ISO currency
// code — never a float, never a bare number.
//
// Catalog YAML therefore spells prices out in minor units:
//
//   unitPrice: { amountMinor: 5900, currency: USD }   # USD 59.00
//
// It reads less naturally than `59.00`, and that is the point: a float never
// enters the repo, so no parse step has to round one.

import { z } from 'zod';

import { CurrencyCode } from './enums';

/**
 * ISO 4217 minor-unit exponents for the supported currencies. All three happen
 * to be 2; the table exists so the render boundary asks a lookup rather than
 * assuming, and so adding a 0-exponent currency (JPY, KRW) is a data change.
 */
export const CURRENCY_MINOR_UNIT_EXPONENT: Readonly<Record<CurrencyCode, number>> = Object.freeze({
  USD: 2,
  INR: 2,
  EUR: 2,
});

export const Money = z
  .object({
    /** Integer minor units (cents / paise). May be negative for credits. */
    amountMinor: z.number().int(),
    currency: CurrencyCode,
  })
  .strict();
export type Money = z.infer<typeof Money>;

/** Money that cannot be negative — prices, budgets, costs. */
export const NonNegativeMoney = Money.extend({
  amountMinor: z.number().int().nonnegative(),
});
export type NonNegativeMoney = z.infer<typeof NonNegativeMoney>;
