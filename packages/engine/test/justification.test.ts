// "Why this one and not the others", as something the analyst can read aloud.
//
// The tests that matter are the ones about not over-claiming. A verdict is only
// allowed to say what the pipeline actually computed, so an alternative that
// scored *higher* than the winner must not be described as a worse product, and
// one that never reached scoring must carry the filter's own words rather than
// a guess about why it lost.

import type { Product, ProductCategory } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { justifyBundle, runPipeline, type PipelineResult } from '../src/index';
import {
  buildCategoryWeights,
  buildClientProfile,
  buildCostInputs,
  buildCoverageAssumptions,
  buildMsspRateCard,
  buildPortfolioAssumptions,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

function product(
  id: string,
  category: ProductCategory,
  annualMinor: number,
  overrides: Partial<Product> = {},
): Product {
  const base = buildProduct({
    id,
    pricing: [
      { model: 'flat_tiered', tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(annualMinor) }] },
    ],
  });
  return {
    ...base,
    category,
    name: id,
    vendor: `${id} Inc.`,
    supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    opsBurden: { baseFte: 0.1, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
    ...overrides,
  };
}

function run(products: readonly Product[], profileOverrides = {}): PipelineResult {
  return runPipeline({
    profile: buildClientProfile({
      securityStaffFte: 3,
      budget: { annualCap: usd(500_000_00), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
      ...profileOverrides,
    }),
    inventory: {
      windowsServers: { count: 20 },
      windowsEndpoints: { count: 100 },
      networkVendors: [],
    },
    products,
    frameworks: new Map(),
    sizingAssumptions: buildSizingAssumptions(),
    categoryWeights: buildCategoryWeights(),
    scoringWeights: buildScoringWeights(),
    portfolioAssumptions: buildPortfolioAssumptions(),
    coverageAssumptions: buildCoverageAssumptions(),
    mssp: buildMsspRateCard(),
    costInputs: buildCostInputs(),
  });
}

function justify(result: PipelineResult) {
  return justifyBundle(result.recommended, {
    scores: result.scores,
    candidates: result.candidates,
    productNames: new Map(
      result.products.map((entry) => [entry.id, { name: entry.name, vendor: entry.vendor }]),
    ),
  });
}

describe('justifying a selection', () => {
  it('accounts for every SKU in the category, not just the runner-up', () => {
    // The defect: the dashboard showed one alternative out of five, so three
    // products the client is paying not to have were never mentioned.
    const result = run([
      product('siem-a', 'siem', 100_00),
      product('siem-b', 'siem', 200_00),
      product('siem-c', 'siem', 300_00),
      product('siem-d', 'siem', 400_00),
    ]);

    const siem = justify(result).find((entry) => entry.category === 'siem');
    expect(siem).toBeDefined();
    expect(siem?.consideredCount).toBe(4);
    expect(siem?.alternatives).toHaveLength(3);
    expect(siem?.headline).toContain('4 SKUs');
  });

  it('gives every alternative a verdict, never a bare number', () => {
    const result = run([
      product('siem-a', 'siem', 100_00),
      product('siem-b', 'siem', 900_00),
    ]);

    const siem = justify(result).find((entry) => entry.category === 'siem');
    for (const alternative of siem?.alternatives ?? []) {
      expect(alternative.verdict.length).toBeGreaterThan(0);
      expect(alternative.verdict).toMatch(/\S/);
    }
  });

  it('names the dimension that decided it when the alternative scored lower', () => {
    // A product that reaches fewer of the client's assets loses on asset
    // coverage, and the verdict has to say so rather than "scored lower".
    const narrow = product('siem-narrow', 'siem', 100_00);
    const result = run([
      product('siem-wide', 'siem', 100_00),
      {
        ...narrow,
        supports: { ...narrow.supports, deviceClasses: ['server'] },
      },
    ]);

    const siem = justify(result).find((entry) => entry.category === 'siem');
    const loser = siem?.alternatives.find((entry) => entry.productId === 'siem-narrow');

    expect(loser?.kind).toBe('lower_fit');
    expect(loser?.decidingDimension).toBe('asset_coverage');
    expect(loser?.verdict).toContain('asset coverage');
  });

  it('does not call a higher-scoring alternative a worse product', () => {
    // The honest case. Value density can pick a cheaper product over a better
    // one, and saying "scores lower" there would be a lie the client can check.
    const wide = product('siem-dear', 'siem', 4_000_00);
    const result = run([
      product('siem-cheap', 'siem', 100_00, {
        supports: { ...wide.supports, deviceClasses: ['server'] },
      }),
      wide,
    ]);

    const siem = justify(result).find((entry) => entry.category === 'siem');
    const selected = siem?.selectedProductId;
    const alternative = siem?.alternatives[0];

    // The selected product scores 72.2 here; the one it beat scores 93. Value
    // density picked the cheaper tool, and the verdict has to own that.
    expect(selected).toBe('siem-cheap');
    expect(alternative?.fitScore).toBeGreaterThan(siem?.selectedFitScore ?? 0);
    expect(alternative?.kind).toBe('costs_more');
    expect(alternative?.verdict).toContain('level with or above');
    // Compared on total annual cost, not licence price. Procurement alone is
    // how a self-hosted tool reads as "80 times cheaper" than a commercial one
    // it is actually level with once the people to run it are counted.
    expect(alternative?.verdict).toContain('all-in');
    // The one thing it must never say about a product that scored higher.
    expect(alternative?.verdict).not.toContain('Scores 93 against');
  });

  it('carries the hard filter’s own words for a product that never scored', () => {
    const result = run(
      [product('siem-a', 'siem', 100_00), product('siem-banned', 'siem', 50_00)],
      { excludedProducts: ['siem-banned'] },
    );

    const siem = justify(result).find((entry) => entry.category === 'siem');
    const banned = siem?.alternatives.find((entry) => entry.productId === 'siem-banned');

    expect(banned?.kind).toBe('eliminated');
    expect(banned?.verdict).toContain('Excluded by the analyst');
    // Nothing eliminated is costed, so quoting a price for it would be invented.
    expect(banned?.annualSpend).toBeNull();
  });

  it('ranks contenders above products that were ruled out', () => {
    const result = run(
      [
        product('siem-a', 'siem', 100_00),
        product('siem-b', 'siem', 200_00),
        product('siem-banned', 'siem', 10_00),
      ],
      { excludedProducts: ['siem-banned'] },
    );

    const siem = justify(result).find((entry) => entry.category === 'siem');
    const kinds = siem?.alternatives.map((entry) => entry.kind) ?? [];
    expect(kinds[kinds.length - 1]).toBe('eliminated');
    expect(siem?.headline).toContain('ruled out before scoring');
  });

  it('says so plainly when there was nothing else to choose from', () => {
    const result = run([product('siem-only', 'siem', 100_00)]);
    const siem = justify(result).find((entry) => entry.category === 'siem');

    expect(siem?.alternatives).toEqual([]);
    expect(siem?.headline).toContain('only option');
  });

  it('produces the same justification twice', () => {
    const result = run([
      product('siem-a', 'siem', 100_00),
      product('siem-b', 'siem', 200_00),
      product('siem-c', 'siem', 300_00),
    ]);
    expect(JSON.stringify(justify(result))).toBe(JSON.stringify(justify(result)));
  });
});

describe('a verdict never says something a reader can disprove', () => {
  it('does not tell a client a product costs "1 times as much"', () => {
    // Two SKUs of the same product a few percent apart read as "costs 1 times
    // as much a year", which makes a reader distrust the rest of the page.
    const result = run([
      product('siem-a', 'siem', 100_00),
      product('siem-b', 'siem', 101_00),
      product('edr-a', 'edr', 100_00),
    ]);

    for (const category of justify(result)) {
      for (const alternative of category.alternatives) {
        expect(alternative.verdict).not.toMatch(/\b1 times as much\b/);
        expect(alternative.verdict).not.toMatch(/\b1\.0 times as much\b/);
      }
    }
  });

  it('does not blame value density for a product that is cheaper and better', () => {
    // A product that costs less to own *and* scores higher has the better
    // density by construction, so "did not win on value density" would be
    // false. When the bundle was built on licence price, say that instead.
    const result = run([
      product('siem-a', 'siem', 100_00),
      product('siem-b', 'siem', 200_00),
      product('siem-c', 'siem', 400_00),
    ]);

    for (const category of justify(result)) {
      const winner = category.selectedFitScore;
      for (const alternative of category.alternatives) {
        if (alternative.kind !== 'not_preferred') continue;
        if (alternative.fitScore <= winner) continue;
        expect(alternative.verdict).not.toContain('value density');
      }
    }
  });
});
