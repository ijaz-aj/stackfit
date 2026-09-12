// Pricing rules and their honesty invariants.
//
// CONTRIBUTING.md hard rules 2 and 3: never invent a price, and every price entry
// carries `sources: [{ url, asOf }]`. Those are enforced here rather than left
// to reviewer discipline, so an unsourced price fails `pnpm catalog:validate`.

import { z } from 'zod';

import { IsoDate } from './dates';
import { PricingConfidence, PricingModel } from './enums';
import { PriceRefresh } from './freshness';
import { NonNegativeMoney } from './money';

export { IsoDate };

export const Source = z
  .object({
    url: z.string().url(),
    /** When the page was read. A price with no `asOf` is a rumour, not a source. */
    asOf: IsoDate,
  })
  .strict();
export type Source = z.infer<typeof Source>;

/**
 * The sentinel a `placeholder` price must use: 999,999.99 in minor units. It is
 * deliberately absurd so it is obvious in any UI or export that escapes the
 * placeholder badge.
 */
export const PLACEHOLDER_UNIT_PRICE_MINOR = 99_999_999;

/** Pricing models that charge a rate per unit of scale. */
const PER_UNIT_MODELS = [
  'per_endpoint_year',
  'per_user_year',
  'per_gb_day_year',
  'per_eps_year',
  'per_node_year',
  'per_privileged_user_year',
  'per_asset_year',
  'per_mailbox_year',
] as const satisfies readonly z.infer<typeof PricingModel>[];

const PER_UNIT_MODEL_SET: ReadonlySet<string> = new Set(PER_UNIT_MODELS);

export const PricingTier = z
  .object({
    /** Inclusive lower bound of the band, in the model's units. */
    minUnits: z.number().int().nonnegative(),
    /** Inclusive upper bound, or null for the open-ended top band. */
    maxUnits: z.number().int().positive().nullable(),
    /** Flat price for the whole band. Mutually exclusive with `unitPrice`. */
    flatPrice: NonNegativeMoney.optional(),
    /** Per-unit price within the band. Mutually exclusive with `flatPrice`. */
    unitPrice: NonNegativeMoney.optional(),
  })
  .strict()
  .superRefine((tier, ctx) => {
    const hasFlat = tier.flatPrice !== undefined;
    const hasUnit = tier.unitPrice !== undefined;
    if (hasFlat === hasUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a tier needs exactly one of flatPrice or unitPrice',
      });
    }
    if (tier.maxUnits !== null && tier.maxUnits < tier.minUnits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxUnits'],
        message: `maxUnits (${tier.maxUnits}) is below minUnits (${tier.minUnits})`,
      });
    }
  });
export type PricingTier = z.infer<typeof PricingTier>;

export const PricingRule = z
  .object({
    model: PricingModel,
    /** Required for every per-unit model and for `consumption`. */
    unitPrice: NonNegativeMoney.optional(),
    /** Required for `flat_tiered`, forbidden otherwise. */
    tiers: z.array(PricingTier).min(1).optional(),
    /** What one unit is, for `consumption`: e.g. "GB ingested". */
    consumptionUnit: z.string().min(1).optional(),
    /** Vendor floor: fewer units than this are still billed at this count. */
    minimumUnits: z.number().int().positive().optional(),
    /** Vendor floor on spend, applied after unit maths. */
    minimumAnnual: NonNegativeMoney.optional(),
    /** Commitment length the quoted price assumes. */
    termYears: z.number().int().positive().max(5).default(1),
    pricingConfidence: PricingConfidence,
    sources: z.array(Source).default([]),
    /**
     * How to re-check this price. Optional so existing entries stay valid, but
     * `pnpm catalog:staleness` lists everything missing one. A price with no
     * declared way to re-check it is a price nobody will re-check.
     */
    refresh: PriceRefresh.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const isPerUnit = PER_UNIT_MODEL_SET.has(rule.model);

    if (isPerUnit && rule.unitPrice === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitPrice'],
        message: `model "${rule.model}" requires a unitPrice`,
      });
    }

    if (rule.model === 'flat_tiered') {
      if (rule.tiers === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiers'],
          message: 'model "flat_tiered" requires tiers',
        });
      }
    } else if (rule.tiers !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tiers'],
        message: `tiers are only valid for model "flat_tiered", not "${rule.model}"`,
      });
    }

    if (rule.model === 'consumption') {
      if (rule.unitPrice === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['unitPrice'],
          message: 'model "consumption" requires a unitPrice',
        });
      }
      if (rule.consumptionUnit === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['consumptionUnit'],
          message: 'model "consumption" requires consumptionUnit naming what a unit is',
        });
      }
    } else if (rule.consumptionUnit !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consumptionUnit'],
        message: 'consumptionUnit is only valid for model "consumption"',
      });
    }

    if (rule.model === 'zero_licence') {
      if (rule.unitPrice !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['unitPrice'],
          // The cost of open source is real, but it is not a licence fee. It
          // belongs in opsBurden and implementation (hard rule 8).
          message: 'model "zero_licence" must not carry a unitPrice',
        });
      }
      if (rule.minimumAnnual !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['minimumAnnual'],
          message: 'model "zero_licence" must not carry a minimumAnnual',
        });
      }
    }

    // The honesty invariants. Hard rules 2 and 3.
    if (rule.pricingConfidence === 'placeholder') {
      if (rule.notes === undefined || !rule.notes.includes('TODO')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['notes'],
          message: 'placeholder pricing requires a note containing TODO saying what to chase',
        });
      }
      if (
        rule.unitPrice !== undefined &&
        rule.unitPrice.amountMinor !== PLACEHOLDER_UNIT_PRICE_MINOR
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['unitPrice', 'amountMinor'],
          message: `placeholder pricing must use the sentinel ${PLACEHOLDER_UNIT_PRICE_MINOR}, not a plausible-looking invented number`,
        });
      }
    } else if (rule.model === 'zero_licence') {
      // A zero licence fee is a licensing fact, not a price to source. It still
      // needs a link to the licence itself.
      if (rule.sources.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sources'],
          message: 'zero_licence still needs a source pointing at the licence or pricing page',
        });
      }
    } else if (rule.sources.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sources'],
        message: 'a non-placeholder price needs at least one source with a url and asOf date',
      });
    }
  });
export type PricingRule = z.infer<typeof PricingRule>;
