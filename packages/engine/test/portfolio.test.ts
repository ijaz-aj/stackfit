// Portfolio assembly (PROJECT_SPEC §7.4).
//
// The test that matters most is step 7: when the budget cannot cover the
// mandatory set, this stage must say so rather than quietly returning a stack
// that fails the client's compliance obligation.

import type {
  AssetInventory,
  Framework,
  MsspRateCard,
  PortfolioAssumptions,
  Product,
  ProductCategory,
} from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { computeProductCost } from '../src/cost';
import { computeCategoryRelevance, computeInfrastructureProfile } from '../src/infrastructure';
import { buildPortfolio, msspAlternative, type PortfolioInputs } from '../src/portfolio';
import { scoreProducts } from '../src/scoring';
import { computeSizing } from '../src/sizing';
import {
  buildClientProfile,
  buildCostInputs,
  buildFramework,
  buildFxConfig,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

function inventory(counts: Record<string, number>): AssetInventory {
  return {
    ...Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
    networkVendors: [],
  } as AssetInventory;
}

/** Minimal category weights: every category applicable, flat base weight. */
function buildCategoryWeights(overrides: Record<ProductCategory, number> = {} as never) {
  const surfaces = [
    'endpoint',
    'on_prem_server',
    'network_edge',
    'public_app',
    'cloud_iaas',
    'saas_identity',
    'ot_ics',
    'identity',
  ] as const;
  const categories: ProductCategory[] = [
    'siem',
    'edr',
    'ndr',
    'pam',
    'iam',
    'vulnerability_management',
    'email_security',
    'soar',
    'backup',
    'ngfw',
    'asset_discovery',
    'deception',
    'mdr',
  ];
  const assetClasses = [
    'windowsEndpoints','macosEndpoints','linuxEndpoints','windowsServers','windowsDomainControllers',
    'linuxServers','hypervisors','containerNodes','routers','switches','wirelessControllers','firewalls',
    'vpnConcentrators','loadBalancers','databases','fileServers','internalWebApps','publicWebApps',
    'otIcsScadaDevices','iotCctvPosDevices','awsAccounts','azureSubscriptions','gcpProjects',
    'cloudWorkloads','m365Seats','googleWorkspaceSeats','otherCriticalSaasApps','remoteUsers',
    'privilegedAccounts','serviceAccounts',
  ];
  return {
    materialSurfaceShare: 0.1,
    otHeavyShare: 0.35,
    dominantLocusShare: 0.6,
    surfaceUnits: Object.fromEntries(
      assetClasses.map((assetClass) => [
        assetClass,
        {
          surface: assetClass.includes('Endpoint') ? 'endpoint' : 'on_prem_server',
          weight: 1,
          basis: 'test fixture',
        },
      ]),
    ),
    categories: categories.map((category) => ({
      category,
      baseRiskReduction: overrides[category] ?? 90,
      basis: 'test fixture',
      requiresAnyOf: [...surfaces],
      affinities: [],
    })),
    industryModifiers: [],
  } as never;
}

const assumptions: PortfolioAssumptions = {
  essentialWeightFloor: 85,
  suiteDiscountRate: 0.1,
  suiteIntegrationBonusPoints: 5,
  minimumAnnualisedCostMinor: 100,
  openSourcePreferencePoints: 8,
  basis: 'test fixture',
};

const msspCard: MsspRateCard = {
  currency: 'USD',
  asOf: '2026-01-01',
  confidence: 'analyst_estimate',
  notes: 'test fixture',
  sources: [{ url: 'https://example.com/mssp', asOf: '2026-01-01' }],
  tiers: (['small', 'mid', 'large', 'enterprise'] as const).map((scaleClass) => ({
    scaleClass,
    basePlatformFeeMonthly: usd(100_000),
    basis: 'test fixture',
  })),
  perEndpointMonthly: usd(1000),
  perServerMonthly: usd(2000),
  perGbDayMonthly: usd(5000),
  serviceLevels: [
    { level: 'monitoring', multiplier: 1, coveredCategories: ['siem', 'mdr'], basis: 'test fixture' },
    { level: 'mdr', multiplier: 1.5, coveredCategories: ['siem', 'mdr', 'edr', 'soar', 'ndr'], basis: 'test fixture' },
    { level: 'managed_security', multiplier: 2, coveredCategories: ['siem', 'mdr', 'edr', 'soar', 'ndr', 'ngfw'], basis: 'test fixture' },
  ],
  minimumMonthly: usd(50_000),
};

interface Scenario {
  readonly products: readonly Product[];
  readonly annualCap?: number | null;
  readonly frameworks?: readonly Framework[];
  readonly inventory?: AssetInventory;
  readonly securityStaffFte?: number;
}

function buildInputs(scenario: Scenario): PortfolioInputs {
  const inv = scenario.inventory ?? inventory({ windowsServers: 20, windowsEndpoints: 20 });
  const profile = buildClientProfile({
    securityStaffFte: scenario.securityStaffFte ?? 3,
    budget: {
      annualCap: scenario.annualCap === undefined ? null : scenario.annualCap === null ? null : usd(scenario.annualCap),
      oneTimeCap: null,
      currency: 'USD',
      horizonYears: 3,
    },
  });
  const sizing = computeSizing(inv, profile, buildSizingAssumptions());
  const costInputs = buildCostInputs();
  const weights = buildCategoryWeights();

  const scores = scoreProducts(scenario.products, {
    profile,
    inventory: inv,
    sizing,
    frameworks: scenario.frameworks ?? [],
    weights: buildScoringWeights(),
    categoryWeights: weights,
  });

  const costs = new Map(
    scenario.products.map((product) => [
      product.id,
      computeProductCost(product, product.tiers[0]!, sizing, profile, costInputs),
    ]),
  );

  const profileInfra = computeInfrastructureProfile(inv, weights);

  return {
    profile,
    sizing,
    products: scenario.products,
    scores,
    costs,
    relevance: computeCategoryRelevance(profileInfra, weights),
    frameworks: scenario.frameworks ?? [],
    categoryWeights: weights,
    assumptions,
    mssp: msspCard,
    fx: buildFxConfig(),
    costInputs,
  };
}

/** A priced product in a given category. */
function product(
  id: string,
  category: ProductCategory,
  annualMinor: number,
  vendor = 'Vendor A',
): Product {
  const base = buildProduct({
    id,
    pricing: [{ model: 'flat_tiered', tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(annualMinor) }] }],
  });
  return {
    ...base,
    category,
    vendor,
    supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    opsBurden: { baseFte: 0.1, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
  };
}

