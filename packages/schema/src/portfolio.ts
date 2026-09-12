// Portfolio assembly config (PROJECT_SPEC §7.4).
//
// How bundles are put together, as opposed to how categories are weighted —
// that lives in category-weights.yaml. Everything here is a judgement about
// procurement rather than about risk.

import { z } from 'zod';

/**
 * One band of the delivery roadmap (PROJECT_SPEC §8: the proposal carries
 * "roadmap phasing").
 *
 * A phase is defined by how much elapsed delivery time it contains, not by how
 * many products it holds. Nobody deploys thirteen tools at once, and the
 * catalog already records how long each one takes to stand up, so the honest
 * sequencing question is "how much can they actually absorb by when".
 */
export const RoadmapPhase = z
  .object({
    label: z.string().min(1),
    /** Shown to the client, e.g. "First quarter". Prose, not arithmetic. */
    horizon: z.string().min(1),
    /**
     * Elapsed weeks of delivery this phase can absorb, across all parallel
     * workstreams. `null` marks the final, open-ended phase — everything left
     * lands there, so nothing can fall off the end of the roadmap.
     */
    elapsedWeeks: z.number().positive().nullable(),
    basis: z.string().min(1),
  })
  .strict();
export type RoadmapPhase = z.infer<typeof RoadmapPhase>;

export const RoadmapAssumptions = z
  .object({
    /**
     * How many deployments the client can genuinely run at once. The divisor on
     * elapsed time, and the number most worth arguing with: a client with one
     * engineer runs one workstream, whatever the plan says.
     */
    parallelWorkstreams: z.number().int().positive(),
    phases: z.array(RoadmapPhase).min(1),
    basis: z.string().min(1),
  })
  .strict()
  .superRefine((roadmap, ctx) => {
    roadmap.phases.forEach((phase, index) => {
      const isLast = index === roadmap.phases.length - 1;
      if (isLast && phase.elapsedWeeks !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phases', index, 'elapsedWeeks'],
          message:
            'the final phase must be open-ended (null), or a long enough programme would have ' +
            'products with nowhere to go and they would silently vanish from the roadmap',
        });
      }
      if (!isLast && phase.elapsedWeeks === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phases', index, 'elapsedWeeks'],
          message: 'only the final phase may be open-ended — an earlier one would absorb everything',
        });
      }
    });
  });
export type RoadmapAssumptions = z.infer<typeof RoadmapAssumptions>;

/**
 * How much of a client's stated security headcount the Operable bundle is
 * allowed to spend on running tools.
 *
 * The Operable bundle exists because the Recommended one can ask a two-person
 * team for 8.58 FTE. It is a planning aid, not a measurement, and two things
 * about the number it constrains on have to be said out loud rather than buried
 * here:
 *
 * 1. **Every `opsBurden` in the catalog is an analyst estimate.** Not one is
 *    vendor-stated or measured. This is the softest figure StackFit holds, which
 *    is exactly why it shapes a *fourth* bundle rather than constraining the
 *    Recommended one.
 * 2. **FTE is summed across products with no overlap modelled.** One engineer
 *    genuinely does run several tools, so the total overstates a real team's
 *    load. Modelling the overlap would mean inventing a coefficient nobody can
 *    source, so it is stated as a known overstatement instead.
 */
export const OperableCapacityAssumptions = z
  .object({
    /**
     * Share of stated security FTE available for running tooling.
     *
     * Defaults to the whole team: an analyst who says "two people" means two
     * people, and quietly discounting that to 1.4 would be StackFit inventing a
     * number about the client's own staffing. Lower it per deployment where the
     * team also carries incident response, audit and project work.
     */
    utilisation: z.number().gt(0).max(1),
    basis: z.string().min(1),
  })
  .strict();
export type OperableCapacityAssumptions = z.infer<typeof OperableCapacityAssumptions>;

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
    /** Delivery sequencing for the exported proposal (§8). */
    roadmap: RoadmapAssumptions,
    /** What the Operable bundle treats as this team's real capacity. */
    operableCapacity: OperableCapacityAssumptions,
    basis: z.string().min(1),
  })
  .strict();
export type PortfolioAssumptions = z.infer<typeof PortfolioAssumptions>;
