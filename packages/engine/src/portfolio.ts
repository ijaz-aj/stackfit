// Stage 4 of the pipeline: turn scored products into three bundles
// (PROJECT_SPEC §7.4).
//
// The seven steps of §7.4, in order:
//   1. rank categories by weight, adjusted by industry and compliance
//   2. value density = (riskReduction × fitScore) / annualisedTCO
//   3. greedy knapsack under the budget caps, mandatory categories first
//   4. bundle synergy — suite discount, integration bonus, no duplicate jobs
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
import { controlsClaimedBy } from './claims';
import type { CategoryRelevance } from './infrastructure';
import { addMoney, convertMoney, scaleMoney, subtractMoney, sumMoney, zeroMoney } from './money';
import type { ProductScore } from './scoring';
import type { SizingResult } from './sizing';

export type BundleKind = 'essential' | 'recommended' | 'ideal';

export interface CategoryRanking {
  readonly category: ProductCategory;
  /** Infrastructure weight after the industry modifier. */
  readonly weight: number;
  readonly mandatory: boolean;
  /** Frameworks that make this category mandatory, if any. */
  readonly mandatedBy: readonly string[];
  /** Weight is at or above `essentialWeightFloor`. */
  readonly essential: boolean;
  /**
   * A framework demands this category but the estate has nothing for it to
   * protect. Not treated as mandatory — that would demand a purchase covering
   * nothing — but never silently dropped either: a compliance obligation
   * disappearing without a word is the exact failure §7.4 step 7 exists to
   * prevent. It surfaces as a scoping question instead.
   */
  readonly mandatedButNotApplicable: boolean;
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
  /** Total recurring cost including operational FTE — the honest §7.2 figure. */
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
  /** Bundle categories it does not — still the client's to buy. */
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
  /** Procurement spend only — what `withinAnnualCap` is judged against. */
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
  /** Annual amount by which the mandatory set exceeds the cap, if it does. */
  readonly annualShortfall: Money | null;
  /** Annual budget that would cover the mandatory set. */
  readonly minimumViableAnnual: Money | null;
  readonly mssp: MsspAlternative;
  readonly rationale: readonly string[];
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
  const { profile, relevance, frameworks, categoryWeights, assumptions } = inputs;

  const mandatedBy = new Map<ProductCategory, string[]>();
  for (const framework of frameworks) {
    for (const control of framework.controls) {
      if (!control.mandatory) continue;
      for (const category of control.satisfiedBy) {
        const list = mandatedBy.get(category) ?? [];
        if (!list.includes(framework.id)) list.push(framework.id);
        mandatedBy.set(category, list);
      }
    }
  }

  const byCategory = new Map(relevance.map((entry) => [entry.category, entry]));

