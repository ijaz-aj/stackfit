import { describe, expect, it } from 'vitest';

import { CatalogFile, ControlId, Product, ProductSupport } from '../src/index';

const sources = [{ url: 'https://example.com/docs', asOf: '2026-09-09' }];

const freeTier = {
  id: 'open',
  name: 'Open',
  capabilities: ['Log collection'],
  pricing: [
    {
      model: 'zero_licence',
      pricingConfidence: 'public_list',
      sources: [{ url: 'https://example.com/LICENSE', asOf: '2026-09-09' }],
    },
  ],
};

const support = {
  deviceClasses: ['server'],
  deploymentModes: ['on_prem'],
  scaleFloor: 'small',
  scaleCeiling: 'mid',
  airGapCapable: false,
};

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'example-tool',
    name: 'Example Tool',
    vendor: 'Example Inc.',
    category: 'siem',
    licenceModel: 'open_source',
    maturity: 'established',
    tiers: [freeTier],
    supports: support,
    opsBurden: { baseFte: 0.5, ftePerThousandAssets: 0.2, confidence: 'analyst_estimate' },
    implementation: {
      effortDays: 10,
      skillLevel: 'security_engineer',
      typicalWeeks: 4,
      confidence: 'analyst_estimate',
    },
    sources,
    ...overrides,
  };
}

describe('Product: open-source honesty (hard rule 8)', () => {
  it('accepts a zero-licence product that owns up to its operational cost', () => {
    expect(Product.safeParse(product()).success).toBe(true);
  });

  it('rejects a zero-licence product claiming no ops burden and no implementation effort', () => {
    const result = Product.safeParse(
      product({
        opsBurden: { baseFte: 0, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
        implementation: {
          effortDays: 0,
          skillLevel: 'generalist',
          typicalWeeks: 0,
          confidence: 'analyst_estimate',
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires opsBurden to be present at all', () => {
    const withoutOpsBurden = product();
    delete (withoutOpsBurden as Record<string, unknown>)['opsBurden'];
    expect(Product.safeParse(withoutOpsBurden).success).toBe(false);
  });

  it('requires a source for the capability claims', () => {
    expect(Product.safeParse(product({ sources: [] })).success).toBe(false);
  });

  it('rejects unknown fields, so a typo cannot become silent data', () => {
    expect(Product.safeParse(product({ oopsBurden: 1 })).success).toBe(false);
  });

  it('rejects duplicate tier ids within one product', () => {
    const result = Product.safeParse(product({ tiers: [freeTier, { ...freeTier }] }));
    expect(result.success).toBe(false);
  });
});

describe('Product: how well grounded the effort figures are', () => {
  it('requires a confidence on the ops burden', () => {
    const noConfidence = product();
    delete (noConfidence['opsBurden'] as Record<string, unknown>)['confidence'];
    expect(Product.safeParse(noConfidence).success).toBe(false);
  });

  it('requires a confidence on the implementation effort', () => {
    const noConfidence = product();
    delete (noConfidence['implementation'] as Record<string, unknown>)['confidence'];
    expect(Product.safeParse(noConfidence).success).toBe(false);
  });

  it('grades the two figures independently', () => {
    // A vendor that publishes a professional-services day count usually says
    // nothing about who runs the thing afterwards.
    const split = product({
      opsBurden: { baseFte: 0.5, ftePerThousandAssets: 0.2, confidence: 'analyst_estimate' },
      implementation: {
        effortDays: 10,
        skillLevel: 'security_engineer',
        typicalWeeks: 4,
        confidence: 'vendor_documented',
      },
    });
    expect(Product.safeParse(split).success).toBe(true);
  });

  it('rejects a placeholder effort figure with no TODO in the notes', () => {
    // Same convention as a placeholder price: an ungrounded figure has to be
    // findable by grepping for TODO.
    const result = Product.safeParse(
      product({
        opsBurden: { baseFte: 0.5, ftePerThousandAssets: 0.2, confidence: 'placeholder' },
        notes: 'Nothing here says the staffing figure is a guess.',
      }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a placeholder effort figure that says so in the notes', () => {
    const result = Product.safeParse(
      product({
        opsBurden: { baseFte: 0.5, ftePerThousandAssets: 0.2, confidence: 'placeholder' },
        notes: 'TODO: nobody has checked what it takes to run this.',
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe('ProductSupport', () => {
  it('rejects a scale ceiling below the scale floor', () => {
    const result = ProductSupport.safeParse({
      ...support,
      scaleFloor: 'large',
      scaleCeiling: 'small',
    });
    expect(result.success).toBe(false);
  });

  it('rejects airGapCapable that the deployment modes do not back up', () => {
    const result = ProductSupport.safeParse({ ...support, airGapCapable: true });
    expect(result.success).toBe(false);
  });

  it('accepts airGapCapable when air_gapped is a supported deployment mode', () => {
    const result = ProductSupport.safeParse({
      ...support,
      deploymentModes: ['on_prem', 'air_gapped'],
      airGapCapable: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('ControlId', () => {
  it.each(['nist-csf-2.0:DE.CM', 'cis-v8:8', 'pci-dss-4.0:11'])('accepts %s', (id) => {
    expect(ControlId.safeParse(id).success).toBe(true);
  });

  it.each(['DE.CM', 'made-up-framework:1', 'nist-csf-2.0:', ':8'])('rejects %s', (id) => {
    expect(ControlId.safeParse(id).success).toBe(false);
  });
});

describe('CatalogFile', () => {
  it('rejects a product filed under the wrong category', () => {
    const result = CatalogFile.safeParse({
      category: 'edr',
      products: [product()], // category: 'siem'
    });
    expect(result.success).toBe(false);
  });

  it('accepts a product whose category matches its file', () => {
    const result = CatalogFile.safeParse({ category: 'siem', products: [product()] });
    expect(result.success).toBe(true);
  });
});
