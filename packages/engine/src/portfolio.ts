// Stage 4 of the pipeline: turn scored products into three bundles
// (PROJECT_SPEC §7.4).
//
// The seven steps of §7.4, in order:
//   1. rank categories by weight, adjusted by industry and compliance
//   2. value density = (riskReduction × fitScore) / annualisedTCO
//   3. greedy knapsack under the budget caps, mandatory categories first
//   4. bundle synergy: suite discount, integration bonus, no duplicate jobs
//   5. emit Essential / Recommended / Ideal
//   6. emit an MSSP alternative for each
//   7. if the budget cannot cover the mandatory set, say so plainly
//
// Step 7 is the one with teeth: this stage never silently downgrades to a stack
// that fails the client's compliance obligation. It reports the shortfall and
// the minimum viable budget instead.
//
// Pure: no fs, no clock, no randomness.

import type {
  CategoryWeights,
  ClientProfile,
  CurrencyCode,
  Framework,
  FxConfig,
  LicenceModel,
  Money,
  MsspRateCard,
  PortfolioAssumptions,
  Product,
  ProductCategory,
} from '@stackfit/schema';
import { ProductCategory as ProductCategoryEnum } from '@stackfit/schema';

import {
  computeProductCost,
  costOfTier,
  type CostInputs,
  type CostsByProduct,
  type ProductCost,
} from './cost';
import { attributeBundle, type BundleAttribution } from './attribution';
import { controlsClaimedBy } from './claims';
import type { CategoryRelevance } from './infrastructure';
import { CATEGORY_LABELS, SERVICE_LEVEL_LABELS, listOf, plural } from './labels';
import {
  addMoney,
  convertMoney,
  moneyInWords,
  scaleMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from './money';
import { responsibilitySplit } from './responsibility';
import type { ProductScore } from './scoring';
import type { SizingResult } from './sizing';

/*
 * Three bundles, and the two that are gone are worth recording.
 *
 * `ideal` ignored the budget and bought the best tier of every category with
 * weight. On the committed presets that produced USD 26.8M a year against a
 * 60k cap for the retail client and 59.9M for the bank, and in three of six
 * presets its category set was identical to `recommended`, so it was the same
 * stack at a price nobody would put in front of a client. "What would you buy
 * with no limit" is not a question a scoping call asks.
 *
 * `operable` capped the stack at what the client's own security staff could
 * run. That premise does not hold for an MSSP engagement: we run it. The
 * professional-services preset has zero security FTE and came back with an
 * empty bundle, and that client is the best prospect in the set. Operational
 * load is still modelled, still costed into TCO, and still scored, but as a
 * cost rather than as a ceiling on what can be proposed.
 *
 * `phase2` replaces both, and answers the question they were groping at: what
 * is real, worth buying, and not this year.
 */
export type BundleKind = 'essential' | 'recommended' | 'phase2';

/** One mandatory control that could have been met more than one way. */
export interface MandateElection {
  /** Qualified, as a reader would cite it: "pci-dss-4 10.2". */
  readonly controlId: string;
  readonly controlTitle: string;
  /** The categories that would have satisfied it, this one included. */
  readonly couldBeMetBy: readonly ProductCategory[];
  /** Why this one carries it: elected on weight, or already held. */
  readonly reason: 'only_option' | 'highest_weight' | 'already_held';
}

export interface CategoryRanking {
  readonly category: ProductCategory;
  /** Infrastructure weight after the industry modifier. */
  readonly weight: number;
  /**
   * A framework obligation lands here and nowhere else will do.
   *
   * True in two cases. The control names this category alone, so there is no
   * choice; or the control offers a choice and this category was elected to
   * carry it. Never true merely because the category appears somewhere in a
   * mandatory control's `satisfiedBy` list: that list is a disjunction, and
   * reading it as a conjunction is what used to make twelve of thirteen
   * categories mandatory for a PCI client and left the recommendation with
   * nothing to recommend.
   */
  readonly mandatory: boolean;
  /** Frameworks that make this category mandatory, if any. */
  readonly mandatedBy: readonly string[];
  /**
   * Controls this category was elected to carry, and what it beat.
   *
   * Only populated where there was a genuine choice. "PCI DSS 10.2 is
   * satisfied by a SIEM, a SOAR or an MDR service, and the SIEM is funded
   * because it ranks highest for this estate" is the sentence an analyst has
   * to be able to say in the room, and it cannot be reconstructed afterwards
   * from a boolean.
   */
  readonly mandateElections: readonly MandateElection[];
  /** Weight is at or above `essentialWeightFloor`. */
  readonly essential: boolean;
  /**
   * A framework demands this category but the estate has nothing for it to
   * protect. Not treated as mandatory, that would demand a purchase covering
   * nothing, but never silently dropped either: a compliance obligation
   * disappearing without a word is the exact failure §7.4 step 7 exists to
   * prevent. It surfaces as a scoping question instead.
   */
  readonly mandatedButNotApplicable: boolean;
  /**
   * Products the client already owns in this category, so nothing is bought
   * for it.
   *
   * A held category is not funded by any bundle, including Ideal. "What would
   * you buy with no budget limit" is still a question about what they need,
   * and quoting a second EDR to a client who opened the call by saying they
   * keep CrowdStrike is the answer nobody asked for.
   *
   * It stops being mandatory too. The obligation is met by the holding, and
   * `unfundedMandatory` means "compliance demands this and the budget could not
   * buy it", which would be a false alarm here. Whether the holding covers the
   * specific controls is a different question, asked and answered in
   * `coverage.ts`, which credits the same holding and still reports a gap if
   * one remains.
   */
  readonly servedByRetained: readonly string[];
  readonly rationale: readonly string[];
}

export interface Candidate {
  readonly productId: string;
  /** The SKU this candidate is. One candidate per tier, not per product. */
  readonly tierId: string;
  readonly tierName: string;
  readonly category: ProductCategory;
  readonly vendor: string;
  readonly licenceModel: LicenceModel;
  readonly fitScore: number;
  readonly cost: ProductCost;
  /** (weight × fitScore) / annualised TCO, in whole currency units. */
  readonly valueDensity: number;
}

export interface BundleSelection {
  readonly category: ProductCategory;
  readonly productId: string;
  readonly productName: string;
  readonly vendor: string;
  readonly tierId: string;
  /** The SKU as a client would recognise it: "Plan 2", not "plan-2". */
  readonly tierName: string;
  readonly fitScore: number;
  readonly categoryWeight: number;
  readonly mandatory: boolean;
  readonly valueDensity: number;
  /** Total recurring cost including operational FTE. The honest §7.2 figure. */
  readonly annualRecurring: Money;
  /**
   * Money leaving the business: licence, support, infrastructure. This is what
   * the budget cap constrains, because a stated security budget is a
   * procurement figure and salary is not procurement.
   */
  readonly annualSpend: Money;
  readonly oneTime: Money;
  readonly tco: Money;
  readonly suiteDiscountApplied: boolean;
  /**
   * The costing this selection was actually made on, suite discount included.
   *
   * Carried rather than looked up again by id: a discounted selection is costed
   * a second time inside this stage, and a caller re-deriving the breakdown
   * from the undiscounted figure would show a licence line that disagrees with
   * the total above it. That exact drift was the Phase 4 review's finding 2.
   */
  readonly cost: ProductCost;
  readonly rationale: readonly string[];
}

export interface MsspAlternative {
  readonly monthly: Money;
  readonly annual: Money;
  readonly overHorizon: Money;
  readonly serviceLevel: string;
  /** Bundle categories this service level actually operates. */
  readonly coversCategories: readonly ProductCategory[];
  /** Bundle categories it does not: still the client's to buy. */
  readonly uncoveredCategories: readonly ProductCategory[];
  /** Annual licence and ops for the uncovered categories, on top of the fee. */
  readonly residualAnnual: Money;
  /** Managed fee plus residual: the real number to compare against the bundle. */
  readonly totalAnnual: Money;
  /** Annual recurring cost of the bundle this replaces, for the comparison. */
  readonly buildAnnual: Money;
  readonly rationale: readonly string[];
}

export interface Bundle {
  readonly kind: BundleKind;
  readonly currency: CurrencyCode;
  readonly selections: readonly BundleSelection[];
  /** Total recurring cost including people. */
  readonly annualRecurring: Money;
  /** Procurement spend only, what `withinAnnualCap` is judged against. */
  readonly annualSpend: Money;
  readonly oneTime: Money;
  readonly tco: Money;
  readonly totalOpsFte: number;
  readonly withinAnnualCap: boolean;
  readonly withinOneTimeCap: boolean;
  /**
   * Mandatory categories this bundle could not fund or fill. Non-empty here is
   * a §7.4 step 7 failure and must be reported, never hidden.
   */
  readonly unfundedMandatory: readonly ProductCategory[];
  /**
   * Which constraint actually stopped each one.
   *
   * The category list alone sends an analyst into the wrong negotiation. A
   * client whose implementation budget is exhausted does not need a bigger
   * annual budget, and being told "that cap cannot buy compliance" next to an
   * annual figure is how they come back with the wrong concession.
   */
  readonly unfundedReasons: readonly UnfundedCategory[];
  /** Annual amount by which the mandatory set exceeds the cap, if it does. */
  readonly annualShortfall: Money | null;
  /** Annual budget that would cover the mandatory set. */
  readonly minimumViableAnnual: Money | null;
  /** One-time amount by which standing the mandatory set up exceeds the cap. */
  readonly oneTimeShortfall: Money | null;
  /**
   * One-time budget that would stand the mandatory set up.
   *
   * A lower bound, and independent of `minimumViableAnnual`: each is the
   * cheapest option in its own dimension, so the two figures may come from
   * different SKUs and no single stack costs exactly both.
   */
  readonly minimumViableOneTime: Money | null;
  readonly mssp: MsspAlternative;
  /**
   * Who pays for what, once the responsibility boundary is drawn.
   *
   * `tco` and `annualSpend` above are what the stack costs to own and run,
   * with no regard for who bears it. That is the right figure for a
   * `client_operated` engagement and the wrong one to put in front of a client
   * whose stack we operate, because most of it is salary for people we employ.
   * `attribution.clientTotalAnnual` is what they actually pay.
   */
  readonly attribution: BundleAttribution;
  readonly rationale: readonly string[];
}

/** Why a mandatory category has nothing in the bundle. */
export type UnfundedReason = 'no_candidate' | 'annual_cap' | 'one_time_cap' | 'both_caps';

export interface UnfundedCategory {
  readonly category: ProductCategory;
  readonly reason: UnfundedReason;
}

export interface PortfolioInputs {
  readonly profile: ClientProfile;
  readonly sizing: SizingResult;
  readonly products: readonly Product[];
  readonly scores: readonly ProductScore[];
  /** Costs keyed by product id. One per product that survived scoring. */
  readonly costs: CostsByProduct;
  readonly relevance: readonly CategoryRelevance[];
  /** The frameworks the analyst ticked. Empty is normal and fully supported. */
  readonly frameworks: readonly Framework[];
  readonly categoryWeights: CategoryWeights;
  readonly assumptions: PortfolioAssumptions;
  readonly mssp: MsspRateCard;
  readonly fx: FxConfig;
  /**
   * Needed to re-cost a product when the §7.4 suite discount applies. The
   * discount goes through the cost engine rather than being applied to one
   * figure here, so licence, support, cash-flow and TCO all move together.
   */
  readonly costInputs: CostInputs;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / factor;
}

/**
 * Step 1: categories ranked by weight, adjusted by industry, with the ones the
 * client's frameworks make mandatory marked as such.
 */
export function rankCategoriesForClient(inputs: PortfolioInputs): readonly CategoryRanking[] {
  const { profile, relevance, frameworks, categoryWeights, assumptions, products, scores } = inputs;

  // What the client already runs, by category. An id the catalog does not carry
  // is ignored rather than rejected: the analyst typed what the client said,
  // and the catalog not having it is StackFit's gap, not theirs.
  const retainedByCategory = new Map<ProductCategory, string[]>();
  const retainedProducts = products.filter((product) => profile.retainedTools.includes(product.id));
  for (const product of retainedProducts) {
    const held = retainedByCategory.get(product.category) ?? [];
    held.push(product.name);
    retainedByCategory.set(product.category, held);
  }

  // A holding that would not survive scoring is still a holding: the client
  // owns it whatever StackFit thinks. But "you are keeping something that does
  // not reach your estate" is exactly the finding a scoping call exists to
  // produce, so it is said rather than acted on.
  const failing = new Map<ProductCategory, string[]>();
  for (const product of retainedProducts) {
    const score = scores.find((entry) => entry.productId === product.id && entry.eliminated);
    if (score === undefined) continue;
    const list = failing.get(product.category) ?? [];
    list.push(`${product.name} (${score.eliminationReasons[0] ?? 'ruled out'})`);
    failing.set(product.category, list);
  }

  const byCategory = new Map(relevance.map((entry) => [entry.category, entry]));

  /*
   * Resolving mandates, which is a disjunction and was being read as a
   * conjunction.
   *
   * `Control.satisfiedBy` lists the categories that would each satisfy the
   * control. `coverage.ts` has always read it that way and renders it as
   * "siem or soar or mdr". This function used to walk the same list and mark
   * every category in it mandatory, which is the opposite reading, and the two
   * stages of one engine disagreeing about one field is how a PCI client ended
   * up with twelve of thirteen categories mandatory. Mandatory categories are
   * funded before anything discretionary, so the budget was spent before the
   * ranking was consulted and every bundle converged on "buy one of
   * everything". A recommendation that recommends the whole catalog answers
   * neither "what should they buy" nor "what should they spend".
   *
   * So each mandatory control is settled once, in favour of a single category:
   *
   *   1. A holding satisfies it outright. The client already runs something in
   *      a satisfying category and is keeping it, so nothing is mandated.
   *   2. Exactly one satisfying category is applicable to this estate. No
   *      choice exists and that category is mandatory.
   *   3. More than one is applicable. The highest-weighted carries it, and the
   *      alternatives are recorded on it so the choice can be defended.
   *
   * Weight is infrastructure relevance after the industry modifier, so
   * electing on it means the control is met by whichever tool this estate had
   * the most use for anyway. Ties fall to `ProductCategory` declaration order,
   * which keeps the result byte-identical run to run.
   */
  const industryModifierFor = (category: ProductCategory) =>
    categoryWeights.industryModifiers.find(
      (candidate) => candidate.industry === profile.industry && candidate.category === category,
    );
  /*
   * Who will be at the console, applied to what the category is worth.
   *
   * Multiplied with the industry modifier rather than replacing it: they answer
   * different questions and a healthcare client whose stack we operate is both
   * a healthcare client and a managed one.
   */
  const deliveryModifierFor = (category: ProductCategory) =>
    categoryWeights.deliveryModifiers.find(
      (candidate) =>
        candidate.delivery === profile.deliveryModel && candidate.category === category,
    );

  const weightOf = (category: ProductCategory): number => {
    const entry = byCategory.get(category);
    if (entry === undefined || !entry.applicable) return 0;
    return (
      entry.weight *
      (industryModifierFor(category)?.multiplier ?? 1) *
      (deliveryModifierFor(category)?.multiplier ?? 1)
    );
  };
  const isApplicable = (category: ProductCategory): boolean =>
    byCategory.get(category)?.applicable ?? true;

  const mandatedBy = new Map<ProductCategory, string[]>();
  const elections = new Map<ProductCategory, MandateElection[]>();

  const recordElection = (category: ProductCategory, election: MandateElection): void => {
    const list = elections.get(category) ?? [];
    list.push(election);
    elections.set(category, list);
  };

  const orphanedFrameworks = new Map<ProductCategory, string[]>();

  for (const framework of frameworks) {
    for (const control of framework.controls) {
      if (!control.mandatory || control.satisfiedBy.length === 0) continue;
      const controlId = `${framework.id} ${control.id}`;

      // 1. Already met by something they own and are keeping.
      const held = control.satisfiedBy.find(
        (category) => (retainedByCategory.get(category) ?? []).length > 0,
      );
      if (held !== undefined) {
        recordElection(held, {
          controlId,
          controlTitle: control.title,
          couldBeMetBy: control.satisfiedBy,
          reason: 'already_held',
        });
        continue;
      }

      const viable = control.satisfiedBy.filter(isApplicable);
      if (viable.length === 0) {
        for (const category of control.satisfiedBy) {
          const list = orphanedFrameworks.get(category) ?? [];
          if (!list.includes(framework.id)) list.push(framework.id);
          orphanedFrameworks.set(category, list);
        }
        continue;
      }

      // 2 and 3. One option, or the best of several.
      let chosen = viable[0] as ProductCategory;
      for (const category of viable) {
        if (weightOf(category) > weightOf(chosen)) chosen = category;
      }

      const list = mandatedBy.get(chosen) ?? [];
      if (!list.includes(framework.id)) list.push(framework.id);
      mandatedBy.set(chosen, list);
      recordElection(chosen, {
        controlId,
        controlTitle: control.title,
        couldBeMetBy: control.satisfiedBy,
        reason: viable.length === 1 ? 'only_option' : 'highest_weight',
      });
    }
  }

  return ProductCategoryEnum.options
    .map((category): CategoryRanking => {
      const entry = byCategory.get(category);
      const modifier = industryModifierFor(category);
      const delivery = deliveryModifierFor(category);
      const applicable = entry?.applicable ?? true;
      const base = entry?.weight ?? 0;
      const weight = applicable ? weightOf(category) : 0;
      const mandates = mandatedBy.get(category) ?? [];

      const rationale: string[] = [];
      if (!applicable) {
        rationale.push(
          `Not applicable to this estate, so it is not ranked. ${entry?.rationale[0] ?? ''}`.trim(),
        );
      } else {
        rationale.push(`Infrastructure weight ${round(base, 1)} for a ${profile.industry} client.`);
        if (modifier !== undefined) {
          rationale.push(
            `Industry modifier ×${modifier.multiplier} for ${profile.industry}: ${modifier.basis}`,
          );
        }
        if (delivery !== undefined) {
          rationale.push(
            delivery.multiplier === 0
              ? `Not ranked under this engagement: ${delivery.basis}`
              : `Delivery modifier ×${delivery.multiplier}: ${delivery.basis}`,
          );
        }
      }

      const orphanedHere = orphanedFrameworks.get(category) ?? [];
      const mandatedButNotApplicable = orphanedHere.length > 0 && !applicable;
      const servedByRetained = retainedByCategory.get(category) ?? [];

      if (servedByRetained.length > 0) {
        rationale.push(
          `Not quoted: the client already runs ${listOf(servedByRetained)} here and is keeping ` +
            'it. Whether that holding closes the controls this category is asked for is a ' +
            'separate question, and the coverage matrix answers it.',
        );
        for (const note of failing.get(category) ?? []) {
          rationale.push(
            `⚠ ${note}. They are keeping it regardless, so nothing is quoted, but a holding ` +
              'that does not fit this estate is worth raising on the call.',
          );
        }
      }

      if (mandates.length > 0 && applicable && servedByRetained.length > 0) {
        rationale.push(
          `${listOf(mandates)} require${mandates.length === 1 ? 's' : ''} this category, and the ` +
            'holding above is what meets it. Not counted as unfunded.',
        );
      }

      if (mandates.length > 0 && applicable && servedByRetained.length === 0) {
        rationale.push(
          `Mandatory: ${mandates.join(', ')} require${mandates.length === 1 ? 's' : ''} a ` +
            `${category} control, so this must be funded before anything discretionary.`,
        );
      }
      if (mandatedButNotApplicable) {
        rationale.push(
          `⚠ ${orphanedHere.join(', ')} require${orphanedHere.length === 1 ? 's' : ''} a ${category} ` +
            'control, but nothing in the captured inventory needs one. This has NOT been funded ' +
            'and is not a satisfied requirement: either the inventory is incomplete, or the ' +
            'control is out of scope for this client and the assessor needs to say so. Confirm ' +
            'before the proposal goes out.',
        );
      }

      return {
        category,
        weight: round(weight, 1),
        // Not mandatory: buying this would protect nothing. Reported instead,
        // via mandatedButNotApplicable, so the obligation cannot vanish.
        mandatory: mandates.length > 0 && applicable && servedByRetained.length === 0,
        mandatedBy: mandates,
        essential:
          applicable && weight >= assumptions.essentialWeightFloor && servedByRetained.length === 0,
        mandateElections: elections.get(category) ?? [],
        mandatedButNotApplicable,
        servedByRetained,
        rationale,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/** Annualised TCO in minor units, floored so value density cannot divide by zero. */
function annualisedMinor(cost: ProductCost, assumptions: PortfolioAssumptions): number {
  const horizon = Math.max(1, cost.horizonYears);
  const annualised = cost.tco.amountMinor / horizon;
  return Math.max(annualised, assumptions.minimumAnnualisedCostMinor);
}

/** Step 2: value density for every product that survived scoring. */
export function buildCandidates(
  inputs: PortfolioInputs,
  rankings: readonly CategoryRanking[],
): readonly Candidate[] {
  const weightByCategory = new Map(rankings.map((entry) => [entry.category, entry.weight]));
  const productById = new Map(inputs.products.map((product) => [product.id, product]));

  const candidates: Candidate[] = [];
  for (const score of inputs.scores) {
    if (score.eliminated) continue;
    const product = productById.get(score.productId);
    const cost = costOfTier(inputs.costs, score.productId, score.tierId);
    if (product === undefined || cost === undefined) continue;

    const weight = weightByCategory.get(score.category) ?? 0;
    if (weight === 0) continue;

    const density = (weight * score.score) / annualisedMinor(cost, inputs.assumptions);
    candidates.push({
      productId: product.id,
      tierId: score.tierId,
      tierName: score.tierName,
      category: product.category,
      vendor: product.vendor,
      licenceModel: product.licenceModel,
      fitScore: score.score,
      cost,
      valueDensity: density,
    });
  }
  return candidates;
}

/**
 * The difference between two amounts, for a sentence rather than a table. Both
 * are in the scenario currency by the time they reach here.
 */
/** The gap between two prices, in the notation the rest of the interface uses. */
function formatMinor(dearer: Money, cheaper: Money): string {
  return moneyInWords({
    amountMinor: Math.abs(dearer.amountMinor - cheaper.amountMinor),
    currency: dearer.currency,
  });
}

function withinCap(amount: Money, cap: Money | null): boolean {
  return cap === null || amount.amountMinor <= cap.amountMinor;
}

/** Everything a product charges once: professional services plus training. */
function oneTimeOf(cost: ProductCost): Money {
  return addMoney(cost.implementationOneTime, cost.trainingOneTime);
}

/**
 * Which cap stopped a mandatory category being funded.
 *
 * Asked once no candidate fits both. Each cap is tested on its own, so the
 * answer distinguishes the three cases an analyst would act on differently:
 * the licence is unaffordable, the implementation is unaffordable, or neither
 * fits: including the case where some SKU clears each cap separately but none
 * clears both, which is still a two-cap problem.
 */
function blockingCap(
  scored: readonly { spendCost: Money; oneTimeCost: Money }[],
  spend: Money,
  oneTime: Money,
  budget: ClientProfile['budget'],
): UnfundedReason {
  const anyAnnualFits = scored.some((entry) =>
    withinCap(addMoney(spend, entry.spendCost), budget.annualCap),
  );
  const anyOneTimeFits = scored.some((entry) =>
    withinCap(addMoney(oneTime, entry.oneTimeCost), budget.oneTimeCap),
  );

  if (anyAnnualFits && !anyOneTimeFits) return 'one_time_cap';
  if (!anyAnnualFits && anyOneTimeFits) return 'annual_cap';
  return 'both_caps';
}

interface SelectionOptions {
  readonly ignoreBudget: boolean;
  /** Categories eligible for selection at all. */
  readonly eligible: (ranking: CategoryRanking) => boolean;
  /**
   * What this bundle is optimising for.
   *
   * `value_density` is §7.4 step 2: risk-reduction per pound, which is the
   * right objective when money is the binding constraint.
   *
   * `cheapest` is step 3's "cheapest acceptable option if budget is tight".
   *
   * `lowest_tco` is cheapest to *own* rather than cheapest to buy, which is
   * the objective that stops a stack of free tools nobody can afford to run.
   *
   * There was a fourth, `best_fit`, which ranked on fit alone and existed
   * solely so the Ideal bundle could name a dearer SKU than Recommended. It
   * went with that bundle. Nothing else ever wanted an objective that ignores
   * what a thing costs.
   */
  readonly objective: 'value_density' | 'cheapest' | 'lowest_tco';
  /**
   * What order the *categories* are filled in. `objective` decides which
   * candidate wins inside a category; this decides which categories get a
   * chance at the money first, and the two are independent.
   *
   * `weight` is plain risk-reduction order, which is the intuitive reading of
   * §7.4 and what every bundle used until this existed.
   *
   * `weight_per_cost` divides that weight by what the category's cheapest
   * option actually costs. It exists because plain weight order is a greedy
   * knapsack and loses to the classic counterexample: on a 500-asset estate a
   * USD 30,000 cap funded *less* risk-reduction than a USD 20,000 cap, because
   * the extra money reached `mdr` (weight 65, USD 17,280) and buying it
   * starved `email_security` (weight 53, USD 1,080) and `soar` (weight 45,
   * USD 1,080): 65 bought, 98 lost.
   *
   * Neither order is right on its own, which is why `buildRecommended` runs
   * both and keeps whichever bundle is actually better.
   */
  readonly categoryOrder?: 'weight' | 'weight_per_cost';
}

/**
 * Steps 3 and 4: greedy fill under the caps, mandatory categories first, with
 * suite synergy applied as products are chosen.
 *
 * One product per category. The rule is to avoid selecting two products that
 * do the same job" is enforced structurally rather than by a penalty, because
 * two SIEMs is not a bundle worth costing.
 */
function select(
  inputs: PortfolioInputs,
  rankings: readonly CategoryRanking[],
  candidates: readonly Candidate[],
  options: SelectionOptions,
): {
  selections: BundleSelection[];
  unfundedMandatory: ProductCategory[];
  unfundedReasons: UnfundedCategory[];
  annual: Money;
  spend: Money;
  oneTime: Money;
} {
  const { profile, assumptions } = inputs;
  const currency = profile.budget.currency;
  const productById = new Map(inputs.products.map((product) => [product.id, product]));

  const selections: BundleSelection[] = [];
  const unfundedMandatory: ProductCategory[] = [];
  const unfundedReasons: UnfundedCategory[] = [];
  const chosenVendors = new Set<string>();
  const filledCategories = new Set<ProductCategory>();

  let annual = zeroMoney(currency);
  let spend = zeroMoney(currency);
  let oneTime = zeroMoney(currency);

  // Mandatory first, then the rest. Within each pass the best candidate for the
  // category wins; `categoryOrder` decides which categories are offered the
  // remaining money first.
  //
  // The cheapest candidate in a category stands in for what the category
  // costs. It is the right representative for this: the question being asked is
  // "how much risk-reduction does the next pound buy", and the cheapest option
  // is the one that answers it.
  const cheapestSpendByCategory = new Map<ProductCategory, number>();
  for (const candidate of candidates) {
    const spend = candidate.cost.procurementAnnual.amountMinor;
    const current = cheapestSpendByCategory.get(candidate.category);
    if (current === undefined || spend < current) {
      cheapestSpendByCategory.set(candidate.category, spend);
    }
  }

  const orderCategories = (group: readonly CategoryRanking[]): CategoryRanking[] => {
    if (options.categoryOrder !== 'weight_per_cost') return [...group];
    return [...group].sort((a, b) => {
      // A free category is infinitely efficient and should go first, which is
      // also the correct answer: it costs nothing to fund.
      const perCost = (ranking: CategoryRanking) => {
        const spend = cheapestSpendByCategory.get(ranking.category);
        if (spend === undefined) return 0;
        return spend === 0 ? Number.POSITIVE_INFINITY : ranking.weight / spend;
      };
      // Weight breaks the tie, so the order stays deterministic and still
      // prefers the more valuable category when two cost the same.
      return perCost(b) - perCost(a) || b.weight - a.weight;
    });
  };

  // Nothing is quoted for a category the client already runs, in any bundle.
  const buyable = rankings.filter((ranking) => ranking.servedByRetained.length === 0);
  const passes: readonly CategoryRanking[][] = [
    orderCategories(buyable.filter((ranking) => ranking.mandatory && options.eligible(ranking))),
    orderCategories(buyable.filter((ranking) => !ranking.mandatory && options.eligible(ranking))),
  ];

  for (const pass of passes) {
    for (const ranking of pass) {
      if (filledCategories.has(ranking.category)) continue;

      const forCategory = candidates.filter((candidate) => candidate.category === ranking.category);
      if (forCategory.length === 0) {
        if (ranking.mandatory) {
          unfundedMandatory.push(ranking.category);
          unfundedReasons.push({ category: ranking.category, reason: 'no_candidate' });
        }
        continue;
      }

      // Step 4 synergy: a same-vendor product gets a licence discount and a
      // ranking bonus. The bonus never touches the published fit score.
      const scored = forCategory.map((candidate) => {
        const suite = chosenVendors.has(candidate.vendor);

        // A stated open-source preference tilts the ranking. The ops-fit weight
        // is still raised for this bias (§7.3), so a tool the client cannot
        // operate still loses. This only decides close calls.
        const openSourcePreferred =
          profile.procurementBias === 'open_source_first' &&
          (candidate.licenceModel === 'open_source' || candidate.licenceModel === 'open_core');

        const effectiveFit = Math.min(
          100,
          candidate.fitScore +
            (suite ? assumptions.suiteIntegrationBonusPoints : 0) +
            (openSourcePreferred ? assumptions.openSourcePreferencePoints : 0),
        );

        // Re-cost through the cost engine rather than discounting one figure
        // here, so the annual, the cash-flow and the TCO all agree.
        const product = productById.get(candidate.productId);
        const tier = product?.tiers.find((entry) => entry.id === candidate.cost.tierId);
        const cost =
          suite && product !== undefined && tier !== undefined
            ? computeProductCost(product, tier, inputs.sizing, profile, inputs.costInputs, {
                rate: assumptions.suiteDiscountRate,
                label: 'suite discount assumption',
              })
            : candidate.cost;

        const annualCost = cost.annualRecurring;
        const spendCost = cost.procurementAnnual;
        const oneTimeCost = addMoney(cost.implementationOneTime, cost.trainingOneTime);
        const density = (ranking.weight * effectiveFit) / annualisedMinor(cost, assumptions);
        return {
          candidate,
          suite,
          openSourcePreferred,
          effectiveFit,
          cost,
          annualCost,
          spendCost,
          oneTimeCost,
          density,
        };
      });

      scored.sort((a, b) => {
        switch (options.objective) {
          case 'cheapest':
            // Cheapest to *buy*. This objective exists to stretch a tight
            // procurement cap over every mandatory category (§7.4 step 3), so
            // it ranks on the figure the cap is judged against. Ranking it on
            // total cost instead starves the bundle at low budgets and broke
            // the monotonicity guarantee outright.
            return (
              a.spendCost.amountMinor - b.spendCost.amountMinor ||
              b.candidate.fitScore - a.candidate.fitScore
            );
          case 'lowest_tco':
            // Cheapest to *own*. The counterweight to `cheapest`: ranking on
            // procurement alone is hard rule 8 inverted. It makes a
            // self-hosted tool look free and picks it over a commercial one
            // that is both better and cheaper once the people are counted.
            //
            // On the hospital scenario `cheapest` chose Velociraptor at $1,080
            // of licence over Defender for Endpoint P1 at $42,840, when P1
            // scores 95.7 against 89.8 and costs $172,928 a year all-in
            // against $185,797. Worse, dearer, and selected.
            return (
              annualisedMinor(a.cost, assumptions) - annualisedMinor(b.cost, assumptions) ||
              b.candidate.fitScore - a.candidate.fitScore
            );
          case 'value_density':
            return b.density - a.density || b.candidate.fitScore - a.candidate.fitScore;
        }
      });

      // The best option, in this bundle's objective order, that fits what is
      // left of *both* caps. They are independent budgets: the annual-cheapest
      // SKU is not always the cheapest to stand up, so a category can be
      // affordable per year and impossible to implement.
      //
      // `find` already scans the whole list in objective order, so a category
      // whose best-value option is too dear still gets a cheaper one. There is
      // no need for, and used to be, a second "fall back to the cheapest that
      // fits" pass for mandatory categories. That pass could never find
      // anything: it ran only when this `find` returned nothing, which means
      // nothing fitted both caps, which means the cheapest did not either. It
      // read like a safety net for compliance obligations and was not one.
      const picked = scored.find((entry) => {
        if (options.ignoreBudget) return true;
        return (
          withinCap(addMoney(spend, entry.spendCost), profile.budget.annualCap) &&
          withinCap(addMoney(oneTime, entry.oneTimeCost), profile.budget.oneTimeCap)
        );
      });

      if (picked === undefined) {
        if (ranking.mandatory) {
          unfundedMandatory.push(ranking.category);
          // Money before people: if nothing here is affordable either, the cap
          // is the more actionable answer. Capacity is only named as the cause
          // when something in the category could actually have been bought.
          unfundedReasons.push({
            category: ranking.category,
            reason: blockingCap(scored, spend, oneTime, profile.budget),
          });
        }
        continue;
      }

      const product = productById.get(picked.candidate.productId);
      const rationale: string[] = [
        `${product?.name ?? picked.candidate.productId} (${picked.candidate.tierName}) selected ` +
          `for ${ranking.category}: fit ${picked.candidate.fitScore}/100 against a category ` +
          `weight of ${ranking.weight}.`,
        ...ranking.rationale,
      ];

      // Why this SKU and not the one next to it. A tier is a decision the
      // client pays for, so it gets a sentence of its own rather than appearing
      // only as an id on the cost line.
      const siblings = scored.filter(
        (entry) =>
          entry.candidate.productId === picked.candidate.productId &&
          entry.candidate.tierId !== picked.candidate.tierId,
      );
      /*
       * A line per sibling tier produced three near-identical sentences on any
       * product with four SKUs: "Community subscription costs more and scores
       * no better", then Basic, then Standard, differing only in the name. The
       * ones that lose the same way are named together, with the range, which
       * is both shorter and says more than any single line did.
       *
       * A tier that scores *higher* keeps its own line: each is a distinct
       * proposition with its own price, and that is the sentence an analyst
       * repeats when a client asks about the upgrade.
       */
      const dearerNoBetter: typeof siblings = [];
      const cheaperWorse: typeof siblings = [];

      for (const sibling of siblings) {
        const fitGap = round(sibling.candidate.fitScore - picked.candidate.fitScore, 1);
        if (fitGap > 0) {
          rationale.push(
            `${sibling.candidate.tierName} scores ${plural(fitGap, 'point')} higher and costs ` +
              `${formatMinor(sibling.spendCost, picked.spendCost)} more a year in procurement. ` +
              'Not worth it at this budget; it is the upgrade to quote if the coverage gaps matter.',
          );
        } else if (sibling.spendCost.amountMinor > picked.spendCost.amountMinor) {
          dearerNoBetter.push(sibling);
        } else if (fitGap < 0) {
          cheaperWorse.push(sibling);
        }
      }

      if (dearerNoBetter.length > 0) {
        const names = dearerNoBetter.map((entry) => entry.candidate.tierName);
        const extra = dearerNoBetter
          .map((entry) => entry.spendCost.amountMinor - picked.spendCost.amountMinor)
          .sort((a, b) => a - b);
        const currency = picked.spendCost.currency;
        const range =
          extra.length === 1 || extra[0] === extra[extra.length - 1]
            ? moneyInWords({ amountMinor: extra[0] ?? 0, currency })
            : `${moneyInWords({ amountMinor: extra[0] ?? 0, currency })} to ` +
              `${moneyInWords({ amountMinor: extra[extra.length - 1] ?? 0, currency })}`;

        rationale.push(
          `${listOf(names)} cost more and score no better for this client, at ${range} a year ` +
            'more in procurement for nothing measurable on this estate, so the cheaper SKU ' +
            'is the honest recommendation.',
        );
      }

      if (cheaperWorse.length > 0) {
        rationale.push(
          `${listOf(cheaperWorse.map((entry) => entry.candidate.tierName))} are cheaper but ` +
            'score lower here.',
        );
      }
      if (picked.suite) {
        rationale.push(
          `Suite synergy: ${picked.candidate.vendor} is already in this bundle, so a ` +
            `${round(assumptions.suiteDiscountRate * 100, 0)}% suite discount is applied and ` +
            `${assumptions.suiteIntegrationBonusPoints} integration points were added when ranking. ` +
            'This is an assumption, not a quoted discount.',
        );
      }
      if (picked.openSourcePreferred) {
        rationale.push(
          `Ranked up by ${assumptions.openSourcePreferencePoints} points: the client asked for an ` +
            'open-source-first stack, and this is ' +
            `${picked.candidate.licenceModel.replace('_', ' ')}. The operability weighting is still ` +
            'raised for that preference, so this had to earn the place on ops fit too.',
        );
      }
      if (options.objective === 'cheapest') {
        rationale.push(
          profile.budget.annualCap === null
            ? 'Chosen as the cheapest acceptable option for this category, because this bundle is ' +
                'the minimum defensible posture rather than the best available one.'
            : 'Chosen as the cheapest acceptable option for this category, so the stated budget ' +
                'stretches to cover everything that has to be funded.',
        );
      }

      selections.push({
        category: ranking.category,
        productId: picked.candidate.productId,
        productName: product?.name ?? picked.candidate.productId,
        tierName: picked.candidate.tierName,
        vendor: picked.candidate.vendor,
        tierId: picked.candidate.cost.tierId,
        fitScore: picked.candidate.fitScore,
        categoryWeight: ranking.weight,
        mandatory: ranking.mandatory,
        valueDensity: round(picked.density, 6),
        annualRecurring: picked.annualCost,
        annualSpend: picked.spendCost,
        oneTime: picked.oneTimeCost,
        tco: picked.cost.tco,
        suiteDiscountApplied: picked.suite,
        cost: picked.cost,
        rationale,
      });

      annual = addMoney(annual, picked.annualCost);
      spend = addMoney(spend, picked.spendCost);
      oneTime = addMoney(oneTime, picked.oneTimeCost);
      chosenVendors.add(picked.candidate.vendor);
      filledCategories.add(ranking.category);
    }
  }

  return { selections, unfundedMandatory, unfundedReasons, annual, spend, oneTime };
}

/**
 * Step 6: the same coverage bought as a managed service.
 *
 * Takes the bundle, because a managed alternative that ignores what the bundle
 * contains is one figure repeated three times, and the build-vs-buy comparison
 * §7.4 step 6 asks for is then meaningless. A provider does not run the
 * client's backups or their identity platform: whatever the service level does
 * not cover stays the client's to buy, and is reported as residual cost so the
 * two sides of the comparison are actually like for like.
 */
export function msspAlternative(
  inputs: PortfolioInputs,
  selections: readonly BundleSelection[] = [],
  /*
   * Defaults to what this engagement actually is, rather than to 'mdr'.
   *
   * It was a hardcoded literal and no caller ever passed one, so the figure was
   * identical under all three delivery models across every preset: a managed
   * engagement quoting `managed_security` was priced as if it were response
   * only. On a `client_operated` engagement there is no service level, and
   * 'mdr' is then the right question to ask, because the comparison is against
   * a provider they have not hired yet.
   */
  serviceLevel: string = inputs.profile.serviceLevel ?? 'mdr',
): MsspAlternative {
  const { profile, sizing, mssp, fx } = inputs;
  const currency = profile.budget.currency;
  const to = (amount: Money): Money => convertMoney(amount, currency, fx);

  const tier = mssp.tiers.find((entry) => entry.scaleClass === sizing.scaleClass);
  const level = mssp.serviceLevels.find((entry) => entry.level === serviceLevel);
  const multiplier = level?.multiplier ?? 1;
  const covered = new Set<ProductCategory>(level?.coveredCategories ?? []);

  const coversCategories = selections
    .map((selection) => selection.category)
    .filter((category) => covered.has(category));
  const uncoveredCategories = selections
    .map((selection) => selection.category)
    .filter((category) => !covered.has(category));

  const residualAnnual = sumMoney(
    currency,
    selections
      .filter((selection) => !covered.has(selection.category))
      .map((selection) => selection.annualRecurring),
  );
  const buildAnnual = sumMoney(
    currency,
    selections.map((selection) => selection.annualRecurring),
  );

  const base = to(tier?.basePlatformFeeMonthly ?? zeroMoney(mssp.currency));
  const endpoints = scaleMoney(to(mssp.perEndpointMonthly), sizing.endpointCount);
  const servers = scaleMoney(to(mssp.perServerMonthly), sizing.serverCount);
  const ingest = scaleMoney(to(mssp.perGbDayMonthly), sizing.gbPerDay);

  const beforeMultiplier = sumMoney(currency, [base, endpoints, servers, ingest]);
  const scaled = scaleMoney(beforeMultiplier, multiplier);
  const floor = to(mssp.minimumMonthly);
  const monthly = scaled.amountMinor < floor.amountMinor ? floor : scaled;

  const annual = scaleMoney(monthly, 12);

  const totalAnnual = addMoney(annual, residualAnnual);

  const rationale: string[] = [
    `Managed alternative at the ${SERVICE_LEVEL_LABELS[serviceLevel] ?? serviceLevel} service ` +
      `level, for a ${sizing.scaleClass} estate.`,
    `Base platform fee, plus ${plural(sizing.endpointCount, 'endpoint')}, ` +
      `${plural(sizing.serverCount, 'server')} and ${round(sizing.gbPerDay, 2)} GB/day of ingest, ` +
      `× ${multiplier} for the service level.`,
    monthly.amountMinor === floor.amountMinor
      ? 'The per-unit maths fell below the rate card minimum, so the minimum is quoted.'
      : 'Above the rate card minimum, so the per-unit figure stands.',
  ];

  if (selections.length > 0) {
    rationale.push(
      coversCategories.length > 0
        ? `Replaces ${listOf(coversCategories.map((category) => CATEGORY_LABELS[category]))} from this bundle.`
        : 'Replaces nothing in this bundle: none of its categories are delivered at this service level.',
    );
    if (uncoveredCategories.length > 0) {
      rationale.push(
        `Does not cover ${listOf(uncoveredCategories.map((category) => CATEGORY_LABELS[category]))}. ` +
          `Those stay the client's to buy and run, ` +
          `at a residual ${moneyInWords(residualAnnual)} a year on top of the ` +
          'managed fee. Comparing the fee alone against the bundle would flatter the managed option.',
      );
    }
    rationale.push(
      `Build ${moneyInWords(buildAnnual)}/yr against buy ` +
        `${moneyInWords(totalAnnual)}/yr (fee plus residual). ` +
        "Neither figure includes the client's own staff time for the build option beyond the " +
        'ops FTE already costed.',
    );
  }

  rationale.push(
    `⚠ The MSSP rate card is ${mssp.confidence.replace('_', ' ')}, because no provider publishes one. ` +
      'Treat this as a comparison, not a quote.',
  );

  return {
    monthly,
    annual,
    overHorizon: scaleMoney(annual, profile.budget.horizonYears),
    serviceLevel,
    coversCategories,
    uncoveredCategories,
    residualAnnual,
    totalAnnual,
    buildAnnual,
    rationale,
  };
}

function buildBundle(
  kind: BundleKind,
  inputs: PortfolioInputs,
  rankings: readonly CategoryRanking[],
  candidates: readonly Candidate[],
  options: SelectionOptions,
): Bundle {
  const { profile } = inputs;
  const currency = profile.budget.currency;
  const result = select(inputs, rankings, candidates, options);

  const tco = sumMoney(
    currency,
    result.selections.map((selection) => selection.tco),
  );
  // The selection carries the costing it was made on, tier included. Looking it
  // up by product id again is the Phase 4 finding-2 mistake in another form.
  const totalOpsFte = result.selections.reduce((sum, selection) => sum + selection.cost.opsFte, 0);

  // §7.4 step 7. What would it take to cover everything mandatory?
  const mandatoryCategories = rankings.filter((ranking) => ranking.mandatory);
  // Mandatory categories with nothing in the catalog to buy. Their cost is
  // unknown, not zero, so the floor below is a lower bound and says so:
  // quoting it as a minimum viable budget would understate what compliance costs.
  const mandatoryWithoutCandidates = mandatoryCategories
    .filter((ranking) => !candidates.some((candidate) => candidate.category === ranking.category))
    .map((ranking) => ranking.category);

  const mandatoryFloor = sumMoney(
    currency,
    mandatoryCategories.map((ranking) => {
      const forCategory = candidates.filter((candidate) => candidate.category === ranking.category);
      if (forCategory.length === 0) return zeroMoney(currency);
      const cheapest = [...forCategory].sort(
        (a, b) => a.cost.procurementAnnual.amountMinor - b.cost.procurementAnnual.amountMinor,
      )[0];
      return cheapest?.cost.procurementAnnual ?? zeroMoney(currency);
    }),
  );

  // The same floor in the other dimension. Standing a stack up is a separate
  // budget with a separate cap, and a mandatory set can be comfortably
  // affordable per year while being impossible to implement.
  const mandatoryOneTimeFloor = sumMoney(
    currency,
    mandatoryCategories.map((ranking) => {
      const forCategory = candidates.filter((candidate) => candidate.category === ranking.category);
      const cheapest = [...forCategory].sort(
        (a, b) => oneTimeOf(a.cost).amountMinor - oneTimeOf(b.cost).amountMinor,
      )[0];
      return cheapest === undefined ? zeroMoney(currency) : oneTimeOf(cheapest.cost);
    }),
  );

  const cap = profile.budget.annualCap;
  const oneTimeCap = profile.budget.oneTimeCap;
  const mandatoryUnaffordable =
    cap !== null && mandatoryFloor.amountMinor > cap.amountMinor && mandatoryCategories.length > 0;
  const mandatoryUnimplementable =
    oneTimeCap !== null &&
    mandatoryOneTimeFloor.amountMinor > oneTimeCap.amountMinor &&
    mandatoryCategories.length > 0;

  const rationale: string[] = [];

  // First, and in every bundle, because everything after it is arithmetic on
  // zero. The sizing stage has always known this and said so in its own
  // rationale; nothing downstream could read prose, so a blank intake produced
  // a thirteen-product recommendation and a three-year TCO with no hint that
  // the estate it protects is empty.
  if (!inputs.sizing.estateCaptured) {
    rationale.push(
      '⚠ No asset counts have been captured, so this is not a recommendation yet. Every figure ' +
        'below is the floor cost of owning these tools, the minimum infrastructure and the people ' +
        'to run them, against an estate of nothing. Capture the inventory before any of it is ' +
        'read as advice.',
    );
  }

  // Said in every bundle, because a category vanishing from the quote without
  // explanation is a worse answer than quoting it twice. This line is also what
  // carries the fact into the proposal exports, which render the same rationale.
  const held = rankings.filter((ranking) => ranking.servedByRetained.length > 0);
  if (held.length > 0) {
    rationale.push(
      `Not quoted, because the client already runs it: ` +
        `${listOf(held.map((ranking) => `${CATEGORY_LABELS[ranking.category]} (${listOf(ranking.servedByRetained)})`))}. ` +
        'Whether those holdings close the controls their categories are asked for is answered in ' +
        'the coverage matrix, which credits them and still reports a gap where one remains.',
    );
  }

  switch (kind) {
    case 'essential':
      rationale.push(
        'Essential: everything the selected frameworks make mandatory, plus the categories whose ' +
          `weight reaches the minimum-defensible floor of ${inputs.assumptions.essentialWeightFloor}.`,
      );
      break;
    case 'recommended':
      rationale.push(
        'Recommended: the best value density achievable inside the stated budget, mandatory ' +
          'categories funded first.',
      );
      break;
    case 'phase2':
      rationale.push(
        'Phase 2: real, worth buying, and not this year. Everything here ranked below the ' +
          'year-one line for this estate or could not be funded inside the stated budget, so it ' +
          'is priced and deferred rather than dropped. Not constrained by this year’s cap, ' +
          'because this is next year’s money.',
      );
      if (result.selections.length === 0) {
        rationale.push(
          'Nothing deferred. Year one already covers every category this estate warrants, which ' +
            'is a finding rather than an omission.',
        );
      }
      rationale.push(
        '⚠ Operational effort here is additive to year one, and every operational-effort ' +
          'estimate in the catalog is an analyst estimate rather than a vendor figure. Effort is ' +
          'summed across products with no overlap modelled, so one engineer genuinely does run ' +
          'several tools and the total overstates a real load.',
      );
      break;
  }

  if (result.unfundedMandatory.length > 0) {
    rationale.push(
      `⚠ SHORTFALL: ${result.unfundedMandatory.join(', ')} ${result.unfundedMandatory.length === 1 ? 'is' : 'are'} ` +
        'required by the selected frameworks and could not be funded within this budget. This bundle ' +
        "does not meet the client's compliance obligation, and has not been quietly downgraded to hide that.",
    );
  }
  if (mandatoryUnaffordable) {
    rationale.push(
      `The cheapest acceptable option for every mandatory category totals ` +
        `${moneyInWords(mandatoryFloor)} a year, against a stated annual cap of ` +
        `${cap === null ? '0' : moneyInWords(cap)}. That cap cannot buy compliance.`,
    );
  }
  if (mandatoryUnimplementable) {
    rationale.push(
      `Standing up the cheapest acceptable option for every mandatory category costs ` +
        `${moneyInWords(mandatoryOneTimeFloor)} once, against a stated one-time ` +
        `cap of ${oneTimeCap === null ? '0' : moneyInWords(oneTimeCap)}. The implementation budget ` +
        'cannot stand this stack up, whatever the annual budget is.',
    );
  }

  const blockedByOneTime = result.unfundedReasons.filter(
    (entry) => entry.reason === 'one_time_cap',
  );
  if (blockedByOneTime.length > 0 && oneTimeCap !== null) {
    rationale.push(
      `⚠ ${blockedByOneTime.map((entry) => entry.category).join(', ')} ` +
        `${blockedByOneTime.length === 1 ? 'was' : 'were'} stopped by the ONE-TIME cap, not the ` +
        `annual one: ${moneyInWords(result.oneTime)} of ` +
        `${moneyInWords(oneTimeCap)} implementation budget is already committed. ` +
        'A bigger annual budget will not fund them; a bigger implementation budget, or fewer ' +
        'tools to stand up, is the conversation to have.',
    );
  }
  if (mandatoryWithoutCandidates.length > 0) {
    rationale.push(
      `⚠ The minimum viable budget is a LOWER BOUND: ${mandatoryWithoutCandidates.join(', ')} ` +
        `${mandatoryWithoutCandidates.length === 1 ? 'is' : 'are'} mandatory but ` +
        `${mandatoryWithoutCandidates.length === 1 ? 'has' : 'have'} no candidate product in the ` +
        'catalog, so nothing is included for them. The real figure is higher by whatever they cost.',
    );
  }

  const notApplicableButMandated = rankings.filter((ranking) => ranking.mandatedButNotApplicable);
  if (notApplicableButMandated.length > 0) {
    rationale.push(
      `⚠ SCOPE QUESTION: ${notApplicableButMandated.map((r) => r.category).join(', ')} ` +
        `${notApplicableButMandated.length === 1 ? 'is' : 'are'} required by the selected ` +
        'frameworks but nothing in the captured inventory needs one. Not funded and not satisfied, ' +
        'confirm whether the inventory is incomplete or the control is genuinely out of scope.',
    );
  }
  if (result.selections.length > 0) {
    rationale.push(
      `Annual spend ${moneyInWords(result.spend)} (licence, support, infrastructure) ` +
        `against a total annual cost of ${moneyInWords(result.annual)} once ` +
        'operational people are counted. The budget cap is judged against spend, because a stated ' +
        'security budget is a procurement figure; the people are constrained separately, below.',
    );
    if (oneTimeCap !== null) {
      rationale.push(
        `One-time cost to stand this up: ${moneyInWords(result.oneTime)} against ` +
          `a cap of ${moneyInWords(oneTimeCap)}. Implementation is a separate ` +
          'budget from the annual one and runs out separately.',
      );
    }
    rationale.push(
      `Bundle needs ${round(totalOpsFte, 2)} FTE to run against ${profile.securityStaffFte} available.`,
    );
    if (profile.securityStaffFte > 0 && totalOpsFte > profile.securityStaffFte) {
      rationale.push(
        '⚠ This bundle needs more people than the client has. The managed alternative below is not ' +
          'a luxury for them, it is the only way this stack gets operated.',
      );
    }
  }

  const mssp = msspAlternative(inputs, result.selections);

  return {
    kind,
    currency,
    selections: result.selections,
    annualRecurring: result.annual,
    annualSpend: result.spend,
    oneTime: result.oneTime,
    tco,
    totalOpsFte: round(totalOpsFte, 3),
    withinAnnualCap: withinCap(result.spend, profile.budget.annualCap),
    withinOneTimeCap: withinCap(result.oneTime, profile.budget.oneTimeCap),
    unfundedMandatory: result.unfundedMandatory,
    unfundedReasons: result.unfundedReasons,
    annualShortfall:
      mandatoryUnaffordable && cap !== null ? subtractMoney(mandatoryFloor, cap) : null,
    minimumViableAnnual: mandatoryCategories.length > 0 ? mandatoryFloor : null,
    oneTimeShortfall:
      mandatoryUnimplementable && oneTimeCap !== null
        ? subtractMoney(mandatoryOneTimeFloor, oneTimeCap)
        : null,
    minimumViableOneTime: mandatoryCategories.length > 0 ? mandatoryOneTimeFloor : null,
    mssp,
    attribution: attributeBundle(
      result.selections.map((selection) => ({
        category: selection.category,
        productId: selection.productId,
        procurementAnnual: selection.cost.procurementAnnual,
        opsFteAnnual: selection.cost.opsFteAnnual,
        licenceAnnual: selection.cost.licenceAnnual,
        providerDeliveryOneTime: selection.cost.providerDeliveryOneTime,
        providerOpsFteAnnual: selection.cost.providerOpsFteAnnual,
      })),
      responsibilitySplit(profile, inputs.mssp),
      inputs.mssp,
      currency,
      /*
       * The fee only applies where we are actually the operator. On a
       * `client_operated` engagement the same figure is a quote from a provider
       * they have not hired, so charging it to them here would invent a cost.
       */
      profile.deliveryModel === 'client_operated' ? zeroMoney(currency) : mssp.annual,
    ),
    rationale,
  };
}

/**
 * The Recommended bundle, guarding against a greedy-knapsack pathology.
 *
 * Ranking purely by value density lets an expensive high-density product take
 * the budget early and starve every category after it. Observed on a real
 * scenario: a USD 15,000 cap bought one product, while a USD 8,000 cap bought
 * three. A client whose budget went *up* would have been shown a worse stack,
 * which is indefensible.
 *
 * §7.4 step 3 already anticipates this, "cheapest acceptable option if budget
 * is tight", so the fix is to run that strategy too and keep whichever covers
 * more of the estate's weighted need. Density still wins ties, so an
 * unconstrained budget is unaffected and still gets the better products.
 *
 * ⚠ Weighted need is not the only thing that can go backwards, and comparing on
 * it alone left a second version of the same pathology alive. The two
 * strategies optimise different denominators (`cheapest` ranks on what a thing
 * costs to *buy*, `value_density` on fit per unit of what it costs to *own*)
 * so they can fund exactly the same categories with different products. When
 * they do, weighted need ties, density wins by default, and the client can be
 * shown a stack that satisfies fewer of their mandated controls than the one a
 * smaller budget would have bought.
 *
 * Observed once the iam category landed: at a USD 20,000 cap the identity pick
 * was Keycloak, which claims both CIS Controls 5 and 6; at USD 50,000 it became
 * Duo Essentials, which is dearer to buy, far cheaper to own, and deliberately
 * claims only Control 6 because it is not a directory. Same categories funded,
 * more money spent, one control fewer covered.
 *
 * So a bundle that satisfies more of the selected frameworks' controls wins
 * before density gets to break the tie. With no frameworks ticked both counts
 * are zero and the old behaviour stands unchanged, which is the common case for
 * an unregulated client.
 */
function buildRecommended(
  inputs: PortfolioInputs,
  rankings: readonly CategoryRanking[],
  candidates: readonly Candidate[],
  eligible: (ranking: CategoryRanking) => boolean,
): Bundle {
  const byDensity = buildBundle('recommended', inputs, rankings, candidates, {
    ignoreBudget: false,
    eligible,
    objective: 'value_density',
  });

  // No cap means nothing can be starved, so there is nothing to repair.
  if (inputs.profile.budget.annualCap === null && inputs.profile.budget.oneTimeCap === null) {
    return byDensity;
  }

  const byCheapest = buildBundle('recommended', inputs, rankings, candidates, {
    ignoreBudget: false,
    eligible,
    objective: 'cheapest',
  });

  // The same cheapest-option-per-category fill, but offering the money to
  // categories in order of risk-reduction per pound. See `categoryOrder`.
  const byWeightPerCost = buildBundle('recommended', inputs, rankings, candidates, {
    ignoreBudget: false,
    eligible,
    objective: 'cheapest',
    categoryOrder: 'weight_per_cost',
  });

  // Cheapest to own rather than cheapest to buy. `cheapest` has to rank on
  // procurement to do its job, and the price of that is a stack of free tools
  // that costs a fortune to run: the hospital scenario reached 8.58 FTE of
  // operational load that way. We carry that load on an MSSP engagement, so it
  // is our cost and it is real. This fills the same categories choosing the
  // lowest total cost in each, and wins whenever it covers as much. The
  // comparison below decides; neither objective is trusted on its own.
  const byTco = buildBundle('recommended', inputs, rankings, candidates, {
    ignoreBudget: false,
    eligible,
    objective: 'lowest_tco',
  });

  const coveredWeight = (bundle: Bundle): number =>
    bundle.selections.reduce((sum, selection) => sum + selection.categoryWeight, 0);

  const productById = new Map(inputs.products.map((product) => [product.id, product]));
  const inScopeControls = new Map<string, boolean>(
    inputs.frameworks.flatMap((framework) =>
      framework.controls.map(
        (control) => [`${framework.id}:${control.id}`, control.mandatory] as [string, boolean],
      ),
    ),
  );

  /** In-scope controls this bundle's selections claim, at the tiers chosen. */
  const controlsMet = (bundle: Bundle): { mandatory: number; total: number } => {
    const met = new Set<string>();
    for (const selection of bundle.selections) {
      const product = productById.get(selection.productId);
      if (product === undefined) continue;
      for (const controlId of controlsClaimedBy(product, selection.cost.tierId)) {
        if (inScopeControls.has(controlId)) met.add(controlId);
      }
    }
    let mandatory = 0;
    for (const controlId of met) if (inScopeControls.get(controlId) === true) mandatory += 1;
    return { mandatory, total: met.size };
  };

  const CHEAPEST_RATIONALE =
    'Built from the cheapest acceptable option in each category rather than the highest value ' +
    'density: at this budget, ranking on value alone let one expensive product take the ' +
    'money and leave whole categories unfunded. Breadth beats depth when the budget is tight.';

  const WEIGHT_PER_COST_RATIONALE =
    'Categories were funded in order of risk-reduction per pound rather than risk-reduction ' +
    'alone. Filling in plain weight order is a greedy knapsack, and at this budget it spent the ' +
    'money on one expensive category and starved two cheaper ones worth more between them.';

  /**
   * The three things a stack is judged on, in the order a client would defend
   * it in:
   *
   *   1. mandates met . An obligation the analyst ticked and the framework
   *                      marked mandatory. Nothing outranks this.
   *   2. weighted need, how much of the estate's risk the stack addresses.
   *   3. controls met . The remaining in-scope controls, mandatory or not.
   */
  const measure = (bundle: Bundle) => ({ ...controlsMet(bundle), weight: coveredWeight(bundle) });

  // Density leads the list, so it wins every tie and keeps the better-product
  // bias it has always had. An unregulated client with one affordable stack
  // therefore sees exactly what they saw before any of this existed.
  // Density leads the list, so it wins every tie and keeps the better-product
  // bias it has always had. An unregulated client with one affordable stack
  // therefore sees exactly what they saw before any of this existed.
  const TCO_RATIONALE =
    'Built from the lowest total cost of ownership in each category rather than the lowest ' +
    'licence price. Ranking on procurement alone makes a self-hosted tool look free and buys a ' +
    'stack this team has no capacity to operate; the figures below count the people who run ' +
    'each product, which is where most of an open-source stack’s cost actually is.';

  const strategies: readonly { readonly bundle: Bundle; readonly note: string | undefined }[] = [
    { bundle: byDensity, note: undefined },
    { bundle: byTco, note: TCO_RATIONALE },
    { bundle: byCheapest, note: CHEAPEST_RATIONALE },
    { bundle: byWeightPerCost, note: WEIGHT_PER_COST_RATIONALE },
  ];

  const measured = strategies.map((strategy) => ({ ...strategy, score: measure(strategy.bundle) }));

  type Measured = (typeof measured)[number];
  const beats = (a: Measured, b: Measured): boolean =>
    a.score.mandatory > b.score.mandatory ||
    (a.score.mandatory === b.score.mandatory &&
      (a.score.weight > b.score.weight ||
        (a.score.weight === b.score.weight && a.score.total > b.score.total)));

  const winner = measured.reduce((best, candidate) => (beats(candidate, best) ? candidate : best));

  // The best stack the winner *strictly* beats. Strategies that tie it are
  // excluded on purpose: two strategies often reach the same bundle by
  // different routes, and comparing the winner against its own twin would
  // report that nothing was decided.
  const beaten = measured.filter((entry) => beats(winner, entry));
  const runnerUp =
    beaten.length === 0
      ? undefined
      : beaten.reduce((best, candidate) => (beats(candidate, best) ? candidate : best));

  // Say which of the three tests the winner actually won on, measured against
  // the best stack it beat. Explained in both directions on purpose: when this
  // rejects a broader stack the client is giving up a funded category, and
  // being told why is the difference between a defensible recommendation and
  // an arbitrary one.
  const decisive =
    runnerUp === undefined
      ? undefined
      : winner.score.mandatory > runnerUp.score.mandatory
        ? `Chosen over the alternative stack because it meets more of the client's mandatory ` +
          `obligations: ${plural(winner.score.mandatory, 'mandated control')} against ` +
          `${runnerUp.score.mandatory}. A funded category the selected frameworks do not ` +
          `require never outranks a control they do.`
        : winner.score.weight === runnerUp.score.weight && winner.score.total > runnerUp.score.total
          ? `Both strategies meet the same mandates and fund the same categories, so the one ` +
            `satisfying more of the selected frameworks won: ${winner.score.total} in-scope ` +
            `against ${runnerUp.score.total}. Spending more must not cover less.`
          : undefined;

  const added = [
    ...(winner.note === undefined ? [] : [winner.note]),
    ...(decisive === undefined ? [] : [decisive]),
  ];

  if (added.length === 0) return winner.bundle;

  return {
    ...winner.bundle,
    rationale: [...winner.bundle.rationale, ...added],
  };
}

/**
 * Where year one stops, for this client's ranking.
 *
 * A fraction of the top-ranked category's weight, so the line moves with the
 * estate instead of being a fixed count. Compliance and the essential floor
 * both sit above it: an obligation is not deferrable because the category
 * happens to rank low here.
 */
export function yearOneFloor(
  rankings: readonly CategoryRanking[],
  assumptions: PortfolioAssumptions,
): number {
  const top = rankings.reduce((max, ranking) => Math.max(max, ranking.weight), 0);
  return top * assumptions.yearOneWeightRatio;
}

/** Step 5: the bundles, each with its MSSP alternative. */
export function buildPortfolio(inputs: PortfolioInputs): {
  rankings: readonly CategoryRanking[];
  candidates: readonly Candidate[];
  essential: Bundle;
  recommended: Bundle;
  phase2: Bundle;
} {
  const rankings = rankCategoriesForClient(inputs);
  const candidates = buildCandidates(inputs, rankings);
  const floor = yearOneFloor(rankings, inputs.assumptions);

  const inYearOne = (ranking: CategoryRanking): boolean =>
    ranking.weight > 0 && (ranking.mandatory || ranking.essential || ranking.weight >= floor);

  const essential = buildBundle('essential', inputs, rankings, candidates, {
    ignoreBudget: false,
    eligible: (ranking) => ranking.mandatory || ranking.essential,
    objective: 'cheapest',
  });

  const recommended = buildRecommended(inputs, rankings, candidates, inYearOne);
  const funded = new Set(recommended.selections.map((selection) => selection.category));

  /*
   * What was left out on purpose, priced so the deferral is a decision rather
   * than a silence.
   *
   * Not constrained by this year's cap, because that cap is this year's. A
   * category lands here for one of two reasons and both are stated on the
   * bundle: it fell below the year-one line, or year one wanted it and the
   * budget could not reach it.
   */
  const phase2 = buildBundle('phase2', inputs, rankings, candidates, {
    ignoreBudget: true,
    eligible: (ranking) => ranking.weight > 0 && !funded.has(ranking.category),
    objective: 'value_density',
  });

  return { rankings, candidates, essential, recommended, phase2 };
}