  return ProductCategoryEnum.options
    .map((category): CategoryRanking => {
      const entry = byCategory.get(category);
      const modifier = categoryWeights.industryModifiers.find(
        (candidate) => candidate.industry === profile.industry && candidate.category === category,
      );
      const applicable = entry?.applicable ?? true;
      const base = entry?.weight ?? 0;
      const weight = applicable ? base * (modifier?.multiplier ?? 1) : 0;
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
      }

      const mandatedButNotApplicable = mandates.length > 0 && !applicable;

      if (mandates.length > 0 && applicable) {
        rationale.push(
          `Mandatory: ${mandates.join(', ')} require${mandates.length === 1 ? 's' : ''} a ` +
            `${category} control, so this must be funded before anything discretionary.`,
        );
      }
      if (mandatedButNotApplicable) {
        rationale.push(
          `⚠ ${mandates.join(', ')} require${mandates.length === 1 ? 's' : ''} a ${category} ` +
            'control, but nothing in the captured inventory needs one. This has NOT been funded ' +
            'and is NOT a satisfied requirement — either the inventory is incomplete, or the ' +
            'control is out of scope for this client and the assessor needs to say so. Confirm ' +
            'before the proposal goes out.',
        );
      }

      return {
        category,
        weight: round(weight, 1),
        // Not mandatory: buying this would protect nothing. Reported instead,
        // via mandatedButNotApplicable, so the obligation cannot vanish.
        mandatory: mandates.length > 0 && applicable,
        mandatedBy: mandates,
        essential: applicable && weight >= assumptions.essentialWeightFloor,
        mandatedButNotApplicable,
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
function formatMinor(dearer: Money, cheaper: Money): string {
  const delta = Math.abs(dearer.amountMinor - cheaper.amountMinor) / 100;
  return `${dearer.currency} ${delta.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function withinCap(amount: Money, cap: Money | null): boolean {
  return cap === null || amount.amountMinor <= cap.amountMinor;
}

interface SelectionOptions {
  readonly ignoreBudget: boolean;
  /** Categories eligible for selection at all. */
  readonly eligible: (ranking: CategoryRanking) => boolean;
  /**
   * What this bundle is optimising for.
   *
   * `value_density` is §7.4 step 2 — risk-reduction per pound, which is the
   * right objective when money is the binding constraint.
   *
   * `cheapest` is step 3's "cheapest acceptable option if budget is tight".
   *
   * `best_fit` is what Ideal needs and did not have. §7.4 step 5 says Ideal
   * "ignores the budget cap; exists to quantify the gap" — and a gap measured
   * with a value-for-money objective is not the gap, because the best-value
   * option is by construction the *cheap* one. With one candidate per SKU that
   * stopped being a subtlety: density will pick the entry-level tier of every
   * product every time, so Ideal would have quoted the same SKUs as
   * Recommended and quantified a gap of zero.
   */
  readonly objective: 'value_density' | 'cheapest' | 'best_fit';
}

/**
 * Steps 3 and 4: greedy fill under the caps, mandatory categories first, with
 * suite synergy applied as products are chosen.
 *
 * One product per category — §7.4 step 4's "avoid selecting two products that
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
  annual: Money;
  spend: Money;
  oneTime: Money;
} {
  const { profile, assumptions } = inputs;
  const currency = profile.budget.currency;
  const productById = new Map(inputs.products.map((product) => [product.id, product]));

  const selections: BundleSelection[] = [];
  const unfundedMandatory: ProductCategory[] = [];
  const chosenVendors = new Set<string>();
  const filledCategories = new Set<ProductCategory>();

  let annual = zeroMoney(currency);
  let spend = zeroMoney(currency);
  let oneTime = zeroMoney(currency);

  // Mandatory first, then the rest by category weight. Within each pass the
  // best candidate for the category wins.
  const passes: readonly CategoryRanking[][] = [
    rankings.filter((ranking) => ranking.mandatory && options.eligible(ranking)),
    rankings.filter((ranking) => !ranking.mandatory && options.eligible(ranking)),
  ];

  for (const pass of passes) {
    for (const ranking of pass) {
      if (filledCategories.has(ranking.category)) continue;

      const forCategory = candidates.filter(
        (candidate) => candidate.category === ranking.category,
      );
      if (forCategory.length === 0) {
        if (ranking.mandatory) unfundedMandatory.push(ranking.category);
        continue;
      }

      // Step 4 synergy: a same-vendor product gets a licence discount and a
      // ranking bonus. The bonus never touches the published fit score.
      const scored = forCategory.map((candidate) => {
        const suite = chosenVendors.has(candidate.vendor);

        // A stated open-source preference tilts the ranking. The ops-fit weight
        // is still raised for this bias (§7.3), so a tool the client cannot
        // operate still loses — this only decides close calls.
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
            return (
              a.spendCost.amountMinor - b.spendCost.amountMinor ||
              b.candidate.fitScore - a.candidate.fitScore
            );
          case 'best_fit':
            // Fit first, then value, then price. Two SKUs that fit a client
            // equally well are not equally good buys, so the tie-breaks still
            // do the work that stops Ideal being "the most expensive thing".
            return (
              b.effectiveFit - a.effectiveFit ||
              b.density - a.density ||
              a.spendCost.amountMinor - b.spendCost.amountMinor
            );
          case 'value_density':
            return b.density - a.density || b.candidate.fitScore - a.candidate.fitScore;
        }
      });

      // Take the first option that fits the remaining budget. For a mandatory
      // category, fall back to the cheapest that fits rather than skipping it.
      const affordable = scored.find((entry) => {
        if (options.ignoreBudget) return true;
        return (
          withinCap(addMoney(spend, entry.spendCost), profile.budget.annualCap) &&
          withinCap(addMoney(oneTime, entry.oneTimeCost), profile.budget.oneTimeCap)
        );
      });

      let picked = affordable;
      if (picked === undefined && ranking.mandatory && !options.ignoreBudget) {
        const cheapest = [...scored].sort(
          (a, b) => a.spendCost.amountMinor - b.spendCost.amountMinor,
        )[0];
        if (
          cheapest !== undefined &&
          withinCap(addMoney(spend, cheapest.spendCost), profile.budget.annualCap) &&
          withinCap(addMoney(oneTime, cheapest.oneTimeCost), profile.budget.oneTimeCap)
        ) {
          picked = cheapest;
        }
      }

      if (picked === undefined) {
        if (ranking.mandatory) unfundedMandatory.push(ranking.category);
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
      for (const sibling of siblings) {
        const dearer = sibling.spendCost.amountMinor > picked.spendCost.amountMinor;
        const fitGap = round(sibling.candidate.fitScore - picked.candidate.fitScore, 1);
        rationale.push(
          fitGap > 0
            ? `${sibling.candidate.tierName} scores ${fitGap} point(s) higher and costs ` +
              `${formatMinor(sibling.spendCost, picked.spendCost)} more a year in procurement. ` +
              'Not worth it at this budget; it is the upgrade to quote if the coverage gaps matter.'
            : dearer
              ? `${sibling.candidate.tierName} costs more and scores no better for this client, ` +
                'so the cheaper SKU is the honest recommendation.'
              : `${sibling.candidate.tierName} is cheaper but scores ${-fitGap} point(s) lower here.`,
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

  return { selections, unfundedMandatory, annual, spend, oneTime };
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
  serviceLevel = 'mdr',
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
    `Managed alternative at the "${serviceLevel}" service level, for a ${sizing.scaleClass} estate.`,
    `Base platform fee, plus ${sizing.endpointCount} endpoint(s), ${sizing.serverCount} server(s) ` +
      `and ${round(sizing.gbPerDay, 2)} GB/day of ingest, × ${multiplier} for the service level.`,
    monthly.amountMinor === floor.amountMinor
      ? 'The per-unit maths fell below the rate card minimum, so the minimum is quoted.'
      : 'Above the rate card minimum, so the per-unit figure stands.',
  ];

  if (selections.length > 0) {
    rationale.push(
      coversCategories.length > 0
        ? `Replaces ${coversCategories.join(', ')} from this bundle.`
        : 'Replaces nothing in this bundle — none of its categories are delivered at this service level.',
    );
    if (uncoveredCategories.length > 0) {
      rationale.push(
        `Does NOT cover ${uncoveredCategories.join(', ')}. Those stay the client's to buy and run, ` +
          `at a residual ${residualAnnual.amountMinor / 100} ${currency} a year on top of the ` +
          'managed fee. Comparing the fee alone against the bundle would flatter the managed option.',
      );
    }
    rationale.push(
      `Build ${buildAnnual.amountMinor / 100} ${currency}/yr against buy ` +
        `${totalAnnual.amountMinor / 100} ${currency}/yr (fee plus residual). ` +
        'Neither figure includes the client\'s own staff time for the build option beyond the ' +
        'ops FTE already costed.',
    );
  }

