// Schemas for the tunable assumption files under data/config/ (CONTRIBUTING.md hard
// rule 6: tunables live in data/, never as literals in code).
//
// Only the FX schema lands in Phase 1, because Money needs it to mean anything.
// sizing-assumptions and labour-rates arrive with the stages that consume them
// (Phases 2 and 3), so their coefficients are reviewed alongside the maths.

import { z } from 'zod';

import { CurrencyCode } from './enums.js';
import { IsoDate, Source } from './pricing.js';

/**
 * Scaling factor for FX rates. Rates are stored as integers in millionths so
 * currency conversion is integer arithmetic end to end — acceptance test §12.7
 * requires USD and INR totals to agree with no floating-point drift.
 *
 *   1 USD = 83.25 INR  →  rateMicros: 83_250_000
 */
export const FX_RATE_SCALE = 1_000_000;

export const FxRate = z
  .object({
    currency: CurrencyCode,
    /** Units of `currency` per one unit of the base currency, × FX_RATE_SCALE. */
    rateMicros: z.number().int().positive(),
  })
  .strict();
export type FxRate = z.infer<typeof FxRate>;

export const FxConfig = z
  .object({
    base: CurrencyCode,
    asOf: IsoDate,
    rates: z.array(FxRate).min(1),
    sources: z.array(Source).min(1),
  })
  .strict()
  .superRefine((config, ctx) => {
    const seen = new Set<CurrencyCode>();
    config.rates.forEach((rate, index) => {
      if (seen.has(rate.currency)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rates', index, 'currency'],
          message: `duplicate FX rate for ${rate.currency}`,
        });
      }
      seen.add(rate.currency);
    });

    for (const currency of CurrencyCode.options) {
      if (!seen.has(currency)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rates'],
          message: `missing an FX rate for supported currency ${currency}`,
        });
      }
    }

    const baseRate = config.rates.find((rate) => rate.currency === config.base);
    if (baseRate !== undefined && baseRate.rateMicros !== FX_RATE_SCALE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rates'],
        message: `the base currency ${config.base} must have rateMicros ${FX_RATE_SCALE}, not ${baseRate.rateMicros}`,
      });
    }
  });
export type FxConfig = z.infer<typeof FxConfig>;