const pciMandatingSiem: Framework = buildFramework({
  id: 'pci-dss-4.0',
  name: 'PCI DSS',
  sourceQuality: 'secondary_sources',
  version: '4.0',
  controls: [{ id: '10', title: 'Log and monitor', satisfiedBy: ['siem'], mandatory: true }],
});

describe('step 1 — category ranking', () => {
  it('marks a category mandatory when a selected framework requires it', () => {
    const { rankings } = buildPortfolio(
      buildInputs({ products: [product('siem-a', 'siem', 100_000)], frameworks: [pciMandatingSiem] }),
    );
    const siem = rankings.find((entry) => entry.category === 'siem');
    expect(siem?.mandatory).toBe(true);
    expect(siem?.mandatedBy).toContain('pci-dss-4.0');
  });

  it('marks nothing mandatory when no framework was selected', () => {
    const { rankings } = buildPortfolio(
      buildInputs({ products: [product('siem-a', 'siem', 100_000)], frameworks: [] }),
    );
    expect(rankings.every((entry) => !entry.mandatory)).toBe(true);
  });
});

describe('step 7 — the budget that cannot buy compliance', () => {
  it('reports a shortfall rather than silently dropping a mandatory category', () => {
    // A SIEM costing 500 against a cap of 100. The bundle must not pretend.
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [product('siem-a', 'siem', 50_000_000)],
        frameworks: [pciMandatingSiem],
        annualCap: 10_000_00,
      }),
    );

    expect(recommended.unfundedMandatory).toContain('siem');
    expect(recommended.annualShortfall).not.toBeNull();
    expect(recommended.minimumViableAnnual).not.toBeNull();
    expect(recommended.rationale.join(' ')).toContain('SHORTFALL');
    expect(recommended.rationale.join(' ')).toContain('does not meet');
  });

  it('states the minimum viable annual budget', () => {
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [product('siem-a', 'siem', 50_000_000)],
        frameworks: [pciMandatingSiem],
        annualCap: 10_000_00,
      }),
    );
    expect(recommended.minimumViableAnnual?.amountMinor).toBeGreaterThan(0);
  });

  it('funds the mandatory category when the budget does stretch', () => {
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [product('siem-a', 'siem', 100_000)],
        frameworks: [pciMandatingSiem],
        annualCap: 500_000_00,
      }),
    );
    expect(recommended.unfundedMandatory).toEqual([]);
    expect(recommended.selections.map((s) => s.category)).toContain('siem');
  });

  it('does not let a framework mandate a category the estate has nothing for', () => {
    // No candidate products at all for the mandated category: it is reported as
    // unfunded rather than silently satisfied.
    const { recommended } = buildPortfolio(
      buildInputs({ products: [product('edr-a', 'edr', 100_000)], frameworks: [pciMandatingSiem] }),
    );
    expect(recommended.unfundedMandatory).toContain('siem');
  });
});

