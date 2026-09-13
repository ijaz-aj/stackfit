/**
 * Loads and validates files from data/config/.
 *
 * This is the boundary the engine deliberately does not cross: the engine takes
 * assumptions as an argument, and something outside it (this loader, and later
 * the web app) is responsible for reading and validating the YAML.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CatalogFile,
  CategoryWeights,
  CostAssumptions,
  CoverageAssumptions,
  Framework,
  FreshnessPolicy,
  FxConfig,
  LabourRates,
  MsspRateCard,
  StaffingModel,
  PortfolioAssumptions,
  PresetFile,
  ScoringWeights,
  SizingAssumptions,
  type Product,
  type ScenarioPreset,
} from '@stackfit/schema';
import { parse as parseYaml } from 'yaml';

function readYaml(file: string): unknown {
  return parseYaml(readFileSync(file, 'utf8'));
}

export function loadSizingAssumptions(dataDir: string): SizingAssumptions {
  return SizingAssumptions.parse(readYaml(join(dataDir, 'config', 'sizing-assumptions.yaml')));
}

export function loadLabourRates(dataDir: string): LabourRates {
  return LabourRates.parse(readYaml(join(dataDir, 'config', 'labour-rates.yaml')));
}

export function loadCostAssumptions(dataDir: string): CostAssumptions {
  return CostAssumptions.parse(readYaml(join(dataDir, 'config', 'cost-assumptions.yaml')));
}

export function loadStaffingModel(dataDir: string): StaffingModel {
  return StaffingModel.parse(readYaml(join(dataDir, 'config', 'staffing-model.yaml')));
}

export function loadFreshnessPolicy(dataDir: string): FreshnessPolicy {
  return FreshnessPolicy.parse(readYaml(join(dataDir, 'config', 'freshness-policy.yaml')));
}

export function loadCategoryWeights(dataDir: string): CategoryWeights {
  return CategoryWeights.parse(readYaml(join(dataDir, 'config', 'category-weights.yaml')));
}

export function loadMsspRateCard(dataDir: string): MsspRateCard {
  return MsspRateCard.parse(readYaml(join(dataDir, 'config', 'mssp-rate-card.yaml')));
}

export function loadScoringWeights(dataDir: string): ScoringWeights {
  return ScoringWeights.parse(readYaml(join(dataDir, 'config', 'scoring-weights.yaml')));
}

export function loadPortfolioAssumptions(dataDir: string): PortfolioAssumptions {
  return PortfolioAssumptions.parse(
    readYaml(join(dataDir, 'config', 'portfolio-assumptions.yaml')),
  );
}

export function loadCoverageAssumptions(dataDir: string): CoverageAssumptions {
  return CoverageAssumptions.parse(readYaml(join(dataDir, 'config', 'coverage-assumptions.yaml')));
}

export function loadFxConfig(dataDir: string): FxConfig {
  return FxConfig.parse(readYaml(join(dataDir, 'config', 'fx.yaml')));
}

/**
 * Every intake preset in data/presets, in file order then declaration order.
 *
 * An absent directory is an error rather than an empty list: the wizard offers
 * presets as its main path through intake, and silently offering none would
 * look like a UI bug rather than a missing file.
 */
export function loadPresets(dataDir: string): ScenarioPreset[] {
  const presetsDir = join(dataDir, 'presets');
  const presets: ScenarioPreset[] = [];

  for (const name of readdirSync(presetsDir).sort()) {
    if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue;
    presets.push(...PresetFile.parse(readYaml(join(presetsDir, name))).presets);
  }

  return presets;
}

/** Every product in data/catalog, keyed by id. */
export function loadCatalog(dataDir: string): Map<string, Product> {
  const catalogDir = join(dataDir, 'catalog');
  const products = new Map<string, Product>();

  for (const name of readdirSync(catalogDir).sort()) {
    if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue;
    for (const product of CatalogFile.parse(readYaml(join(catalogDir, name))).products) {
      products.set(product.id, product);
    }
  }

  return products;
}

/**
 * Every framework in data/frameworks, keyed by id.
 *
 * The engine takes only the frameworks the analyst ticked, so callers filter
 * this map rather than handing the whole library to the scoring stage.
 */
export function loadFrameworks(dataDir: string): Map<string, Framework> {
  const frameworksDir = join(dataDir, 'frameworks');
  const frameworks = new Map<string, Framework>();

  for (const name of readdirSync(frameworksDir).sort()) {
    if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue;
    const framework = Framework.parse(readYaml(join(frameworksDir, name)));
    frameworks.set(framework.id, framework);
  }

  return frameworks;
}
