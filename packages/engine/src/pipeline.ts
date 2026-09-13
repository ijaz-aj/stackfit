// The whole engine, in order (PROJECT_SPEC §7).
//
//   sizing → cost → scoring → portfolio → coverage
//
// Every stage is independently callable and independently tested; this is the
// wiring between them, in one place, because there is now more than one caller.
// The acceptance scenarios and the web app both run this. If they each wired
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
  DeploymentMode,
  ProductCategory,
  ScoringWeights,
  SizingAssumptions,
  SizingOverrides,
} from '@stackfit/schema';

import { costCatalog, type CostInputs, type CostsByProduct } from './cost';
import { computeCoverage, type CoverageInputs, type CoverageResult } from './coverage';
import {
  computeCategoryRelevance,
  computeInfrastructureProfile,
  type CategoryRelevance,
  type InfrastructureProfile,
} from './infrastructure';
import { buildPortfolio, type Bundle, type Candidate, type CategoryRanking } from './portfolio';
import { scoreProducts, type ProductScore } from './scoring';
import { monitoringFte, type MonitoringFte } from './staffing';
import { applySizingOverrides, computeSizing, type SizingResult } from './sizing';

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
  /**
   * This client's own corrections to the sizing coefficients (§8.6). Optional:
   * most scenarios have none, and a scenario with none must size identically to
   * one that has never heard of overrides.
   */
  readonly sizingOverrides?: SizingOverrides | undefined;
  readonly categoryWeights: CategoryWeights;
  readonly scoringWeights: ScoringWeights;
  readonly portfolioAssumptions: PortfolioAssumptions;
  readonly coverageAssumptions: CoverageAssumptions;
  readonly mssp: MsspRateCard;
  /** Rate cards, FX, the freshness policy, and the date to age prices against. */
  readonly costInputs: CostInputs;
}

/** Who it takes to run this client, split by the two questions that differ. */
export interface ClientStaffing {
  /** Our people watching their estate around the clock, with the working. */
  readonly monitoring: MonitoringFte;
  /**
   * Total administration effort across the recommended bundle.
   *
   * ⚠ A straight sum across products with no overlap, so it overstates what one
   * team really carries: two tools administered by the same engineer share
   * context, tooling and on-call. The figure is honest per product and
   * pessimistic in aggregate, and is the reason a thirteen-tool stack reads as
   * needing more people than any real team would put on it.
   */
  readonly administrationFte: number;
  readonly administrationByProduct: readonly {
    readonly productId: string;
    readonly category: ProductCategory;
    readonly fte: number;
    readonly deploymentMode: DeploymentMode;
  }[];
}

export interface PipelineResult {
  readonly sizing: SizingResult;
  /**
   * How many people this client takes to run, with the working.
   *
   * Two separate answers, and they are separate on purpose: administration is
   * a fraction of an FTE per tool and scales with the estate, monitoring is a
   * share of a round-the-clock rota and scales with shift coverage. Reading one
   * as the other understates by an order of magnitude, and always in that
   * direction. See `staffing.ts`.
   */
  readonly staffing: ClientStaffing;
  /** The coefficients this run actually used, overrides folded in. */
  readonly sizingAssumptions: SizingAssumptions;
  /** The catalog this run considered, so callers can name what was on offer. */
  readonly products: readonly Product[];
  readonly infrastructure: InfrastructureProfile;
  readonly relevance: readonly CategoryRelevance[];
  readonly scores: readonly ProductScore[];
  /** Cheapest tier per product, keyed by product id. */
  readonly costs: CostsByProduct;
  readonly rankings: readonly CategoryRanking[];
  /** Every scored, costed option, in value-density order. The runners-up. */
  readonly candidates: readonly Candidate[];
  readonly essential: Bundle;
  readonly recommended: Bundle;
  /**
   * What year one deliberately left for later.
   *
   * Recommended answers "what should they buy now, inside the budget". This
   * answers "what did we not propose, and what would it cost", which is the
   * question a client asks the moment they see a stack with nine categories in
   * it and know there are thirteen. Priced, so deferring is a decision on the
   * record rather than a silence.
   */
  readonly phase2: Bundle;
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
    sizingOverrides,
    categoryWeights,
    scoringWeights,
    portfolioAssumptions,
    coverageAssumptions,
    mssp,
    costInputs,
  } = inputs;

  const effectiveAssumptions =
    sizingOverrides === undefined
      ? sizingAssumptions
      : applySizingOverrides(sizingAssumptions, sizingOverrides);
  // Measured ingest rides on the inventory, because it is a fact about the
  // estate rather than a tuning of an assumption.
  const sizing = computeSizing(inventory, profile, effectiveAssumptions);
  const inScope = selectedFrameworks(profile, frameworks);

  // Every tier of every product, not just the cheapest one.
  //
  // Costing only the cheapest tier made the tier invisible to every stage after
  // this: a SKU that closes a compliance control could never be selected,
  // recommended or even quoted as an upgrade, because nothing downstream had
  // ever priced it.
  const costs = costCatalog(products, sizing, profile, costInputs);

  // Infrastructure first: scoring needs the estate's shape, because a client
  // who states no deployment preference is telling the tool to work it out from
  // what they run.
  const infrastructure = computeInfrastructureProfile(inventory, categoryWeights);
  const relevance = computeCategoryRelevance(infrastructure, categoryWeights);

  const scores = scoreProducts(products, {
    profile,
    inventory,
    sizing,
    frameworks: inScope,
    weights: scoringWeights,
    categoryWeights,
    // The same model the cost stage used, so ops_fit scores the FTE figure the
    // TCO actually charges for.
    staffingModel: costInputs.staffingModel,
    estateShape: infrastructure.shape,
  });

  const monitoring = monitoringFte(sizing.monitoredAssetCount, costInputs.staffingModel);

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
    staffing: {
      monitoring,
      administrationFte: portfolio.recommended.totalOpsFte,
      administrationByProduct: portfolio.recommended.selections.map((selection) => ({
        productId: selection.productId,
        category: selection.category,
        fte: selection.cost.opsFte,
        deploymentMode: selection.cost.deployment.mode,
      })),
    },
    sizingAssumptions: effectiveAssumptions,
    products,
    infrastructure,
    relevance,
    scores,
    costs,
    rankings: portfolio.rankings,
    candidates: portfolio.candidates,
    essential: portfolio.essential,
    recommended: portfolio.recommended,
    phase2: portfolio.phase2,
    coverage: computeCoverage({ ...coverageInputs, bundle: portfolio.recommended }),
    coverageInputs,
  };
}

/** Coverage of any bundle from a pipeline run that has already happened. */
export function coverageOfBundle(result: PipelineResult, bundle: Bundle): CoverageResult {
  return computeCoverage({ ...result.coverageInputs, bundle });
}