describe('steps 3 and 4 — selection', () => {
  it('picks exactly one product per category', () => {
    const inputs = buildInputs({
      products: [
        product('siem-a', 'siem', 100_000),
        product('siem-b', 'siem', 200_000),
        product('edr-a', 'edr', 100_000),
      ],
    });
    const { recommended } = buildPortfolio(inputs);
    const categories = recommended.selections.map((selection) => selection.category);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('applies a suite discount to a second product from the same vendor', () => {
    const inputs = buildInputs({
      products: [
        product('siem-a', 'siem', 1_000_000, 'Acme'),
        product('edr-a', 'edr', 1_000_000, 'Acme'),
      ],
    });
    const { recommended } = buildPortfolio(inputs);
    const discounted = recommended.selections.filter((s) => s.suiteDiscountApplied);
    expect(discounted.length).toBeGreaterThan(0);
    expect(discounted[0]?.rationale.join(' ')).toContain('not a quoted discount');
  });

  it('respects the annual cap', () => {
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [
          product('siem-a', 'siem', 10_000_00),
          product('edr-a', 'edr', 10_000_00),
          product('ndr-a', 'ndr', 10_000_00),
        ],
        annualCap: 15_000_00,
      }),
    );
    expect(recommended.withinAnnualCap).toBe(true);
    // The cap constrains procurement spend, not total cost: salary is not
    // procurement, and charging it to the purchase order priced open source out
    // of every budget. Total cost including people is asserted separately.
    expect(recommended.annualSpend.amountMinor).toBeLessThanOrEqual(15_000_00);
    expect(recommended.annualRecurring.amountMinor).toBeGreaterThanOrEqual(
      recommended.annualSpend.amountMinor,
    );
  });
});

describe('step 5 — the three bundles', () => {
  const products = [
    product('siem-a', 'siem', 10_000_00),
    product('edr-a', 'edr', 10_000_00),
    product('ndr-a', 'ndr', 10_000_00),
    product('backup-a', 'backup', 10_000_00),
  ];

  it('ideal ignores the budget and is at least as large as recommended', () => {
    const { recommended, ideal } = buildPortfolio(buildInputs({ products, annualCap: 15_000_00 }));
    expect(ideal.selections.length).toBeGreaterThanOrEqual(recommended.selections.length);
    expect(ideal.annualRecurring.amountMinor).toBeGreaterThanOrEqual(
      recommended.annualRecurring.amountMinor,
    );
  });

  it('essential is no larger than recommended', () => {
    const { essential, recommended } = buildPortfolio(buildInputs({ products }));
    expect(essential.selections.length).toBeLessThanOrEqual(recommended.selections.length);
  });

  it('explains what each bundle is', () => {
    const portfolio = buildPortfolio(buildInputs({ products }));
    expect(portfolio.essential.rationale.join(' ')).toContain('minimum-defensible');
    expect(portfolio.recommended.rationale.join(' ')).toContain('best value density');
    expect(portfolio.ideal.rationale.join(' ')).toContain('quantify the gap');
  });

  it('warns when a bundle needs more people than the client has', () => {
    const heavy = [
      { ...product('siem-a', 'siem', 100_000), opsBurden: { baseFte: 2, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const } },
      { ...product('edr-a', 'edr', 100_000), opsBurden: { baseFte: 2, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const } },
    ];
    const { ideal } = buildPortfolio(buildInputs({ products: heavy, securityStaffFte: 1 }));
    expect(ideal.rationale.join(' ')).toContain('more people than the client has');
  });
});

describe('step 6 — the MSSP alternative', () => {
  it('costs the managed option from the rate card', () => {
    const inputs = buildInputs({ products: [product('siem-a', 'siem', 100_000)] });
    const alternative = msspAlternative(inputs);
    expect(alternative.annual.amountMinor).toBeGreaterThan(0);
    expect(alternative.annual.amountMinor).toBe(alternative.monthly.amountMinor * 12);
  });

  it('applies the rate card minimum to a tiny estate', () => {
    const inputs = buildInputs({
      products: [product('siem-a', 'siem', 100_000)],
      inventory: inventory({ windowsServers: 1 }),
    });
    const alternative = msspAlternative(inputs);
    expect(alternative.rationale.join(' ')).toContain('minimum');
  });

  it('always says the rate card is an estimate, never a quote', () => {
    const inputs = buildInputs({ products: [product('siem-a', 'siem', 100_000)] });
    expect(msspAlternative(inputs).rationale.join(' ')).toContain('not a quote');
  });

  it('attaches an alternative to every bundle', () => {
    const portfolio = buildPortfolio(buildInputs({ products: [product('siem-a', 'siem', 100_000)] }));
    for (const bundle of [portfolio.essential, portfolio.recommended, portfolio.ideal]) {
      expect(bundle.mssp.annual.amountMinor).toBeGreaterThan(0);
    }
  });
});

