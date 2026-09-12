/**
 * `pnpm catalog:validate`: Zod-validate every YAML file under data/.
 *
 * A thin CLI over scripts/lib/validate-data.ts, which holds the actual rules so
 * `pnpm test` can assert the same invariants.
 */
import { join } from 'node:path';

import { validateDataTree } from './lib/validate-data';

const result = validateDataTree(join(process.cwd(), 'data'));

if (result.issues.length > 0) {
  console.error(`catalog:validate: ${result.issues.length} problem(s):\n`);
  for (const issue of result.issues) {
    console.error(`  data/${issue.file} → ${issue.path}\n    ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `catalog:validate: OK. ${result.productCount} product(s) across ` +
      `${result.catalogFileCount} catalog file(s), ${result.controlCount} control(s) ` +
      `across ${result.frameworkCount} framework(s), ${result.presetCount} intake preset(s).`,
  );

  if (result.placeholders.length > 0) {
    console.log(
      `\n  ${result.placeholders.length} tier(s) on placeholder pricing: ` +
        'chase these before any client sees output:',
    );
    for (const entry of result.placeholders) {
      console.log(`    ${entry.productId} / ${entry.tierId}  (data/${entry.file})`);
    }
  }

  if (result.effortPlaceholders.length > 0) {
    console.log(
      `\n  ${result.effortPlaceholders.length} effort figure(s) nobody has researched: ` +
        'these decide whether a free tool is cheap or expensive (hard rule 8):',
    );
    for (const entry of result.effortPlaceholders) {
      console.log(`    ${entry.productId} / ${entry.field}  (data/${entry.file})`);
    }
  }
}
