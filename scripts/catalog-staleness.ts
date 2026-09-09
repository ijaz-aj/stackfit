/**
 * `pnpm catalog:staleness` — what needs re-checking, and how.
 *
 * Exits non-zero when anything is stale or undateable, so it can gate a release
 * the same way a failing test does. Ageing prices are reported but do not fail:
 * the point of the warning band is to surface work before it becomes a problem.
 */
import { join } from 'node:path';

import { loadCatalog, loadFreshnessPolicy } from './lib/load-config.js';
import { assessCatalogStaleness, type PriceStatus } from './lib/staleness.js';

/** Today, read once here — the boundary where a clock is allowed. */
function today(): string {
  const now = process.env['STACKFIT_TODAY'];
  return now !== undefined && now !== '' ? now : new Date().toISOString().slice(0, 10);
}

function describe(status: PriceStatus): string {
  const age = status.freshness.ageDays;
  const head = `  ${status.productId}/${status.tierId} (${status.confidence}, ${status.model})`;
  const body =
    age === undefined
      ? '    no dated source'
      : `    ${age} days old, allowance ${status.freshness.maxAgeDays}`;
  const where =
    status.freshness.refreshMethod === 'azure_retail_prices'
      ? '    → run `pnpm prices:refresh`'
      : status.checkUrl !== undefined
        ? `    → ${status.checkUrl}`
        : '    → no refresh method declared';
  return `${head}\n${body}\n${where}`;
}

const DATA_DIR = join(process.cwd(), 'data');
const asOf = today();
const report = assessCatalogStaleness(loadCatalog(DATA_DIR), asOf, loadFreshnessPolicy(DATA_DIR));

console.log(`catalog:staleness — ${report.all.length} price(s) assessed as at ${asOf}\n`);

if (report.stale.length > 0) {
  console.log(`STALE — past their allowance, do not quote these (${report.stale.length}):`);
  for (const status of report.stale) console.log(describe(status));
  console.log('');
}

if (report.unknown.length > 0) {
  console.log(`UNDATEABLE — no dated source (${report.unknown.length}):`);
  for (const status of report.unknown) console.log(describe(status));
  console.log('');
}

if (report.ageing.length > 0) {
  console.log(`AGEING — still valid, worth re-checking soon (${report.ageing.length}):`);
  for (const status of report.ageing) console.log(describe(status));
  console.log('');
}

if (report.undeclared.length > 0) {
  console.log(
    `NO REFRESH METHOD — nothing will ever re-check these automatically (${report.undeclared.length}):`,
  );
  for (const status of report.undeclared) {
    console.log(`  ${status.productId}/${status.tierId}`);
  }
  console.log('');
}

const fresh =
  report.all.length - report.stale.length - report.ageing.length - report.unknown.length;
console.log(
  `Summary: ${fresh} fresh, ${report.ageing.length} ageing, ${report.stale.length} stale, ` +
    `${report.unknown.length} undateable. ${report.machineRefreshable.length} can be refreshed automatically.`,
);

if (report.stale.length > 0 || report.unknown.length > 0) {
  console.error('\ncatalog:staleness — FAILED: stale or undateable prices present.');
  process.exitCode = 1;
}