describe('determinism', () => {
  it('gives an identical portfolio for the same input twice', () => {
    const products = [
      product('siem-a', 'siem', 10_000_00),
      product('edr-a', 'edr', 10_000_00),
    ];
    expect(buildPortfolio(buildInputs({ products }))).toEqual(
      buildPortfolio(buildInputs({ products })),
    );
  });

  it('gives every selection a rationale (hard rule 5)', () => {
    const { recommended } = buildPortfolio(
      buildInputs({ products: [product('siem-a', 'siem', 100_000)] }),
    );
    for (const selection of recommended.selections) {
      expect(selection.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe('regressions', () => {
  it('applies the suite discount to TCO, not just the annual figure', () => {
    // Was: annualRecurring carried the discount and tco did not, so two fields
    // in the same selection disagreed about the same product — and the wrong
    // one was the headline number.
    const inputs = buildInputs({
      products: [
        product('siem-a', 'siem', 10_000_00, 'Acme'),
        product('edr-a', 'edr', 10_000_00, 'Acme'),
      ],
    });
    const { recommended } = buildPortfolio(inputs);

    const discounted = recommended.selections.find((s) => s.suiteDiscountApplied);
    expect(discounted).toBeDefined();

    const undiscountedTco = inputs.costs.get(discounted!.productId)!.tco.amountMinor;
    expect(discounted!.tco.amountMinor).toBeLessThan(undiscountedTco);

    // And the bundle total must reflect it too.
    const full = recommended.selections.find((s) => !s.suiteDiscountApplied)!;
    expect(recommended.tco.amountMinor).toBeLessThan(full.tco.amountMinor * 2);
  });

  it('surfaces a mandated category the estate has nothing for, instead of dropping it', () => {
    // Was: mandatory required `applicable`, so a framework demand against an
    // absent surface vanished with no output at all — the exact failure step 7
    // exists to prevent.
    const inputs = buildInputs({
      products: [product('siem-a', 'siem', 100_000)],
      frameworks: [pciMandatingSiem],
    });
    // Make siem inapplicable by giving the estate nothing siem can act on.
    const stripped: PortfolioInputs = {
      ...inputs,
      relevance: inputs.relevance.map((entry) =>
        entry.category === 'siem'
          ? { ...entry, applicable: false, weight: 0, estateMultiplier: 0 }
          : entry,
      ),
    };

    const { rankings, recommended } = buildPortfolio(stripped);
    const siem = rankings.find((entry) => entry.category === 'siem');
    expect(siem?.mandatory).toBe(false);
    expect(siem?.mandatedButNotApplicable).toBe(true);
    expect(recommended.rationale.join(' ')).toContain('SCOPE QUESTION');
  });

  it('flags the minimum viable budget as a lower bound when a mandatory category has no product', () => {
    // Was: a mandatory category with no candidate contributed zero, so the
    // "minimum viable budget" could be quoted below what buys compliance.
    const { recommended } = buildPortfolio(
      buildInputs({ products: [product('edr-a', 'edr', 100_000)], frameworks: [pciMandatingSiem] }),
    );
    expect(recommended.rationale.join(' ')).toContain('LOWER BOUND');
  });

  it('does not claim the budget is tight when there is no budget cap', () => {
    const { essential } = buildPortfolio(
      buildInputs({ products: [product('siem-a', 'siem', 100_000)], annualCap: null }),
    );
    expect(essential.selections.length).toBeGreaterThan(0);
    expect(essential.selections.map((s) => s.rationale.join(' ')).join(' ')).not.toContain(
      'budget is tight',
    );
  });

  it('gives a different managed alternative per bundle, with the residual named', () => {
    // Was: msspAlternative ignored the bundle, so Essential and Ideal quoted
    // identically and the build-vs-buy comparison could not be right for both.
    // backup is not covered at the mdr service level, so it must show as residual.
    const inputs = buildInputs({
      products: [
        product('siem-a', 'siem', 10_000_00),
        product('backup-a', 'backup', 10_000_00),
      ],
    });
    const { ideal } = buildPortfolio(inputs);

    expect(ideal.mssp.coversCategories).toContain('siem');
    expect(ideal.mssp.uncoveredCategories).toContain('backup');
    expect(ideal.mssp.residualAnnual.amountMinor).toBeGreaterThan(0);
    expect(ideal.mssp.totalAnnual.amountMinor).toBe(
      ideal.mssp.annual.amountMinor + ideal.mssp.residualAnnual.amountMinor,
    );
    expect(ideal.mssp.rationale.join(' ')).toContain('Does NOT cover');
  });

  it('quotes an empty bundle no residual', () => {
    const inputs = buildInputs({ products: [] });
    const { recommended } = buildPortfolio(inputs);
    expect(recommended.selections).toEqual([]);
    expect(recommended.mssp.residualAnnual.amountMinor).toBe(0);
  });
});