  rationale.push(
    `⚠ The MSSP rate card is ${mssp.confidence.replace('_', ' ')} — no provider publishes one. ` +
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
  const totalOpsFte = result.selections.reduce(
    (sum, selection) => sum + selection.cost.opsFte,
    0,
  );

  // §7.4 step 7. What would it take to cover everything mandatory?
  const mandatoryCategories = rankings.filter((ranking) => ranking.mandatory);
  // Mandatory categories with nothing in the catalog to buy. Their cost is
  // unknown, not zero, so the floor below is a lower bound and says so —
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

  const cap = profile.budget.annualCap;
  const mandatoryUnaffordable =
    cap !== null && mandatoryFloor.amountMinor > cap.amountMinor && mandatoryCategories.length > 0;

  const rationale: string[] = [];
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
    case 'ideal':
      rationale.push(
        'Ideal: ignores the budget cap entirely. It exists to quantify the gap between what this ' +
          'client can afford and what the estate actually warrants.',
      );
      break;
  }

  if (result.unfundedMandatory.length > 0) {
    rationale.push(
      `⚠ SHORTFALL: ${result.unfundedMandatory.join(', ')} ${result.unfundedMandatory.length === 1 ? 'is' : 'are'} ` +
        'required by the selected frameworks and could not be funded within this budget. This bundle ' +
        'does not meet the client\'s compliance obligation, and has not been quietly downgraded to hide that.',
    );
  }
  if (mandatoryUnaffordable) {
    rationale.push(
      `The cheapest acceptable option for every mandatory category totals ` +
        `${mandatoryFloor.amountMinor / 100} ${currency} a year, against a stated cap of ` +
        `${(cap?.amountMinor ?? 0) / 100} ${currency}. That cap cannot buy compliance.`,
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
        'frameworks but nothing in the captured inventory needs one. Not funded and not satisfied — ' +
        'confirm whether the inventory is incomplete or the control is genuinely out of scope.',
    );
  }
  if (result.selections.length > 0) {
    rationale.push(
      `Annual spend ${result.spend.amountMinor / 100} ${currency} (licence, support, infrastructure) ` +
        `against a total annual cost of ${result.annual.amountMinor / 100} ${currency} once ` +
        'operational people are counted. The budget cap is judged against spend, because a stated ' +
        'security budget is a procurement figure; the people are constrained separately, below.',
    );
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
    annualShortfall: mandatoryUnaffordable && cap !== null ? subtractMoney(mandatoryFloor, cap) : null,
    minimumViableAnnual: mandatoryCategories.length > 0 ? mandatoryFloor : null,
    mssp: msspAlternative(inputs, result.selections),
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
 * §7.4 step 3 already anticipates this — "cheapest acceptable option if budget
 * is tight" — so the fix is to run that strategy too and keep whichever covers
 * more of the estate's weighted need. Density still wins ties, so an
 * unconstrained budget is unaffected and still gets the better products.
 *
 * ⚠ Weighted need is not the only thing that can go backwards, and comparing on
 * it alone left a second version of the same pathology alive. The two
 * strategies optimise different denominators — `cheapest` ranks on what a thing
 * costs to *buy*, `value_density` on fit per unit of what it costs to *own* —
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
): Bundle {
  const eligible = (ranking: CategoryRanking): boolean => ranking.weight > 0;

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

  const cheapest = controlsMet(byCheapest);
  const density = controlsMet(byDensity);

  // Lexicographic, in the order a client would defend the stack in:
  //
  //   1. mandates met    — an obligation the analyst ticked, and the framework
  //                        marked mandatory. Nothing outranks this.
  //   2. weighted need   — how much of the estate's risk the stack addresses.
  //   3. controls met    — the remaining in-scope controls, mandatory or not.
  //
  // Density is the final tie-break, so an unregulated client (both control
  // counts zero, both ties) keeps the old behaviour and the better-product
  // bias exactly as before.
  const CHEAPEST_RATIONALE =
    'Built from the cheapest acceptable option in each category rather than the highest value ' +
    'density: at this budget, ranking on value alone let one expensive product take the ' +
    'money and leave whole categories unfunded. §7.4 step 3 calls for exactly this when the ' +
    'budget is tight.';

  if (cheapest.mandatory !== density.mandatory) {
    // Explained in both directions. When this rule rejects the broader stack
    // the client is giving up a funded category, and being told why is the
    // difference between a defensible recommendation and an arbitrary one.
    const [winner, winnerMandates, loserMandates] =
      cheapest.mandatory > density.mandatory
        ? ([byCheapest, cheapest.mandatory, density.mandatory] as const)
        : ([byDensity, density.mandatory, cheapest.mandatory] as const);

    return {
      ...winner,
      rationale: [
        ...winner.rationale,
        `Chosen over the alternative stack because it meets more of the client's mandatory ` +
          `obligations: ${winnerMandates} mandated control(s) against ${loserMandates}. A funded ` +
          `category the selected frameworks do not require never outranks a control they do.`,
      ],
    };
  }

  if (coveredWeight(byCheapest) !== coveredWeight(byDensity)) {
    if (coveredWeight(byCheapest) > coveredWeight(byDensity)) {
      return { ...byCheapest, rationale: [...byCheapest.rationale, CHEAPEST_RATIONALE] };
    }
    return byDensity;
  }

  if (cheapest.total > density.total) {
    return {
      ...byCheapest,
      rationale: [
        ...byCheapest.rationale,
        `Both strategies meet the same mandates and fund the same categories, so the one ` +
          `satisfying more of the selected frameworks won: ${cheapest.total} in-scope control(s) ` +
          `against ${density.total}. Spending more must not cover less.`,
      ],
    };
  }

  return byDensity;
}

/** Step 5: the three bundles, each with its MSSP alternative. */
export function buildPortfolio(inputs: PortfolioInputs): {
  rankings: readonly CategoryRanking[];
  candidates: readonly Candidate[];
  essential: Bundle;
  recommended: Bundle;
  ideal: Bundle;
} {
  const rankings = rankCategoriesForClient(inputs);
  const candidates = buildCandidates(inputs, rankings);

  return {
    rankings,
    candidates,
    essential: buildBundle('essential', inputs, rankings, candidates, {
      ignoreBudget: false,
      eligible: (ranking) => ranking.mandatory || ranking.essential,
      objective: 'cheapest',
    }),
    recommended: buildRecommended(inputs, rankings, candidates),
    ideal: buildBundle('ideal', inputs, rankings, candidates, {
      ignoreBudget: true,
      eligible: (ranking) => ranking.weight > 0,
      objective: 'best_fit',
    }),
  };
}
