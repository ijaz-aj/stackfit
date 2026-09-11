/**
 * `pnpm catalog:staleness` — what needs re-checking, and how.
 *
 * Exits non-zero when anything is stale or undateable, so it can gate a release
 * the same way a failing test does. Ageing prices are reported but do not fail:
 * the point of the warning band is to surface work before it becomes a problem.
 */
import { join } from 'node:path';

import { loadCatalog, loadFreshnessPolicy, loadFxConfig, loadMsspRateCard } from '@stackfit/data';
import { assessCatalogStaleness, assessConfigStaleness, type PriceStatus } from './lib/staleness';

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
const policy = loadFreshnessPolicy(DATA_DIR);
const report = assessCatalogStaleness(loadCatalog(DATA_DIR), asOf, policy);

// Config-level prices. These are prices too, and before they were walked here
// they aged silently — the MSSP rate card and the FX table both carry an asOf.
const msspCard = loadMsspRateCard(DATA_DIR);
const fx = loadFxConfig(DATA_DIR);
const configReport = assessConfigStaleness(
  [
    {
      file: 'config/mssp-rate-card.yaml',
      confidence: msspCard.confidence,
      sources: msspCard.sources,
      checkUrl: msspCard.sources[0]?.url,
    },
    {
      // FX is a public list price by nature: the rate is published, not estimated.
      file: 'config/fx.yaml',
      confidence: 'public_list',
      sources: [{ asOf: fx.asOf }, ...fx.sources],
      checkUrl: fx.sources[0]?.url,
    },
  ],
  asOf,
  policy,
);

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

// ---- Config-level prices, reported separately so the two backlogs stay legible.
console.log(`config prices — ${configReport.all.length} assessed`);
for (const status of configReport.all) {
  const mark =
    status.freshness.status === 'fresh' ? 'ok  ' : status.freshness.status.toUpperCase().padEnd(4);
  console.log(
    `  ${mark} ${status.productId} — ${status.freshness.ageDays ?? '?'} days old, ` +
      `allowance ${status.freshness.maxAgeDays}` +
      (status.checkUrl !== undefined ? `\n       → ${status.checkUrl}` : ''),
  );
}
console.log('');

const staleCount = report.stale.length + configReport.stale.length;
const ageingCount = report.ageing.length + configReport.ageing.length;
const unknownCount = report.unknown.length + configReport.unknown.length;
const total = report.all.length + configReport.all.length;
const fresh = total - staleCount - ageingCount - unknownCount;

console.log(
  `Summary: ${fresh} fresh, ${ageingCount} ageing, ${staleCount} stale, ${unknownCount} undateable, ` +
    `across ${report.all.length} catalog and ${configReport.all.length} config price(s). ` +
    `${report.machineRefreshable.length} can be refreshed automatically.`,
);

if (staleCount > 0 || unknownCount > 0) {
  console.error('\ncatalog:staleness — FAILED: stale or undateable prices present.');
  process.exitCode = 1;
}
