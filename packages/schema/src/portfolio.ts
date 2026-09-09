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
    basis: z.string().min(1),
  })
  .strict();
export type PortfolioAssumptions = z.infer<typeof PortfolioAssumptions>;
