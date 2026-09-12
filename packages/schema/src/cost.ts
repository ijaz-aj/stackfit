// Cost assumptions (PROJECT_SPEC §7.2) — labour rates, infrastructure rates
// and the commercial assumptions that turn a catalog price into a TCO.
//
// All of it lives in data/config/ (hard rule 6). The engine is handed a parsed
// copy and holds none of these numbers itself.

import { z } from 'zod';

import { ProductCategory, Region } from './enums';
import { NonNegativeMoney } from './money';
import { IsoDate, Source } from './pricing';

export const RegionLabourRate = z
  .object({
    /**
     * Fully-loaded annual cost of one security FTE: base salary plus employer
     * taxes, benefits and overhead. Not base salary — using base salary would
     * understate every open-source option in the catalog.
     */
    loadedAnnualCost: NonNegativeMoney,
    /** Day rate for implementation and training services in this region. */
    implementationDayRate: NonNegativeMoney,
    basis: z.string().min(1),
  })
  .strict();
export type RegionLabourRate = z.infer<typeof RegionLabourRate>;

const regionRateShape = Object.fromEntries(
  Region.options.map((region) => [region, RegionLabourRate]),
) as { [K in Region]: typeof RegionLabourRate };

export const LabourRates = z
  .object({
    asOf: IsoDate,
    /** Every region needs a rate; a missing one must fail, not default to zero. */
    byRegion: z.object(regionRateShape).strict(),
    sources: z.array(Source).min(1),
  })
  .strict();
export type LabourRates = z.infer<typeof LabourRates>;

/**
 * A deliberately crude cloud rate card for self-hosted tooling. Precision here
 * is not the point — the point is that self-hosting is not free, and that the
 * infrastructure line appears next to the zero licence fee.
 */
/**
 * What a self-hosted product's compute scales with.
 *
 * `log_ingest` is the log-platform shape: vCPU follows GB/day of ingest,
 * because indexing and search is the work. `monitored_assets` is everything
 * else: a management server whose load follows the number of things it manages,
 * not the volume of logs somebody else is collecting.
 */
export const InfraVcpuBasis = z.enum(['log_ingest', 'monitored_assets']);
export type InfraVcpuBasis = z.infer<typeof InfraVcpuBasis>;

/**
 * The self-hosted footprint of one product category.
 *
 * This exists because infrastructure used to be sized from `sizing.gbPerDay`
 * for every self-hostable product in the catalog, whatever it was. A honeypot,
 * a credential vault and a SIEM were each charged for four vCPU sized from the
 * whole estate's log volume, so a bundle with eleven self-hosted products
 * counted one log-volume figure eleven times. That was defensible when a bundle
 * held three or four log platforms and stopped being defensible at thirteen
 * categories.
 */
export const InfraCategoryFootprint = z
  .object({
    category: ProductCategory,
    vcpuBasis: InfraVcpuBasis,
    /**
     * Floor, however small the estate. Also the whole answer for a category
     * whose load does not scale with the estate at all — set
     * `vcpuPerThousandAssets` to 0 and this is the footprint.
     */
    minimumVcpu: z.number().int().positive(),
    /**
     * Additional vCPU per 1,000 monitored assets, for the `monitored_assets`
     * basis. Zero means a flat footprint. Ignored for `log_ingest`, which
     * derives vCPU from ingest instead.
     */
    vcpuPerThousandAssets: z.number().nonnegative(),
    /**
     * Whether this category pays for the log-retention storage the sizing stage
     * derives. True for the platforms that actually hold the logs; false for
     * everything else, because charging a firewall for a SIEM's retention was
     * the other half of the same error.
     */
    chargesLogRetentionStorage: z.boolean(),
    /** Why these numbers. Mandatory, like every other coefficient in this repo. */
    basis: z.string().min(1),
  })
  .strict();
export type InfraCategoryFootprint = z.infer<typeof InfraCategoryFootprint>;

export const InfraRates = z
  .object({
    asOf: IsoDate,
    vcpuMonth: NonNegativeMoney,
    ramGbMonth: NonNegativeMoney,
    storageTbMonth: NonNegativeMoney,
    /** GB/day of ingest one vCPU can index and search. */
    gbPerDayPerVcpu: z.number().positive(),
    /** RAM provisioned per vCPU. */
    ramGbPerVcpu: z.number().positive(),
    /**
     * Fallback floor, used only by a category footprint that does not state its
     * own. Every category does state one, so this is a backstop rather than a
     * default anyone relies on.
     */
    minimumVcpu: z.number().int().positive(),
    /**
     * One entry per product category — all of them, checked below. A new
     * category in the enum must come with a decision about what its self-hosted
     * footprint costs, rather than silently inheriting a log platform's.
     */
    byCategory: z.array(InfraCategoryFootprint),
    sources: z.array(Source).min(1),
  })
  .strict()
  .superRefine((rates, ctx) => {
    const seen = new Set<string>();
    rates.byCategory.forEach((entry, index) => {
      if (seen.has(entry.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['byCategory', index, 'category'],
          message: `duplicate infrastructure footprint for "${entry.category}"`,
        });
      }
      seen.add(entry.category);
    });

    const missing = ProductCategory.options.filter((category) => !seen.has(category));
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byCategory'],
        message:
          `no self-hosted infrastructure footprint for ${missing.join(', ')} — ` +
          'every category needs one, so that adding a category forces the decision ' +
          'rather than inheriting a log platform\'s sizing by accident',
      });
    }
  });
export type InfraRates = z.infer<typeof InfraRates>;

/**
 * Real-world discounting, as an explicit toggle rather than baked in silently
 * (PROJECT_SPEC §6 pricing rule 5). Bands are matched on annual list spend.
 */
export const DiscountBand = z
  .object({
    /** Inclusive upper bound of annual list spend, or null for the top band. */
    maxAnnualSpend: NonNegativeMoney.nullable(),
    /** Fraction off list, 0–1. */
    discountRate: z.number().min(0).max(0.9),
    label: z.string().min(1),
  })
  .strict();
export type DiscountBand = z.infer<typeof DiscountBand>;

export const CostAssumptions = z
  .object({
    asOf: IsoDate,
    /** Year-on-year licence uplift applied from year 2 onward. */
    annualUpliftRate: z.number().min(0).max(0.5),
    /**
     * Support and maintenance as a fraction of licence, for products where it
     * is charged separately rather than bundled into a subscription.
     */
    supportRateOfLicence: z.number().min(0).max(1),
    /** Training days as a fraction of implementation effort days. */
    trainingDaysRatio: z.number().min(0).max(1),
    /** Applied in order; the first band whose bound the spend fits wins. */
    discountBands: z.array(DiscountBand).min(1),
    infra: InfraRates,
    sources: z.array(Source).default([]),
  })
  .strict()
  .superRefine((assumptions, ctx) => {
    const openEnded = assumptions.discountBands.filter((band) => band.maxAnnualSpend === null);
    if (openEnded.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountBands'],
        message: `exactly one discount band must be open-ended (maxAnnualSpend: null), found ${openEnded.length}`,
      });
    }
  });
export type CostAssumptions = z.infer<typeof CostAssumptions>;
