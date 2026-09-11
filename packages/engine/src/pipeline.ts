// The whole engine, in order (PROJECT_SPEC §7).
//
//   sizing → cost → scoring → portfolio → coverage
//
// Every stage is independently callable and independently tested; this is the
// wiring between them, in one place, because there is now more than one caller.
// The acceptance scenarios and the web app both run this — if they each wired
// the stages up themselves, the thing they proved about the engine would be a
// thing about their own copy of the wiring.
//
// Pure, like everything else in this package: `today` and the loaded data come
// in as arguments, nothing is read from a clock or a file.

import type {
  AssetInventory,
  CategoryWeights,
  ClientProfile,
  CoverageAssumptions,
  Framework,
  FrameworkId,
  MsspRateCard,
  PortfolioAssumptions,
  Product,
  ScoringWeights,
  SizingAssumptions,
} from '@stackfit/schema';

import { computeProductCosts, type CostInputs, type ProductCost } from './cost';
import { computeCoverage, type CoverageInputs, type CoverageResult } from './coverage';
import {
  computeCategoryRelevance,
  computeInfrastructureProfile,
  type CategoryRelevance,
  type InfrastructureProfile,
} from './infrastructure';
import { buildPortfolio, type Bundle, type Candidate, type CategoryRanking } from './portfolio';
import { scoreProducts, type ProductScore } from './scoring';
import { computeSizing, type SizingResult } from './sizing';

/**
 * Always reported against, whether or not the client selected it.
 *
 * §7.5 asks for the bundle mapped to the six CSF Functions as a way of *reading*
 * any stack, which is a different question from what the client is regulated by.
 * `inScope` on each framework's coverage is what keeps the two apart.
 */
export const COVERAGE_REFERENCE_FRAMEWORK: FrameworkId = 'nist-csf-2.0';

export interface PipelineInputs {
  readonly profile: ClientProfile;
  readonly inventory: AssetInventory;
  readonly products: readonly Product[];
  /**
   * The whole framework library, keyed by id. The profile's own selections are
   * what drive scoring and mandatory categories; passing the library rather
   * than a filtered list means every caller filters it the same way.
   */
  readonly frameworks: ReadonlyMap<string, Framework>;
  readonly sizingAssumptions: SizingAssumptions;
  readonly categoryWeights: CategoryWeights;
  readonly scoringWeights: ScoringWeights;
  readonly portfolioAssumptions: PortfolioAssumptions;
  readonly coverageAssumptions: CoverageAssumptions;
  readonly mssp: MsspRateCard;
  /** Rate cards, FX, the freshness policy, and the date to age prices against. */
  readonly costInputs: CostInputs;
}

export interface PipelineResult {
  readonly sizing: SizingResult;
  /** The catalog this run considered, so callers can name what was on offer. */
  readonly products: readonly Product[];
  readonly infrastructure: InfrastructureProfile;
  readonly relevance: readonly CategoryRelevance[];
  readonly scores: readonly ProductScore[];
  /** Cheapest tier per product, keyed by product id. */
  readonly costs: ReadonlyMap<string, ProductCost>;
  readonly rankings: readonly CategoryRanking[];
  /** Every scored, costed option, in value-density order. The runners-up. */
  readonly candidates: readonly Candidate[];
  readonly essential: Bundle;
  readonly recommended: Bundle;
  readonly ideal: Bundle;
  /** Coverage of the Recommended bundle. */
  readonly coverage: CoverageResult;
  /** Everything `computeCoverage` needs but the bundle, to measure the others. */
  readonly coverageInputs: Omit<CoverageInputs, 'bundle'>;
}

/** The frameworks a client's selections put in scope, in library order. */
function selectedFrameworks(
  profile: ClientProfile,
  library: ReadonlyMap<string, Framework>,
): readonly Framework[] {
  return profile.compliance.flatMap((id) => {
    const framework = library.get(id);
    return framework === undefined ? [] : [framework];
  });
}

export function runPipeline(inputs: PipelineInputs): PipelineResult {
  const {
    profile,
    inventory,
    products,
    frameworks,
    sizingAssumptions,
    categoryWeights,
    scoringWeights,
    portfolioAssumptions,
    coverageAssumptions,
    mssp,
    costInputs,
  } = inputs;

  const sizing = computeSizing(inventory, profile, sizingAssumptions);
  const inScope = selectedFrameworks(profile, frameworks);

  // Cheapest tier per product, which is the order computeProductCosts returns.
  const costs = new Map<string, ProductCost>();
  for (const product of products) {
    const [cheapest] = computeProductCosts(product, sizing, profile, costInputs);
    if (cheapest !== undefined) costs.set(product.id, cheapest);
  }

  const scores = scoreProducts(products, {
    profile,
    inventory,
    sizing,
    frameworks: inScope,
    weights: scoringWeights,
    categoryWeights,
  });

  const infrastructure = computeInfrastructureProfile(inventory, categoryWeights);
  const relevance = computeCategoryRelevance(infrastructure, categoryWeights);

  const portfolio = buildPortfolio({
    profile,
    sizing,
    products,
    scores,
    costs,
    relevance,
    frameworks: inScope,
    categoryWeights,
    assumptions: portfolioAssumptions,
    mssp,
    fx: costInputs.fx,
    costInputs,
  });

  const coverageFrameworks = [...inScope];
  if (!coverageFrameworks.some((framework) => framework.id === COVERAGE_REFERENCE_FRAMEWORK)) {
    const reference = frameworks.get(COVERAGE_REFERENCE_FRAMEWORK);
    if (reference !== undefined) coverageFrameworks.push(reference);
  }

  const coverageInputs: Omit<CoverageInputs, 'bundle'> = {
    profile,
    products,
    scores,
    costs,
    relevance,
    frameworks: coverageFrameworks,
    assumptions: coverageAssumptions,
  };

  return {
    sizing,
    products,
    infrastructure,
    relevance,
    scores,
    costs,
    rankings: portfolio.rankings,
    candidates: portfolio.candidates,
    essential: portfolio.essential,
    recommended: portfolio.recommended,
    ideal: portfolio.ideal,
    coverage: computeCoverage({ ...coverageInputs, bundle: portfolio.recommended }),
    coverageInputs,
  };
}

/** Coverage of any bundle from a pipeline run that has already happened. */
export function coverageOfBundle(result: PipelineResult, bundle: Bundle): CoverageResult {
  return computeCoverage({ ...result.coverageInputs, bundle });
}
