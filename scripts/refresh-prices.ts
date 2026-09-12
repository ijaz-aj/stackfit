/**
 * `pnpm prices:refresh`: re-read every machine-refreshable price and report drift.
 *
 * Today that means the Azure Retail Prices API, which is unauthenticated,
 * machine-readable and keyed by a stable meter GUID. It is the only vendor feed
 * in the catalog that can be trusted to answer the same question twice.
 *
 * Reports by default; `--write` updates the YAML in place. Even with --write it
 * only ever touches the price and the source date (never the notes, never the
 * confidence) so a human still reviews what changed in the diff.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PriceRefresh } from '@stackfit/schema';

import { loadCatalog } from '@stackfit/data';

interface AzurePriceItem {
  readonly meterId: string;
  readonly meterName: string;
  readonly retailPrice: number;
  readonly unitOfMeasure: string;
  readonly currencyCode: string;
  readonly armRegionName: string;
}

interface Drift {
  readonly productId: string;
  readonly tierId: string;
  readonly meterName: string;
  readonly committedMinor: number;
  readonly liveMinor: number;
  readonly currency: string;
}

const DATA_DIR = join(process.cwd(), 'data');
const WRITE = process.argv.includes('--write');
const TODAY = new Date().toISOString().slice(0, 10);

async function fetchAzureMeter(refresh: Extract<PriceRefresh, { method: 'azure_retail_prices' }>) {
  const filter = `armRegionName eq '${refresh.armRegionName}' and meterId eq '${refresh.meterId}'`;
  const url = `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Azure price API returned ${response.status} for meter ${refresh.meterId}`);
  }

  const body = (await response.json()) as { Items?: AzurePriceItem[] };
  const item = body.Items?.[0];
  if (item === undefined) {
    throw new Error(
      `meter ${refresh.meterId} no longer exists in region ${refresh.armRegionName}: the SKU was probably retired, which needs a human`,
    );
  }
  if (item.unitOfMeasure !== refresh.expectedUnitOfMeasure) {
    throw new Error(
      `meter ${refresh.meterId} changed unit of measure from "${refresh.expectedUnitOfMeasure}" to "${item.unitOfMeasure}": the price is not comparable, this needs a human`,
    );
  }
  return item;
}

async function main(): Promise<void> {
  const catalog = loadCatalog(DATA_DIR);
  const drifts: Drift[] = [];
  const failures: string[] = [];
  let checked = 0;

  for (const product of catalog.values()) {
    for (const tier of product.tiers) {
      for (const rule of tier.pricing) {
        if (rule.refresh?.method !== 'azure_retail_prices') continue;
        checked += 1;

        try {
          const item = await fetchAzureMeter(rule.refresh);
          // Azure quotes major units; the catalog stores minor.
          const liveMinor = Math.round(item.retailPrice * 100);
          const committedMinor = rule.unitPrice?.amountMinor ?? 0;

          if (liveMinor !== committedMinor) {
            drifts.push({
              productId: product.id,
              tierId: tier.id,
              meterName: item.meterName,
              committedMinor,
              liveMinor,
              currency: item.currencyCode,
            });
          }
        } catch (error) {
          failures.push(`${product.id}/${tier.id}: ${(error as Error).message}`);
        }
      }
    }
  }

  console.log(`prices:refresh: checked ${checked} machine-refreshable price(s) as at ${TODAY}\n`);

  for (const failure of failures) console.error(`  FAILED  ${failure}`);
  if (failures.length > 0) console.error('');

  if (drifts.length === 0) {
    console.log('  No drift. Every automated price still matches the vendor feed.');
  } else {
    for (const drift of drifts) {
      const was = (drift.committedMinor / 100).toFixed(2);
      const now = (drift.liveMinor / 100).toFixed(2);
      const move = (
        ((drift.liveMinor - drift.committedMinor) / drift.committedMinor) *
        100
      ).toFixed(1);
      console.log(
        `  DRIFT  ${drift.productId}/${drift.tierId} "${drift.meterName}": ${drift.currency} ${was} → ${now} (${move}%)`,
      );
    }
  }

  if (WRITE && drifts.length > 0) {
    // Deliberately a targeted text substitution rather than a YAML round-trip:
    // re-serialising would reflow every comment in the file, and the comments
    // are where the reasoning lives.
    // Read the directory rather than naming the files: a hard-coded list goes
    // stale the moment a category is added, and the failure is silent. The
    // drift is reported, --write says nothing, and the YAML keeps the old
    // price. Phase 7 adds ten catalog files, so it would have gone stale twice.
    const catalogDir = join(DATA_DIR, 'catalog');
    const catalogFileNames = readdirSync(catalogDir).filter((name) => name.endsWith('.yaml'));

    for (const drift of drifts) {
      for (const name of catalogFileNames) {
        const path = join(catalogDir, name);
        const before = readFileSync(path, 'utf8');
        const after = before.replace(
          new RegExp(`(amountMinor:\\s*)${drift.committedMinor}\\b`),
          `$1${drift.liveMinor}`,
        );
        if (after !== before) {
          writeFileSync(path, after);
          console.log(`  updated ${name}`);
        }
      }
    }
    console.log('\n  ⚠ Prices updated. Source asOf dates were NOT touched: review the diff and');
    console.log('    update them by hand so the change is a deliberate, dated decision.');
  } else if (drifts.length > 0) {
    console.log('\n  Re-run with --write to apply these, then review the diff.');
  }

  if (failures.length > 0) process.exitCode = 1;
}

await main();
