import { describe, expect, it } from 'vitest';

import { PLACEHOLDER_UNIT_PRICE_MINOR, PricingRule } from '../src/index';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

const sourced = [{ url: 'https://example.com/pricing', asOf: '2026-09-09' }];

describe('PricingRule: sourcing (hard rules 2 and 3)', () => {
  it('accepts a sourced per-endpoint price', () => {
    const result = PricingRule.safeParse({
      model: 'per_endpoint_year',
      unitPrice: usd(5999),
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-placeholder price with no source', () => {
    const result = PricingRule.safeParse({
      model: 'per_endpoint_year',
      unitPrice: usd(5999),
      pricingConfidence: 'public_list',
      sources: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a source with no asOf date', () => {
    const result = PricingRule.safeParse({
      model: 'per_endpoint_year',
      unitPrice: usd(5999),
      pricingConfidence: 'analyst_estimate',
      sources: [{ url: 'https://example.com/pricing' }],
    });
    expect(result.success).toBe(false);
  });

  it('requires a source on zero_licence too: a free licence is still a claim', () => {
    const result = PricingRule.safeParse({
      model: 'zero_licence',
      pricingConfidence: 'public_list',
      sources: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('PricingRule: placeholders', () => {
  it('accepts a placeholder carrying the sentinel and a TODO note', () => {
    const result = PricingRule.safeParse({
      model: 'per_user_year',
      unitPrice: usd(PLACEHOLDER_UNIT_PRICE_MINOR),
      pricingConfidence: 'placeholder',
      sources: [],
      notes: 'TODO: get per-plan pricing from the reseller.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a placeholder with no TODO note', () => {
    const result = PricingRule.safeParse({
      model: 'per_user_year',
      unitPrice: usd(PLACEHOLDER_UNIT_PRICE_MINOR),
      pricingConfidence: 'placeholder',
      sources: [],
      notes: 'will chase this up at some point',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a placeholder wearing a plausible invented number', () => {
    // The whole point of the sentinel: an invented-looking price must not be
    // able to hide behind the placeholder flag.
    const result = PricingRule.safeParse({
      model: 'per_user_year',
      unitPrice: usd(1200),
      pricingConfidence: 'placeholder',
      sources: [],
      notes: 'TODO: confirm with vendor',
    });
    expect(result.success).toBe(false);
  });
});

describe('PricingRule: model coherence', () => {
  it('rejects a per-unit model with no unitPrice', () => {
    const result = PricingRule.safeParse({
      model: 'per_gb_day_year',
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero_licence carrying a unitPrice', () => {
    const result = PricingRule.safeParse({
      model: 'zero_licence',
      unitPrice: usd(1),
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });

  it('rejects flat_tiered with no tiers', () => {
    const result = PricingRule.safeParse({
      model: 'flat_tiered',
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });

  it('rejects tiers on a model that is not flat_tiered', () => {
    const result = PricingRule.safeParse({
      model: 'per_asset_year',
      unitPrice: usd(100),
      tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(100) }],
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a tier with both flatPrice and unitPrice', () => {
    const result = PricingRule.safeParse({
      model: 'flat_tiered',
      tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(100), unitPrice: usd(1) }],
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a tier whose maxUnits is below its minUnits', () => {
    const result = PricingRule.safeParse({
      model: 'flat_tiered',
      tiers: [{ minUnits: 500, maxUnits: 100, flatPrice: usd(100) }],
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });

  it('requires consumption pricing to name its unit', () => {
    const result = PricingRule.safeParse({
      model: 'consumption',
      unitPrice: usd(430),
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });
});

describe('Money', () => {
  it('rejects a fractional minor-unit amount (hard rule 1)', () => {
    const result = PricingRule.safeParse({
      model: 'per_endpoint_year',
      unitPrice: { amountMinor: 59.99, currency: 'USD' },
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unsupported currency code', () => {
    const result = PricingRule.safeParse({
      model: 'per_endpoint_year',
      unitPrice: { amountMinor: 5999, currency: 'GBP' },
      pricingConfidence: 'public_list',
      sources: sourced,
    });
    expect(result.success).toBe(false);
  });
});
