// Schemas for the tunable assumption files under data/config/ (CONTRIBUTING.md hard
// rule 6: tunables live in data/, never as literals in code).
//
// Only the FX schema lands in Phase 1, because Money needs it to mean anything.
// sizing-assumptions and labour-rates arrive with the stages that consume them
// (Phases 2 and 3), so their coefficients are reviewed alongside the maths.

import { z } from 'zod';

import { CurrencyCode, PricingConfidence, ProductCategory, ScaleClass } from './enums';
import { NonNegativeMoney } from './money';
import { IsoDate, Source } from './pricing';

/**
 * Scaling factor for FX rates. Rates are stored as integers in millionths so
 * currency conversion is integer arithmetic end to end: acceptance test §12.7
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

// ---------------------------------------------------------------------------
// MSSP rate card: data/config/mssp-rate-card.yaml
//
// PROJECT_SPEC §7.4 step 6 wants an MSSP alternative costed against every
// bundle, so the client sees build-vs-buy on one page. That needs a rate card
// with the same shape MSSPs actually quote in.
//
// The shape is a blend. A base platform fee that varies by scale class, plus
// per-endpoint and per-GB/day components. Published SMB quotes are what force
// this: a 50-endpoint client is quoted USD 1,500–5,000 a month, which a pure
// per-endpoint rate of USD 8–35 cannot reach. Most of a small client's bill is
// a fixed platform and staffing cost, and a model without a base fee
// understates small engagements and overstates large ones.
// ---------------------------------------------------------------------------

export const MsspServiceLevel = z.enum([
  /** Monitoring and alerting; the client still responds. */
  'monitoring',
  /** Monitoring plus active containment and response. */
  'mdr',
  /** MDR plus management of the underlying security devices. */
  'managed_security',
]);
export type MsspServiceLevel = z.infer<typeof MsspServiceLevel>;

export const MsspServiceLevelRate = z
  .object({
    level: MsspServiceLevel,
    /**
     * Multiplier on the whole bill relative to `monitoring`. Response capacity
     * is people, and people are what an MSSP is really selling.
     */
    multiplier: z.number().positive(),
    /**
     * Categories a provider at this service level actually operates.
     *
     * Without this, a "managed alternative" is one figure repeated against
     * every bundle, and §7.4 step 6's build-vs-buy comparison is meaningless:
     * an MDR provider does not run the client's backups, and a bundle of eight
     * categories is not replaced by the same service as a bundle of two.
     * Whatever is not on this list stays the client's to buy, and is reported
     * as residual cost alongside the managed figure.
     */
    coveredCategories: z.array(ProductCategory).min(1),
    basis: z.string().min(1),
  })
  .strict();
export type MsspServiceLevelRate = z.infer<typeof MsspServiceLevelRate>;

export const MsspScaleTier = z
  .object({
    scaleClass: ScaleClass,
    /** Fixed monthly platform and staffing charge before any per-unit component. */
    basePlatformFeeMonthly: NonNegativeMoney,
    basis: z.string().min(1),
  })
  .strict();
export type MsspScaleTier = z.infer<typeof MsspScaleTier>;

export const MsspRateCard = z
  .object({
    currency: CurrencyCode,
    asOf: IsoDate,
    /**
     * Same vocabulary as a catalog price. An MSSP rate card is a price like any
     * other and goes stale the same way.
     */
    confidence: PricingConfidence,
    notes: z.string().min(1),
    sources: z.array(Source).min(1),
    tiers: z.array(MsspScaleTier).min(1),
    perEndpointMonthly: NonNegativeMoney,
    perServerMonthly: NonNegativeMoney,
    /** Per GB/day of ingest, charged monthly. */
    perGbDayMonthly: NonNegativeMoney,
    serviceLevels: z.array(MsspServiceLevelRate).min(1),
    /** No engagement is quoted below this, whatever the per-unit maths says. */
    minimumMonthly: NonNegativeMoney,
  })
  .strict()
  .superRefine((card, ctx) => {
    const money: (keyof typeof card)[] = [
      'perEndpointMonthly',
      'perServerMonthly',
      'perGbDayMonthly',
      'minimumMonthly',
    ];
    for (const key of money) {
      const value = card[key] as { currency: CurrencyCode };
      if (value.currency !== card.currency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key, 'currency'],
          message: `${String(key)} is in ${value.currency} but the card is in ${card.currency}`,
        });
      }
    }

    const seenTiers = new Set<string>();
    card.tiers.forEach((tier, index) => {
      if (tier.basePlatformFeeMonthly.currency !== card.currency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiers', index, 'basePlatformFeeMonthly', 'currency'],
          message: `tier ${tier.scaleClass} is in ${tier.basePlatformFeeMonthly.currency} but the card is in ${card.currency}`,
        });
      }
      if (seenTiers.has(tier.scaleClass)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiers', index, 'scaleClass'],
          message: `duplicate tier for ${tier.scaleClass}`,
        });
      }
      seenTiers.add(tier.scaleClass);
    });

    // Every scale class the sizing stage can emit needs a base fee, or an
    // MSSP alternative silently cannot be quoted for that client.
    for (const scaleClass of ScaleClass.options) {
      if (!seenTiers.has(scaleClass)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiers'],
          message: `no MSSP tier for scale class ${scaleClass}`,
        });
      }
    }

    const seenLevels = new Set<string>();
    card.serviceLevels.forEach((level, index) => {
      if (seenLevels.has(level.level)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['serviceLevels', index, 'level'],
          message: `duplicate service level ${level.level}`,
        });
      }
      seenLevels.add(level.level);
    });
    for (const level of MsspServiceLevel.options) {
      if (!seenLevels.has(level)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['serviceLevels'],
          message: `no rate for service level ${level}`,
        });
      }
    }
  });
export type MsspRateCard = z.infer<typeof MsspRateCard>;
