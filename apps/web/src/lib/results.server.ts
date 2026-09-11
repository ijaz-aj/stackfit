import { runPipeline, type PipelineResult } from '@stackfit/engine';
import type { AssetInventory, ClientProfile } from '@stackfit/schema';

import { engineData, today } from './config.server';

/**
 * One place that turns a saved scenario into engine output.
 *
 * Server-only: it reads the committed data tree. Both the results dashboard and
 * the wizard's live estimate go through here, so there is no second assembly of
 * the same arguments — the mistake this repo has now corrected at three
 * different layers.
 */
export function resultsFor(profile: ClientProfile, inventory: AssetInventory): PipelineResult {
  const data = engineData();

  return runPipeline({
    profile,
    inventory,
    products: data.catalog,
    frameworks: data.frameworks,
    sizingAssumptions: data.sizingAssumptions,
    categoryWeights: data.categoryWeights,
    scoringWeights: data.scoringWeights,
    portfolioAssumptions: data.portfolioAssumptions,
    coverageAssumptions: data.coverageAssumptions,
    mssp: data.mssp,
    // The clock is read here, at the edge, and handed in. The engine may not
    // read one: it would break determinism, and "what did this look like when
    // we quoted it in March" would stop being answerable.
    costInputs: { ...data.costInputsWithoutDate, today: today() },
  });
}
