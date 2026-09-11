// Runs the whole engine pipeline against the *committed* configuration, for
// the PROJECT_SPEC §12 acceptance scenarios.
//
// Everything else in the test suite is a unit test over fixtures, which is what
// makes it a good regression net and a poor safety net: each stage was correct
// in isolation while two defects lived in the seams between them. These
// scenarios exist to exercise the seams — sizing feeding cost feeding scoring
// feeding portfolio feeding coverage, with the real catalog, the real rate
// cards and the real framework library.
//
// The wiring itself lives in `runPipeline`, in the engine, rather than here: if
// this file assembled the stages in its own way, what these scenarios prove
// would be a fact about a second copy of the plumbing rather than about the
// engine the web app runs.
//
// ⚠ These are the tests CONTRIBUTING.md forbids editing to make a change pass. If a
// scenario goes red, either the engine is wrong or the committed data is — fix
// that, or raise it. Do not move the assertion.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadCatalog,
  loadCategoryWeights,
  loadCostAssumptions,
  loadCoverageAssumptions,
  loadFrameworks,
  loadFreshnessPolicy,
  loadFxConfig,
  loadLabourRates,
  loadMsspRateCard,
  loadPortfolioAssumptions,
  loadScoringWeights,
  loadSizingAssumptions,
} from '@stackfit/data';
import {
  coverageOfBundle,
  runPipeline,
  type Bundle,
  type CoverageResult,
  type PipelineResult,
} from '@stackfit/engine';
import type { AssetInventory, ClientProfile, ProductCategory } from '@stackfit/schema';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

/**
 * Pinned, not read from a clock. Freshness of the committed catalog is asserted
 * separately in test/staleness.test.ts; these scenarios must not go red simply
 * because time passed.
 */
export const AS_AT = '2026-09-15';

export const catalog = loadCatalog(DATA_DIR);

const config = {
  products: [...catalog.values()],
  frameworks: loadFrameworks(DATA_DIR),
  sizingAssumptions: loadSizingAssumptions(DATA_DIR),
  categoryWeights: loadCategoryWeights(DATA_DIR),
  scoringWeights: loadScoringWeights(DATA_DIR),
  portfolioAssumptions: loadPortfolioAssumptions(DATA_DIR),
  coverageAssumptions: loadCoverageAssumptions(DATA_DIR),
  mssp: loadMsspRateCard(DATA_DIR),
  costInputs: {
    labourRates: loadLabourRates(DATA_DIR),
    costAssumptions: loadCostAssumptions(DATA_DIR),
    fx: loadFxConfig(DATA_DIR),
    freshnessPolicy: loadFreshnessPolicy(DATA_DIR),
    today: AS_AT,
  },
};

export type ScenarioResult = PipelineResult;

/** Coverage of any bundle from a scenario that has already been run. */
export function coverageOf(result: ScenarioResult, bundle: Bundle): CoverageResult {
  return coverageOfBundle(result, bundle);
}

/** Inventory helper: counts in, a parsed AssetInventory out. */
export function inventoryOf(counts: Record<string, number>): AssetInventory {
  return {
    ...Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
    networkVendors: [],
  } as AssetInventory;
}

/** The whole pipeline, exactly as the web app runs it. */
export function runScenario(profile: ClientProfile, inventory: AssetInventory): ScenarioResult {
  return runPipeline({ ...config, profile, inventory });
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
