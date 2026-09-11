import type { PricingRule, ProductTier } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { assessPriceFreshness, assessTierFreshness, needsRecheck } from '../src/index';
import { buildFreshnessPolicy } from './fixtures';

const policy = buildFreshnessPolicy();

function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    model: 'per_endpoint_year',
    unitPrice: { amountMinor: 5999, currency: 'USD' },
    termYears: 1,
    pricingConfidence: 'public_list',
    sources: [{ url: 'https://example.com/pricing', asOf: '2026-01-01' }],
    ...overrides,
  } as PricingRule;
}

describe('assessPriceFreshness', () => {
  it('is fresh well inside the allowance', () => {
    // public_list allowance is 90 days; 30 days in is comfortably fresh.
    const result = assessPriceFreshness(rule(), '2026-01-31', policy);
    expect(result.status).toBe('fresh');
    expect(result.ageDays).toBe(30);
  });

  it('turns ageing at the warning fraction, before anything expires', () => {
    // 75% of the 90-day allowance is 67 days; 2026-01-01 + 67 days is 2026-03-09.
    expect(assessPriceFreshness(rule(), '2026-03-09', policy).ageDays).toBe(67);
    expect(assessPriceFreshness(rule(), '2026-03-09', policy).status).toBe('ageing');
    expect(assessPriceFreshness(rule(), '2026-03-08', policy).status).toBe('fresh');
  });

  it('turns stale the day after the allowance runs out, not on the day', () => {
    // 2026-01-01 + 90 days is exactly 2026-04-01, which is still within
    // allowance. The day after is not.
    expect(assessPriceFreshness(rule(), '2026-04-01', policy).ageDays).toBe(90);
    expect(assessPriceFreshness(rule(), '2026-04-01', policy).status).toBe('ageing');
    expect(assessPriceFreshness(rule(), '2026-04-02', policy).status).toBe('stale');
  });

  it('reports the date a price must be re-checked by', () => {
    const result = assessPriceFreshness(rule(), '2026-01-31', policy);
    expect(result.recheckBy).toBe('2026-04-01');
  });

  it('gives a vendor quote a longer life than a scraped list price', () => {
    // At 120 days a public_list price is past its 90-day allowance, while a
    // vendor quote is still inside its 180-day one.
    const asAt = '2026-05-01';
    const listPrice = assessPriceFreshness(rule(), asAt, policy);
    const quote = assessPriceFreshness(rule({ pricingConfidence: 'vendor_quote' }), asAt, policy);

    expect(listPrice.ageDays).toBe(120);
    expect(listPrice.status).toBe('stale');
    expect(quote.status).toBe('fresh');
    expect(quote.maxAgeDays).toBeGreaterThan(listPrice.maxAgeDays);

    // It does expire eventually, just later.
    expect(
      assessPriceFreshness(rule({ pricingConfidence: 'vendor_quote' }), '2026-08-01', policy)
        .status,
    ).toBe('stale');
  });

  it('takes the newest source date, not the first', () => {
    const result = assessPriceFreshness(
      rule({
        sources: [
          { url: 'https://example.com/old', asOf: '2025-01-01' },
          { url: 'https://example.com/new', asOf: '2026-01-01' },
        ],
      }),
      '2026-01-31',
      policy,
    );
    expect(result.newestSourceDate).toBe('2026-01-01');
    expect(result.ageDays).toBe(30);
  });

  it('reports an unsourced price as unknown rather than guessing an age', () => {
    const result = assessPriceFreshness(
      rule({ pricingConfidence: 'placeholder', sources: [], notes: 'TODO chase this' }),
      '2026-01-31',
      policy,
    );
    expect(result.status).toBe('unknown');
    expect(result.ageDays).toBeUndefined();
    expect(needsRecheck(result)).toBe(true);
  });

  it('flags a price with no declared refresh method', () => {
    expect(assessPriceFreshness(rule(), '2026-01-31', policy).refreshMethod).toBe('undeclared');
  });

  it('reports a declared refresh method so the automated set is visible', () => {
    const result = assessPriceFreshness(
      rule({
        refresh: {
          method: 'azure_retail_prices',
          meterId: '05d96412-9ca4-5926-b2a0-c646f72b2c2c',
          armRegionName: 'eastus',
          expectedUnitOfMeasure: '1 GB',
        },
      }),
      '2026-01-31',
      policy,
    );
    expect(result.refreshMethod).toBe('azure_retail_prices');
  });

  it('is timezone-independent — the answer does not depend on where you run it', () => {
    // Both dates parse at UTC midnight, so the gap is exactly 30 whole days
    // regardless of the host timezone.
    expect(assessPriceFreshness(rule(), '2026-01-31', policy).ageDays).toBe(30);
  });
});

describe('needsRecheck', () => {
  it('is true for stale and unknown, false for fresh and ageing', () => {
    const at = (today: string) => needsRecheck(assessPriceFreshness(rule(), today, policy));
    expect(at('2026-01-31')).toBe(false); // fresh
    expect(at('2026-03-08')).toBe(false); // ageing, still usable
    expect(at('2026-05-01')).toBe(true); // stale
  });
});

describe('assessTierFreshness', () => {
  it('is only as fresh as the stalest price in the tier', () => {
    const tier: ProductTier = {
      id: 'standard',
      name: 'Standard',
      capabilities: [],
      pricing: [
        rule({ sources: [{ url: 'https://example.com/a', asOf: '2026-01-01' }] }),
        rule({ sources: [{ url: 'https://example.com/b', asOf: '2025-01-01' }] }),
      ],
    };

    const result = assessTierFreshness(tier, '2026-01-31', policy);
    expect(result.status).toBe('stale');
    expect(result.newestSourceDate).toBe('2025-01-01');
  });
});
