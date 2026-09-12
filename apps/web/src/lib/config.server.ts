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
  loadPresets,
  loadScoringWeights,
  loadSizingAssumptions,
} from '@stackfit/data';
import type { CostInputs } from '@stackfit/engine';
import type {
  Framework,
  IsoDate,
  Product,
  ScenarioPreset,
  SizingAssumptions,
} from '@stackfit/schema';

/**
 * Server-side access to the committed data/ tree.
 *
 * Everything here reads the filesystem, so it must only ever be imported from a
 * server component or a server action. The engine itself still never reads a
 * file. This is the boundary that keeps that true (CONTRIBUTING.md architecture).
 */

// data/ sits at the repo root, two levels above apps/web. Resolved from this
// module's own URL rather than from process.cwd(), which differs between
// `next dev`, `next build` and a test runner.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'data');

export interface EngineData {
  readonly catalog: readonly Product[];
  readonly frameworks: ReadonlyMap<string, Framework>;
  readonly presets: readonly ScenarioPreset[];
  readonly sizingAssumptions: SizingAssumptions;
  readonly categoryWeights: ReturnType<typeof loadCategoryWeights>;
  readonly scoringWeights: ReturnType<typeof loadScoringWeights>;
  readonly portfolioAssumptions: ReturnType<typeof loadPortfolioAssumptions>;
  readonly coverageAssumptions: ReturnType<typeof loadCoverageAssumptions>;
  readonly mssp: ReturnType<typeof loadMsspRateCard>;
  readonly fx: ReturnType<typeof loadFxConfig>;
  readonly costInputsWithoutDate: Omit<CostInputs, 'today'>;
}

let cached: EngineData | undefined;

/**
 * Read and validate everything once per process.
 *
 * The data tree only changes when the repo does, and re-reading eleven YAML
 * files on every keystroke of a live readout would be silly. A dev-server hot
 * reload clears this along with the module.
 */
export function engineData(): EngineData {
  if (cached !== undefined) return cached;

  const fx = loadFxConfig(DATA_DIR);

  cached = {
    catalog: [...loadCatalog(DATA_DIR).values()],
    frameworks: loadFrameworks(DATA_DIR),
    presets: loadPresets(DATA_DIR),
    sizingAssumptions: loadSizingAssumptions(DATA_DIR),
    categoryWeights: loadCategoryWeights(DATA_DIR),
    scoringWeights: loadScoringWeights(DATA_DIR),
    portfolioAssumptions: loadPortfolioAssumptions(DATA_DIR),
    coverageAssumptions: loadCoverageAssumptions(DATA_DIR),
    mssp: loadMsspRateCard(DATA_DIR),
    fx,
    costInputsWithoutDate: {
      labourRates: loadLabourRates(DATA_DIR),
      costAssumptions: loadCostAssumptions(DATA_DIR),
      fx,
      freshnessPolicy: loadFreshnessPolicy(DATA_DIR),
    },
  };

  return cached;
}

/**
 * Today, as the engine's `today` input.
 *
 * The engine may not read a clock (it would break determinism), so the clock is
 * read here, at the edge, and handed in. UTC because price ages are counted in
 * whole days and a verdict must not depend on the analyst's timezone.
 */
export function today(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}
