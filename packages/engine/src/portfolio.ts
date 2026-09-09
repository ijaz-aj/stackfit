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
  Money,
  MsspRateCard,
  PortfolioAssumptions,
  Product,
  ProductCategory,
} from '@stackfit/schema';
import { ProductCategory as ProductCategoryEnum, ScaleClass } from '@stackfit/schema';

import type { ProductCost } from './cost.js';
import type { CategoryRelevance } from './infrastructure.js';
import { addMoney, convertMoney, scaleMoney, subtractMoney, sumMoney, zeroMoney } from './money.js';
import type { ProductScore } from './scoring.js';
import type { SizingResult } from './sizing.js';

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
  readonly rationale: readonly string[];
}

export interface Candidate {
  readonly productId: string;
  readonly category: ProductCategory;
  readonly vendor: string;
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
  readonly fitScore: number;
  readonly categoryWeight: number;
  readonly mandatory: boolean;
  readonly valueDensity: number;
  /** Licence after any suite discount; equals the costed licence when none applied. */
  readonly annualRecurring: Money;
  readonly oneTime: Money;
  readonly tco: Money;
  readonly suiteDiscountApplied: boolean;
  readonly rationale: readonly string[];
}

export interface MsspAlternative {
  readonly monthly: Money;
  readonly annual: Money;
  readonly overHorizon: Money;
  readonly serviceLevel: string;
  readonly rationale: readonly string[];
}

export interface Bundle {
  readonly kind: BundleKind;
  readonly currency: CurrencyCode;
  readonly selections: readonly BundleSelection[];
  readonly annualRecurring: Money;
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
  readonly costs: ReadonlyMap<string, ProductCost>;
  readonly relevance: readonly CategoryRelevance[];
  /** The frameworks the analyst ticked. Empty is normal and fully supported. */
  readonly frameworks: readonly Framework[];
  readonly categoryWeights: CategoryWeights;
  readonly assumptions: PortfolioAssumptions;
  readonly mssp: MsspRateCard;
  readonly fx: import('@stackfit/schema').FxConfig;
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

      if (mandates.length > 0) {
        rationale.push(
          `Mandatory: ${mandates.join(', ')} require${mandates.length === 1 ? 's' : ''} a ` +
            `${category} control, so this must be funded before anything discretionary.`,
        );
      }

      return {
        category,
        weight: round(weight, 1),
        // A framework cannot mandate a category the estate has nothing for —
        // that would demand a purchase protecting nothing.
        mandatory: mandates.length > 0 && applicable,
        mandatedBy: mandates,
        essential: applicable && weight >= assumptions.essentialWeightFloor,
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
    const cost = inputs.costs.get(score.productId);
    if (product === undefined || cost === undefined) continue;

    const weight = weightByCategory.get(score.category) ?? 0;
    if (weight === 0) continue;

    const density = (weight * score.score) / annualisedMinor(cost, inputs.assumptions);
    candidates.push({
      productId: product.id,
      category: product.category,
      vendor: product.vendor,
      fitScore: score.score,
      cost,
      valueDensity: density,
    });
  }
  return candidates;
}

function withinCap(amount: Money, cap: Money | null): boolean {
  return cap === null || amount.amountMinor <= cap.amountMinor;
}

interface SelectionOptions {
  readonly ignoreBudget: boolean;
  /** Categories eligible for selection at all. */
  readonly eligible: (ranking: CategoryRanking) => boolean;
  /** Prefer the cheapest acceptable option rather than the best value. */
  readonly cheapestFirst: boolean;
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
        const effectiveFit = Math.min(
          100,
          candidate.fitScore + (suite ? assumptions.suiteIntegrationBonusPoints : 0),
        );
        const discount = suite ? assumptions.suiteDiscountRate : 0;
        const annualCost = scaleMoney(candidate.cost.annualRecurring, 1 - discount);
        const oneTimeCost = addMoney(
          candidate.cost.implementationOneTime,
          candidate.cost.trainingOneTime,
        );
        const density =
          (ranking.weight * effectiveFit) / annualisedMinor(candidate.cost, assumptions);
        return { candidate, suite, discount, annualCost, oneTimeCost, density };
      });

      scored.sort((a, b) =>
        options.cheapestFirst
          ? a.annualCost.amountMinor - b.annualCost.amountMinor ||
            b.candidate.fitScore - a.candidate.fitScore
          : b.density - a.density || b.candidate.fitScore - a.candidate.fitScore,
      );

      // Take the first option that fits the remaining budget. For a mandatory
      // category, fall back to the cheapest that fits rather than skipping it.
      const affordable = scored.find((entry) => {
        if (options.ignoreBudget) return true;
        return (
          withinCap(addMoney(annual, entry.annualCost), profile.budget.annualCap) &&
          withinCap(addMoney(oneTime, entry.oneTimeCost), profile.budget.oneTimeCap)
        );
      });

      let picked = affordable;
      if (picked === undefined && ranking.mandatory && !options.ignoreBudget) {
        const cheapest = [...scored].sort(
          (a, b) => a.annualCost.amountMinor - b.annualCost.amountMinor,
        )[0];
        if (
          cheapest !== undefined &&
          withinCap(addMoney(annual, cheapest.annualCost), profile.budget.annualCap) &&
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
        `${product?.name ?? picked.candidate.productId} selected for ${ranking.category}: ` +
          `fit ${picked.candidate.fitScore}/100 against a category weight of ${ranking.weight}.`,
        ...ranking.rationale,
      ];
      if (picked.suite) {
        rationale.push(
          `Suite synergy: ${picked.candidate.vendor} is already in this bundle, so a ` +
            `${round(assumptions.suiteDiscountRate * 100, 0)}% suite discount is applied and ` +
            `${assumptions.suiteIntegrationBonusPoints} integration points were added when ranking. ` +
            'This is an assumption, not a quoted discount.',
        );
      }
      if (options.cheapestFirst) {
        rationale.push(
          'Chosen as the cheapest acceptable option for this category, because the budget is tight ' +
            'and this category has to be funded.',
        );
      }

      selections.push({
        category: ranking.category,
        productId: picked.candidate.productId,
        productName: product?.name ?? picked.candidate.productId,
        vendor: picked.candidate.vendor,
        tierId: picked.candidate.cost.tierId,
        fitScore: picked.candidate.fitScore,
        categoryWeight: ranking.weight,
        mandatory: ranking.mandatory,
        valueDensity: round(picked.density, 6),
        annualRecurring: picked.annualCost,
        oneTime: picked.oneTimeCost,
        tco: picked.candidate.cost.tco,
        suiteDiscountApplied: picked.suite,
        rationale,
      });

      annual = addMoney(annual, picked.annualCost);
      oneTime = addMoney(oneTime, picked.oneTimeCost);
      chosenVendors.add(picked.candidate.vendor);
      filledCategories.add(ranking.category);
    }
  }

  return { selections, unfundedMandatory, annual, oneTime };
}

