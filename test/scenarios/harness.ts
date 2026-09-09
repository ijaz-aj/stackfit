// Runs the whole engine pipeline against the *committed* configuration, for
// the PROJECT_SPEC §12 acceptance scenarios.
//
// Everything else in the test suite is a unit test over fixtures, which is what
// makes it a good regression net and a poor safety net: each stage was correct
// in isolation while two defects lived in the seams between them. These
// scenarios exist to exercise the seams — sizing feeding cost feeding scoring
// feeding portfolio, with the real catalog, the real rate cards and the real
// framework library.
//
// ⚠ These are the tests CONTRIBUTING.md forbids editing to make a change pass. If a
// scenario goes red, either the engine is wrong or the committed data is — fix
// that, or raise it. Do not move the assertion.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPortfolio,
  computeCategoryRelevance,
  computeInfrastructureProfile,
  computeProductCosts,
  computeSizing,
  scoreProducts,
  type Bundle,
  type CategoryRanking,
  type InfrastructureProfile,
  type ProductCost,
  type ProductScore,
  type SizingResult,
} from '@stackfit/engine';
import type {
  AssetInventory,
  ClientProfile,
  FrameworkId,
  Product,
  ProductCategory,
} from '@stackfit/schema';

import {
  loadCatalog,
  loadCategoryWeights,
  loadCostAssumptions,
  loadFrameworks,
  loadFreshnessPolicy,
  loadFxConfig,
  loadLabourRates,
  loadMsspRateCard,
  loadPortfolioAssumptions,
  loadScoringWeights,
  loadSizingAssumptions,
} from '../../scripts/lib/load-config.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

/**
 * Pinned, not read from a clock. Freshness of the committed catalog is asserted
 * separately in test/staleness.test.ts; these scenarios must not go red simply
 * because time passed.
 */
export const AS_AT = '2026-09-15';

const sizingAssumptions = loadSizingAssumptions(DATA_DIR);
const categoryWeights = loadCategoryWeights(DATA_DIR);
const scoringWeights = loadScoringWeights(DATA_DIR);
const portfolioAssumptions = loadPortfolioAssumptions(DATA_DIR);
const msspRateCard = loadMsspRateCard(DATA_DIR);
const frameworkLibrary = loadFrameworks(DATA_DIR);

export const catalog = loadCatalog(DATA_DIR);

const costInputs = {
  labourRates: loadLabourRates(DATA_DIR),
  costAssumptions: loadCostAssumptions(DATA_DIR),
  fx: loadFxConfig(DATA_DIR),
  freshnessPolicy: loadFreshnessPolicy(DATA_DIR),
  today: AS_AT,
};

export interface ScenarioResult {
  readonly sizing: SizingResult;
  readonly infrastructure: InfrastructureProfile;
  readonly products: readonly Product[];
  readonly scores: readonly ProductScore[];
  readonly costs: ReadonlyMap<string, ProductCost>;
  readonly rankings: readonly CategoryRanking[];
  readonly essential: Bundle;
  readonly recommended: Bundle;
  readonly ideal: Bundle;
}

/** Inventory helper: counts in, a parsed AssetInventory out. */
export function inventoryOf(counts: Record<string, number>): AssetInventory {
  return {
    ...Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
    networkVendors: [],
  } as AssetInventory;
}

/** The whole pipeline, exactly as the web app will run it in Phase 5. */
export function runScenario(profile: ClientProfile, inventory: AssetInventory): ScenarioResult {
  const sizing = computeSizing(inventory, profile, sizingAssumptions);
  const products = [...catalog.values()];

  const frameworks = profile.compliance
    .map((id: FrameworkId) => frameworkLibrary.get(id))
    .filter((framework): framework is NonNullable<typeof framework> => framework !== undefined);

  // Cheapest tier per product, which is what computeProductCosts sorts to.
  const costs = new Map<string, ProductCost>();
  for (const product of products) {
    const [cheapest] = computeProductCosts(product, sizing, profile, costInputs);
    if (cheapest !== undefined) costs.set(product.id, cheapest);
  }

  const scores = scoreProducts(products, {
    profile,
    inventory,
    sizing,
    frameworks,
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
    frameworks,
    categoryWeights,
    assumptions: portfolioAssumptions,
    mssp: msspRateCard,
    fx: costInputs.fx,
    costInputs,
  });

  return {
    sizing,
    infrastructure,
    products,
    scores,
    costs,
    rankings: portfolio.rankings,
    essential: portfolio.essential,
    recommended: portfolio.recommended,
    ideal: portfolio.ideal,
  };
}

/** Every rationale string a bundle and its selections produced, as one blob. */
export function allRationale(bundle: Bundle): string {
  return [
    ...bundle.rationale,
    ...bundle.selections.flatMap((selection) => selection.rationale),
    ...bundle.mssp.rationale,
  ].join(' \n');
}

/** Categories the catalog can actually supply a product for. */
export const CATALOG_CATEGORIES: ReadonlySet<ProductCategory> = new Set(
  [...catalog.values()].map((product) => product.category),
);

/** A profile with sensible defaults; scenarios override only what they mean to say. */
export function profileOf(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    orgName: 'Acceptance Scenario',
    industry: 'other',
    region: 'us',
    employeeCount: 100,
    itStaffCount: 5,
    securityStaffFte: 1,
    hasSoc: 'none',
    riskTolerance: 'medium',
    dataSensitivity: 'internal',
    compliance: [],
    budget: { annualCap: null, oneTimeCap: null, currency: 'USD', horizonYears: 3 },
    deploymentPreference: 'hybrid',
    procurementBias: 'no_preference',
    retainedTools: [],
    excludedProducts: [],
    ...overrides,
  } as ClientProfile;
}
