// Portfolio assembly config (PROJECT_SPEC §7.4).
//
// How bundles are put together, as opposed to how categories are weighted —
// that lives in category-weights.yaml. Everything here is a judgement about
// procurement rather than about risk.

import { z } from 'zod';

export const PortfolioAssumptions = z
  .object({
    notes: z.string().min(1).optional(),
    /**
     * Category weight at or above which a category is part of the "minimum
     * defensible posture" that the Essential bundle must contain, even when no
     * framework demands it.
     *
     * §7.4 step 5 asks for a minimum defensible posture without defining one.
     * A weight floor is the definition: it scales with the estate, so a
     * SaaS-only client's essentials are genuinely different from a
     * manufacturer's rather than being the same fixed list.
     */
    essentialWeightFloor: z.number().min(0),
    /**
     * Discount applied to a product's licence when another product from the
     * same vendor is already in the bundle (§7.4 step 4). An assumption, and
     * announced as one wherever it is applied.
     */
    suiteDiscountRate: z.number().min(0).max(1),
    /**
     * Points added to a product's fit score when it integrates with something
     * already selected. Applied to the value-density ranking, never written
     * back into the published fit score.
     */
    suiteIntegrationBonusPoints: z.number().min(0).max(25),
    /**
     * Value density is `(riskReduction × fitScore) / annualisedTCO`. A product
     * with no annual cost at all would divide by zero, so its denominator is
     * floored at this many minor units.
     */
    minimumAnnualisedCostMinor: z.number().int().positive(),
    /**
     * Points added when ranking an open-source or open-core product for a
     * client whose `procurementBias` is `open_source_first`.
     *
     * §7.3 has that bias *raise* the ops-fit weight, which is honest — the
     * failure mode of open source is operational — but on its own it penalises
     * open source, because operability is exactly where it is weakest. Nothing
     * then acted on the "first" in the field's name, and §12.3's acceptance
     * criterion ("OSS stack recommended") went unmet.
     *
     * Applied to the ranking only, never written back into the published fit
     * score: a stated preference is a reason to rank something higher, not a
     * reason to claim it fits better than it does.
     */
    openSourcePreferencePoints: z.number().min(0).max(25),
    basis: z.string().min(1),
  })
  .strict();
export type PortfolioAssumptions = z.infer<typeof PortfolioAssumptions>;