/** Step 6: the same coverage bought as a managed service. */
export function msspAlternative(inputs: PortfolioInputs, serviceLevel = 'mdr'): MsspAlternative {
  const { profile, sizing, mssp, fx } = inputs;
  const currency = profile.budget.currency;
  const to = (amount: Money): Money => convertMoney(amount, currency, fx);

  const tier = mssp.tiers.find((entry) => entry.scaleClass === sizing.scaleClass);
  const level = mssp.serviceLevels.find((entry) => entry.level === serviceLevel);
  const multiplier = level?.multiplier ?? 1;

  const base = to(tier?.basePlatformFeeMonthly ?? zeroMoney(mssp.currency));
  const endpoints = scaleMoney(to(mssp.perEndpointMonthly), sizing.endpointCount);
  const servers = scaleMoney(to(mssp.perServerMonthly), sizing.serverCount);
  const ingest = scaleMoney(to(mssp.perGbDayMonthly), sizing.gbPerDay);

  const beforeMultiplier = sumMoney(currency, [base, endpoints, servers, ingest]);
  const scaled = scaleMoney(beforeMultiplier, multiplier);
  const floor = to(mssp.minimumMonthly);
  const monthly = scaled.amountMinor < floor.amountMinor ? floor : scaled;

  const annual = scaleMoney(monthly, 12);

  return {
    monthly,
    annual,
    overHorizon: scaleMoney(annual, profile.budget.horizonYears),
    serviceLevel,
    rationale: [
      `Managed alternative at the "${serviceLevel}" service level, for a ${sizing.scaleClass} estate.`,
      `Base platform fee, plus ${sizing.endpointCount} endpoint(s), ${sizing.serverCount} server(s) ` +
        `and ${round(sizing.gbPerDay, 2)} GB/day of ingest, × ${multiplier} for the service level.`,
      monthly.amountMinor === floor.amountMinor
        ? 'The per-unit maths fell below the rate card minimum, so the minimum is quoted.'
        : 'Above the rate card minimum, so the per-unit figure stands.',
      `⚠ The MSSP rate card is ${mssp.confidence.replace('_', ' ')} — no provider publishes one. ` +
        'Treat this as a comparison, not a quote.',
    ],
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
  const totalOpsFte = result.selections.reduce((sum, selection) => {
    const cost = inputs.costs.get(selection.productId);
    return sum + (cost?.opsFte ?? 0);
  }, 0);

  // §7.4 step 7. What would it take to cover everything mandatory?
  const mandatoryCategories = rankings.filter((ranking) => ranking.mandatory);
  const mandatoryFloor = sumMoney(
    currency,
    mandatoryCategories.map((ranking) => {
      const forCategory = candidates.filter((candidate) => candidate.category === ranking.category);
      if (forCategory.length === 0) return zeroMoney(currency);
      const cheapest = [...forCategory].sort(
        (a, b) => a.cost.annualRecurring.amountMinor - b.cost.annualRecurring.amountMinor,
      )[0];
      return cheapest?.cost.annualRecurring ?? zeroMoney(currency);
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
  if (result.selections.length > 0) {
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
    oneTime: result.oneTime,
    tco,
    totalOpsFte: round(totalOpsFte, 3),
    withinAnnualCap: withinCap(result.annual, profile.budget.annualCap),
    withinOneTimeCap: withinCap(result.oneTime, profile.budget.oneTimeCap),
    unfundedMandatory: result.unfundedMandatory,
    annualShortfall: mandatoryUnaffordable && cap !== null ? subtractMoney(mandatoryFloor, cap) : null,
    minimumViableAnnual: mandatoryCategories.length > 0 ? mandatoryFloor : null,
    mssp: msspAlternative(inputs),
    rationale,
  };
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
      cheapestFirst: true,
    }),
    recommended: buildBundle('recommended', inputs, rankings, candidates, {
      ignoreBudget: false,
      eligible: (ranking) => ranking.weight > 0,
      cheapestFirst: false,
    }),
    ideal: buildBundle('ideal', inputs, rankings, candidates, {
      ignoreBudget: true,
      eligible: (ranking) => ranking.weight > 0,
      cheapestFirst: false,
    }),
  };
}

/** Scale classes, exported for callers building their own MSSP comparisons. */
export const SCALE_ORDER = ScaleClass.options;
