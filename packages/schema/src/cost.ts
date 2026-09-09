// Cost assumptions (PROJECT_SPEC §7.2) — labour rates, infrastructure rates
// and the commercial assumptions that turn a catalog price into a TCO.
//
// All of it lives in data/config/ (hard rule 6). The engine is handed a parsed
// copy and holds none of these numbers itself.

import { z } from 'zod';

import { Region } from './enums.js';
import { NonNegativeMoney } from './money.js';
import { IsoDate, Source } from './pricing.js';

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
    /** Minimum footprint for a self-hosted tool, however small the estate. */
    minimumVcpu: z.number().int().positive(),
    sources: z.array(Source).min(1),
  })
  .strict();
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
