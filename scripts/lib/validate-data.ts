/**
 * Validation of the data/ tree, as a library.
 *
 * Kept separate from the CLI so `pnpm test` can assert the committed catalog is
 * clean without shelling out — a bad `data:` commit should fail the test run,
 * not just the command nobody remembered to run.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CatalogFile,
  CostAssumptions,
  Framework,
  FreshnessPolicy,
  FxConfig,
  LabourRates,
  SizingAssumptions,
} from '@stackfit/schema';
import { parse as parseYaml } from 'yaml';

export interface ValidationIssue {
  /** Path of the offending file, relative to the data directory. */
  readonly file: string;
  /** Dotted path to the field within the document, or '(root)'. */
  readonly path: string;
  readonly message: string;
}

export interface PlaceholderEntry {
  readonly productId: string;
  readonly tierId: string;
  readonly file: string;
}

export interface DataValidationResult {
  readonly issues: readonly ValidationIssue[];
  /** Tiers priced with `pricingConfidence: 'placeholder'`, for the STATUS.md list. */
  readonly placeholders: readonly PlaceholderEntry[];
  readonly productCount: number;
  readonly catalogFileCount: number;
  readonly frameworkCount: number;
  readonly controlCount: number;
}

/**
 * Structural stand-in for a Zod schema's `safeParse`. Declared here rather than
 * imported so this module needs no direct dependency on zod — it only ever
 * speaks to schemas handed to it by @stackfit/schema.
 */
interface Parseable<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      };
}

function yamlFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => join(dir, name));
}

export function validateDataTree(dataDir: string): DataValidationResult {
  const issues: ValidationIssue[] = [];
  const placeholders: PlaceholderEntry[] = [];

  const relativeToData = (file: string): string =>
    file
      .slice(dataDir.length)
      .replace(/^[\\/]/, '')
      .replace(/\\/g, '/');

  const report = (file: string, path: string, message: string): void => {
    issues.push({ file: relativeToData(file), path, message });
  };

  const loadYaml = (file: string): unknown | undefined => {
    try {
      return parseYaml(readFileSync(file, 'utf8'));
    } catch (error) {
      report(file, '(root)', `YAML parse error: ${(error as Error).message}`);
      return undefined;
    }
  };

  const validate = <T>(file: string, schema: Parseable<T>, raw: unknown): T | undefined => {
    const result = schema.safeParse(raw);
    if (result.success) return result.data;

    for (const issue of result.error.issues) {
      report(file, issue.path.map(String).join('.') || '(root)', issue.message);
    }
    return undefined;
  };

  if (!existsSync(dataDir)) {
    return {
      issues: [{ file: '.', path: '(root)', message: `data directory not found: ${dataDir}` }],
      placeholders: [],
      productCount: 0,
      catalogFileCount: 0,
      frameworkCount: 0,
      controlCount: 0,
    };
  }

  // ---- Frameworks first: the catalog's control ids are checked against them.
  const knownControlIds = new Set<string>();
  const frameworkFiles = yamlFilesIn(join(dataDir, 'frameworks'));

  for (const file of frameworkFiles) {
    const raw = loadYaml(file);
    if (raw === undefined) continue;

    const framework = validate(file, Framework, raw);
    if (framework === undefined) continue;

    for (const control of framework.controls) {
      knownControlIds.add(`${framework.id}:${control.id}`);
    }
  }

  // ---- Catalog.
  const catalogFiles = yamlFilesIn(join(dataDir, 'catalog'));
  const productFileById = new Map<string, string>();
  let productCount = 0;

  for (const file of catalogFiles) {
    const raw = loadYaml(file);
    if (raw === undefined) continue;

    const catalog = validate(file, CatalogFile, raw);
    if (catalog === undefined) continue;

    for (const product of catalog.products) {
      productCount += 1;

      const firstSeenIn = productFileById.get(product.id);
      if (firstSeenIn !== undefined) {
        report(
          file,
          product.id,
          `duplicate product id, already defined in ${relativeToData(firstSeenIn)}`,
        );
      } else {
        productFileById.set(product.id, file);
      }

      // Hard rule 2 covers invented compliance mappings, not just prices: a
      // product may only claim controls that exist in data/frameworks.
      for (const controlId of product.controlsCovered) {
        if (!knownControlIds.has(controlId)) {
          report(
            file,
            `${product.id}.controlsCovered`,
            `"${controlId}" does not exist in data/frameworks — a mapping cannot be claimed against a control that is not defined`,
          );
        }
      }

      for (const tier of product.tiers) {
        if (tier.pricing.some((rule) => rule.pricingConfidence === 'placeholder')) {
          placeholders.push({
            productId: product.id,
            tierId: tier.id,
            file: relativeToData(file),
          });
        }
      }
    }
  }

  // ---- Config. Absent files are fine; the ones that exist must be valid.
  // A config file with no schema yet is reported rather than waved through, so
  // a new tunable cannot land without one.
  for (const file of yamlFilesIn(join(dataDir, 'config'))) {
    const raw = loadYaml(file);
    if (raw === undefined) continue;

    if (file.endsWith('fx.yaml')) {
      validate(file, FxConfig, raw);
    } else if (file.endsWith('sizing-assumptions.yaml')) {
      validate(file, SizingAssumptions, raw);
    } else if (file.endsWith('labour-rates.yaml')) {
      validate(file, LabourRates, raw);
    } else if (file.endsWith('cost-assumptions.yaml')) {
      validate(file, CostAssumptions, raw);
    } else if (file.endsWith('freshness-policy.yaml')) {
      validate(file, FreshnessPolicy, raw);
    } else {
      report(file, '(root)', 'no schema is wired up for this config file, so it is unvalidated');
    }
  }

  return {
    issues,
    placeholders,
    productCount,
    catalogFileCount: catalogFiles.length,
    frameworkCount: frameworkFiles.length,
    controlCount: knownControlIds.size,
  };
}
