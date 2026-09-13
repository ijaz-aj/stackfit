import { existsSync } from 'node:fs';
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
  loadStaffingModel,
  loadPortfolioAssumptions,
  loadPresets,
  loadScoringWeights,
  loadSizingAssumptions,
} from '@stackfit/data';
import type { CostInputs } from '@stackfit/engine';
import type {
  CurrencyCode,
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

/*
 * Where `data/` is, given that the answer differs between four layouts.
 *
 * This used to be one relative walk from `import.meta.url`, four segments up,
 * which is correct for the *source* tree and for `next dev`. It is wrong for a
 * deployed build, where this module is compiled into a chunk at a different
 * depth and the same four segments land somewhere else entirely. A standalone
 * build is the cheap way to see it: the bundle puts `data/` beside `apps/`, and
 * the compiled chunk sits under `apps/web/.next/server/chunks/`.
 *
 * So rather than encode one layout, look for the tree by a file that is
 * certainly in it, from both anchors that could be right: this module and the
 * working directory. First hit wins, and the order is deliberate: the module is
 * checked first because a test runner's cwd is the least trustworthy of the
 * two.
 *
 * The alternative was to stop reading files at runtime and bake the data into
 * the bundle at build time. That is a bigger change and a worse one: the tree
 * is the thing an analyst is meant to edit and re-read, and it is validated by
 * `pnpm catalog:validate` as files.
 */
const DATA_MARKER = join('config', 'sizing-assumptions.yaml');

function resolveDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const anchors = [here, process.cwd()];

  const candidates: string[] = [];
  for (const anchor of anchors) {
    // Eight is past the deepest layout in play (a chunk nested inside
    // `.next/server/chunks/ssr/`) and stops well short of the filesystem root.
    let current = anchor;
    for (let depth = 0; depth <= 8; depth += 1) {
      candidates.push(join(current, 'data'));
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  for (const candidate of candidates) {
    if (existsSync(join(candidate, DATA_MARKER))) return candidate;
  }

  /*
   * Loudly, and with the list.
   *
   * The failure this replaces was a bare ENOENT on one YAML path, thrown from
   * inside a loader three frames down, on a host where nobody can open a shell
   * to go looking. Naming every place that was checked turns "file not found"
   * into a deployment answer: the tree was not shipped, and `next.config.ts`
   * says how it is meant to be.
   */
  throw new Error(
    `Cannot find the data/ tree. Looked for ${DATA_MARKER} under:\n` +
      candidates.map((candidate) => `  ${candidate}`).join('\n') +
      '\nOn a deployment this means the tree was not traced into the bundle. See ' +
      'outputFileTracingIncludes in apps/web/next.config.ts.',
  );
}

const DATA_DIR = resolveDataDir();

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
    staffingModel: loadStaffingModel(DATA_DIR),
      costAssumptions: loadCostAssumptions(DATA_DIR),
      fx,
      freshnessPolicy: loadFreshnessPolicy(DATA_DIR),
    },
  };

  return cached;
}

/**
 * Every region's natural currency, taken from the labour rate card.
 *
 * The rate card already holds each region's pay in the currency that region is
 * actually paid in, which makes it the one place this mapping exists. Writing a
 * second `{ us: 'USD', eu: 'EUR' }` somewhere in the UI would be a second thing
 * to keep in step, and the first symptom of it drifting would be a client
 * priced in the wrong money.
 *
 * The UK sits in USD here rather than GBP, because GBP is not a supported
 * scenario currency yet; the rate card says the same thing in the same words.
 */
export function currencyByRegion(): Readonly<Record<string, CurrencyCode>> {
  const { labourRates } = engineData().costInputsWithoutDate;
  return Object.fromEntries(
    Object.entries(labourRates.byRegion).map(([region, rate]) => [
      region,
      rate.loadedAnnualCost.currency,
    ]),
  );
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
