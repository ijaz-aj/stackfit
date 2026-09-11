// Guards the freshness machinery against the committed catalog.
//
// This is the test that stops the catalog rotting silently. It does NOT assert
// that everything is fresh — prices legitimately age between sessions, and a
// test that fails purely because time passed would be noise nobody reads.
// Instead it asserts the properties that must hold regardless of the date:
// every price is dateable, and every price says how to re-check it.
//
// `pnpm catalog:staleness` is the command that actually reports on age, and it
// exits non-zero when something is stale.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  loadCatalog,
  loadFreshnessPolicy,
  loadFxConfig,
  loadMsspRateCard,
} from '@stackfit/data';
import { assessCatalogStaleness, assessConfigStaleness } from '../scripts/lib/staleness.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const catalog = loadCatalog(DATA_DIR);
const policy = loadFreshnessPolicy(DATA_DIR);
const msspCard = loadMsspRateCard(DATA_DIR);
const fx = loadFxConfig(DATA_DIR);

/** Fixed, so this test asserts structure rather than the passage of time. */
const AS_AT = '2026-09-15';
const report = assessCatalogStaleness(catalog, AS_AT, policy);

describe('the committed catalog can always be aged', () => {
  it('has at least one price to assess', () => {
    expect(report.all.length).toBeGreaterThan(0);
  });

  it('dates every single price', () => {
    // An undateable price is worse than a stale one: nothing can ever tell you
    // it went bad. Hard rule 3 requires a source with an asOf; this proves it
    // holds across the whole catalog, not just per-record.
    expect(report.unknown.map((status) => `${status.productId}/${status.tierId}`)).toEqual([]);
  });

  it('declares how to re-check every price', () => {
    // The user requirement this whole layer exists for: "if the pricing changes
    // tomorrow it should be reflected". A price with no refresh method is one
    // nobody will ever re-check.
    expect(report.undeclared.map((status) => `${status.productId}/${status.tierId}`)).toEqual([]);
  });

  it('knows which prices a machine can refresh without a human', () => {
    expect(report.machineRefreshable.map((status) => status.productId)).toEqual([
      'microsoft-sentinel',
    ]);
  });

  it('gives every price a re-check deadline', () => {
    for (const status of report.all) {
      expect(status.freshness.recheckBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('the staleness report is usable as a release gate', () => {
  it('finds nothing stale at the date the catalog was written', () => {
    const atWriting = assessCatalogStaleness(catalog, '2026-09-09', policy);
    expect(atWriting.stale).toEqual([]);
    expect(atWriting.ageing).toEqual([]);
  });

  it('does go stale eventually, rather than being fresh forever', () => {
    // Proves the policy actually bites. A year on, every public_list price in
    // the catalog is past its 90-day allowance.
    const muchLater = assessCatalogStaleness(catalog, '2027-09-09', policy);
    expect(muchLater.stale.length).toBe(report.all.length);
  });

  it('sorts the report oldest-first, so the worst offender reads first', () => {
    const ages = report.all.map((status) => status.freshness.ageDays ?? Infinity);
    expect([...ages].sort((a, b) => b - a)).toEqual(ages);
  });
});

describe('config-level prices are checked too', () => {
  // The MSSP rate card and the FX table are prices, they carry an asOf, and
  // before this they were never walked — so they aged silently while the
  // catalog was policed. Hard rule 9 covers every price, not just the ones
  // attached to a product.
  const configPrices = [
    {
      file: 'config/mssp-rate-card.yaml',
      confidence: msspCard.confidence,
      sources: msspCard.sources,
      checkUrl: msspCard.sources[0]?.url,
    },
    {
      file: 'config/fx.yaml',
      confidence: 'public_list' as const,
      sources: [{ asOf: fx.asOf }, ...fx.sources],
      checkUrl: fx.sources[0]?.url,
    },
  ];

  it('covers both dated config prices', () => {
    const atWriting = assessConfigStaleness(configPrices, '2026-09-09', policy);
    expect(atWriting.all).toHaveLength(2);
    expect(atWriting.stale).toEqual([]);
    expect(atWriting.unknown).toEqual([]);
  });

  it('goes stale eventually, so an FX rate cannot quietly rot', () => {
    // A three-year TCO quoted at a year-old exchange rate is wrong by however
    // much the currency moved.
    const muchLater = assessConfigStaleness(configPrices, '2027-09-09', policy);
    expect(muchLater.stale).toHaveLength(2);
  });
});
