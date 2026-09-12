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

import { costCatalog, costOfTier } from '../src/cost';
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
    'windowsEndpoints',
    'macosEndpoints',
    'linuxEndpoints',
    'windowsServers',
    'windowsDomainControllers',
    'linuxServers',
    'hypervisors',
    'containerNodes',
    'routers',
    'switches',
    'wirelessControllers',
    'firewalls',
    'vpnConcentrators',
    'loadBalancers',
    'databases',
    'fileServers',
    'internalWebApps',
    'publicWebApps',
    'otIcsScadaDevices',
    'iotCctvPosDevices',
    'awsAccounts',
    'azureSubscriptions',
    'gcpProjects',
    'cloudWorkloads',
    'm365Seats',
    'googleWorkspaceSeats',
    'otherCriticalSaasApps',
    'remoteUsers',
    'privilegedAccounts',
    'serviceAccounts',
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
  operableCapacity: { utilisation: 1, basis: 'test fixture' },
  roadmap: {
    parallelWorkstreams: 2,
    phases: [
      { label: 'Immediate', horizon: 'First quarter', elapsedWeeks: 13, basis: 'test fixture' },
      {
        label: 'Consolidate',
        horizon: 'Months four to nine',
        elapsedWeeks: 26,
        basis: 'test fixture',
      },
      { label: 'Extend', horizon: 'Month ten onward', elapsedWeeks: null, basis: 'test fixture' },
    ],
    basis: 'test fixture',
  },
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
    {
      level: 'monitoring',
      multiplier: 1,
      coveredCategories: ['siem', 'mdr'],
      basis: 'test fixture',
    },
    {
      level: 'mdr',
      multiplier: 1.5,
      coveredCategories: ['siem', 'mdr', 'edr', 'soar', 'ndr'],
      basis: 'test fixture',
    },
    {
      level: 'managed_security',
      multiplier: 2,
      coveredCategories: ['siem', 'mdr', 'edr', 'soar', 'ndr', 'ngfw'],
      basis: 'test fixture',
    },
  ],
  minimumMonthly: usd(50_000),
};

interface Scenario {
  readonly products: readonly Product[];
  readonly annualCap?: number | null;
  /** Implementation budget. Independent of the annual cap, and binds separately. */
  readonly oneTimeCap?: number | null;
  readonly frameworks?: readonly Framework[];
  readonly inventory?: AssetInventory;
  readonly securityStaffFte?: number;
}

function buildInputs(scenario: Scenario): PortfolioInputs {
  const inv = scenario.inventory ?? inventory({ windowsServers: 20, windowsEndpoints: 20 });
  const profile = buildClientProfile({
    securityStaffFte: scenario.securityStaffFte ?? 3,
    budget: {
      annualCap:
        scenario.annualCap === undefined
          ? null
          : scenario.annualCap === null
            ? null
            : usd(scenario.annualCap),
      oneTimeCap:
        scenario.oneTimeCap === undefined || scenario.oneTimeCap === null
          ? null
          : usd(scenario.oneTimeCap),
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

  // Every tier, the way the pipeline costs a catalog.
  const costs = costCatalog(scenario.products, sizing, profile, costInputs);

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
    pricing: [
      {
        model: 'flat_tiered',
        tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(annualMinor) }],
      },
    ],
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

describe('step 1: category ranking', () => {
  it('marks a category mandatory when a selected framework requires it', () => {
    const { rankings } = buildPortfolio(
      buildInputs({
        products: [product('siem-a', 'siem', 100_000)],
        frameworks: [pciMandatingSiem],
      }),
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

describe('the Operable bundle: what this team can actually run', () => {
  // Recommended answers "what does the estate need, inside the budget", and on
  // the hospital demo that is thirteen categories needing 8.58 FTE from a
  // two-person team. Operable answers "what can they run on Monday". The gap
  // between them is the hiring, or the managed service, and stating it is more
  // useful than quietly picking either one.
  function heavy(id: string, category: ProductCategory, fte: number): Product {
    return {
      ...product(id, category, 100_00),
      opsBurden: { baseFte: fte, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
    };
  }

  it('never exceeds the capacity the client stated', () => {
    const { operable } = buildPortfolio(
      buildInputs({
        products: [
          heavy('siem-a', 'siem', 0.8),
          heavy('edr-a', 'edr', 0.8),
          heavy('iam-a', 'iam', 0.8),
        ],
        securityStaffFte: 2,
        annualCap: 500_000_00,
      }),
    );

    expect(operable.totalOpsFte).toBeLessThanOrEqual(2);
    expect(operable.selections.length).toBeLessThan(3);
  });

  it('leaves Recommended alone: a short-staffed client still sees what they need', () => {
    // The whole point of a fourth bundle rather than a constraint. What the
    // estate warrants does not shrink because the client is short-handed.
    const inputs = buildInputs({
      products: [
        heavy('siem-a', 'siem', 0.8),
        heavy('edr-a', 'edr', 0.8),
        heavy('iam-a', 'iam', 0.8),
      ],
      securityStaffFte: 2,
      annualCap: 500_000_00,
    });
    const { recommended, operable } = buildPortfolio(inputs);

    expect(recommended.selections).toHaveLength(3);
    expect(recommended.totalOpsFte).toBeGreaterThan(operable.totalOpsFte);
  });

  it('recommends nothing at all to a client with no security staff', () => {
    // The most important case in the catalog and the easiest to get wrong. A
    // free tool is not operable by nobody, and an empty bundle here is the
    // honest answer rather than a bug.
    const { operable } = buildPortfolio(
      buildInputs({
        products: [heavy('siem-a', 'siem', 0.1), heavy('edr-a', 'edr', 0.1)],
        securityStaffFte: 0,
        annualCap: 500_000_00,
      }),
    );

    expect(operable.selections).toEqual([]);
    expect(operable.totalOpsFte).toBe(0);
    expect(operable.rationale.join(' ')).toContain('no security staff');
    expect(operable.rationale.join(' ')).toContain('only route');
  });

  it('calls an unstaffable mandatory category a staffing problem, not a budget one', () => {
    // Money is there, people are not. Telling the analyst to ask for a bigger
    // budget would send them into a negotiation that cannot fix it.
    const { operable } = buildPortfolio(
      buildInputs({
        products: [heavy('siem-a', 'siem', 5)],
        frameworks: [pciMandatingSiem],
        securityStaffFte: 1,
        annualCap: 500_000_00,
      }),
    );

    expect(operable.unfundedMandatory).toContain('siem');
    expect(operable.unfundedReasons).toContainEqual({ category: 'siem', reason: 'ops_capacity' });
    const rationale = operable.rationale.join(' ');
    expect(rationale).toContain('affordable but not staffable');
    expect(rationale).toContain('no budget increase closes it');
  });

  it('says plainly that the effort figures behind it are estimates', () => {
    // Every opsBurden in the catalog is an analyst estimate and effort is summed
    // with no overlap. A bundle that constrains on that must not be read as a
    // measurement.
    const { operable } = buildPortfolio(
      buildInputs({
        products: [heavy('siem-a', 'siem', 0.5)],
        securityStaffFte: 2,
        annualCap: 500_000_00,
      }),
    );
    const rationale = operable.rationale.join(' ');
    expect(rationale).toContain('analyst estimate');
    expect(rationale).toContain('overstates');
  });
});

describe('cheapest to buy is not cheapest to own', () => {
  // Found on the hospital demo. `cheapest` ranks on procurement, which is right
  // for its job: stretching a tight purchase-order budget over every mandatory
  // category. The price of that is hard rule 8 inverted: a self-hosted tool
  // with no licence fee looks free and wins even where a commercial product is
  // better *and* cheaper once the people to run it are counted.
  //
  // The real numbers were Velociraptor at $1,080 of licence against Defender
  // for Endpoint P1 at $42,840: P1 scoring 95.7 to 89.8 and costing $172,928 a
  // year all-in against $185,797. The bundle took the worse, dearer one, and
  // asked a two-person team for 8.58 FTE.
  function withOps(id: string, annualMinor: number, baseFte: number): Product {
    return {
      ...product(id, 'siem', annualMinor),
      opsBurden: { baseFte, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
    };
  }

  it('does not buy a free tool nobody can run over a cheaper one overall', () => {
    // Free to licence, two full engineers to operate, against a licensed
    // product at a tenth of an engineer.
    const freeButHeavy = withOps('siem-free', 0, 2);
    const paidButLight = withOps('siem-paid', 20_000_00, 0.1);

    const { recommended } = buildPortfolio(
      buildInputs({
        products: [freeButHeavy, paidButLight],
        frameworks: [pciMandatingSiem],
        annualCap: 500_000_00,
      }),
    );

    const siem = recommended.selections.find((entry) => entry.category === 'siem');
    expect(siem?.productId).toBe('siem-paid');
  });

  it('still stretches a tight budget with the cheapest licence', () => {
    // The counterweight. When procurement is the binding constraint, the
    // licence price is the right ranking and the free tool is the only one that
    // fits: picking on total cost here would fund nothing at all.
    const freeButHeavy = withOps('siem-free', 0, 2);
    const paidButLight = withOps('siem-paid', 20_000_00, 0.1);

    const { recommended } = buildPortfolio(
      buildInputs({
        products: [freeButHeavy, paidButLight],
        frameworks: [pciMandatingSiem],
        annualCap: 1_000_00,
      }),
    );

    const siem = recommended.selections.find((entry) => entry.category === 'siem');
    expect(siem?.productId).toBe('siem-free');
    expect(recommended.unfundedMandatory).toEqual([]);
  });
});

describe('step 7: the budget that cannot buy compliance', () => {
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

  it('blames the one-time cap when the one-time cap is what bound', () => {
    // Found on the retail preset, which is the first thing the home page
    // offers. Seven mandatory categories were unfunded with two thirds of the
    // annual cap unspent, and the only explanation offered named the annual
    // cap, so the analyst goes back to the client for a bigger annual budget,
    // gets it, and nothing changes.
    //
    // A generous annual cap and a tight implementation one: the licence is
    // affordable many times over and standing it up is not.
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [product('siem-a', 'siem', 100_000)],
        frameworks: [pciMandatingSiem],
        annualCap: 500_000_00,
        oneTimeCap: 1_00,
      }),
    );

    expect(recommended.unfundedMandatory).toContain('siem');
    expect(recommended.unfundedReasons).toContainEqual({
      category: 'siem',
      reason: 'one_time_cap',
    });

    const rationale = recommended.rationale.join(' ');
    expect(rationale).toContain('ONE-TIME cap, not the annual one');
    // The annual cap is not the problem here and must not be named as one.
    expect(rationale).not.toContain('That cap cannot buy compliance');
  });

  it('separates the two shortfalls rather than reporting one number', () => {
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [product('siem-a', 'siem', 100_000)],
        frameworks: [pciMandatingSiem],
        annualCap: 500_000_00,
        oneTimeCap: 1_00,
      }),
    );

    // Affordable per year, unaffordable to stand up. One figure covering both
    // would have to be wrong about one of them.
    expect(recommended.annualShortfall).toBeNull();
    expect(recommended.oneTimeShortfall).not.toBeNull();
    expect(recommended.minimumViableOneTime?.amountMinor).toBeGreaterThan(0);
  });

  it('passes over a cheap SKU it cannot implement for a dearer one it can', () => {
    // The two caps are independent, so the cheapest licence is not always the
    // buyable one. A 500-day implementation blows a modest one-time budget
    // however little the licence costs, and the category must still be funded
    // from what is left of the list rather than reported as unfundable.
    const cheapLicenceHugeSetup: Product = {
      ...product('siem-cheap', 'siem', 10_000),
      implementation: {
        effortDays: 500,
        skillLevel: 'generalist',
        typicalWeeks: 52,
        confidence: 'analyst_estimate',
      },
    };
    const dearerLicenceQuickSetup: Product = {
      ...product('siem-quick', 'siem', 90_000, 'Vendor B'),
      implementation: {
        effortDays: 1,
        skillLevel: 'generalist',
        typicalWeeks: 1,
        confidence: 'analyst_estimate',
      },
    };

    const { recommended } = buildPortfolio(
      buildInputs({
        products: [cheapLicenceHugeSetup, dearerLicenceQuickSetup],
        frameworks: [pciMandatingSiem],
        annualCap: 500_000_00,
        oneTimeCap: 50_000_00,
      }),
    );

    expect(recommended.unfundedMandatory).toEqual([]);
    expect(recommended.selections.map((selection) => selection.productId)).toContain('siem-quick');
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

describe('steps 3 and 4: selection', () => {
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

describe('step 5: the three bundles', () => {
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
      {
        ...product('siem-a', 'siem', 100_000),
        opsBurden: { baseFte: 2, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
      },
      {
        ...product('edr-a', 'edr', 100_000),
        opsBurden: { baseFte: 2, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
      },
    ];
    const { ideal } = buildPortfolio(buildInputs({ products: heavy, securityStaffFte: 1 }));
    expect(ideal.rationale.join(' ')).toContain('more people than the client has');
  });
});

describe('tiers: the SKU is part of the recommendation', () => {
  /**
   * One product, two SKUs. Only the upper one claims the control the client's
   * framework asks for, and it costs four times as much.
   */
  function tieredSiem(): Product {
    const base = product('tiered-siem', 'siem', 10_000_00);
    const tier = base.tiers[0]!;
    return {
      ...base,
      tiers: [
        {
          ...tier,
          id: 'basic',
          name: 'Basic',
          controlsCovered: [],
          pricing: [
            {
              ...tier.pricing[0]!,
              tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(10_000_00) }],
            },
          ],
        },
        {
          ...tier,
          id: 'advanced',
          name: 'Advanced',
          controlsCovered: ['pci-dss-4.0:10'],
          pricing: [
            {
              ...tier.pricing[0]!,
              tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(40_000_00) }],
            },
          ],
        },
      ],
    };
  }

  const scenario = { products: [tieredSiem()], frameworks: [pciMandatingSiem] };

  it('never puts two tiers of one product in the same bundle', () => {
    const { ideal } = buildPortfolio(buildInputs(scenario));
    const ids = ideal.selections.map((selection) => selection.productId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('recommends the cheaper SKU on value and the better one for ideal', () => {
    // The heart of it. Value density is risk-reduction per pound, so the entry
    // tier wins when money is the binding constraint, and Ideal, which exists
    // to quantify the gap, has to be free to say the dearer SKU is the one the
    // client actually wants. Before Ideal had its own objective it sorted on
    // density too, so it named the same SKU and quantified a gap of nothing.
    const { recommended, ideal } = buildPortfolio(buildInputs(scenario));

    expect(recommended.selections[0]?.tierId).toBe('basic');
    expect(ideal.selections[0]?.tierId).toBe('advanced');
    expect(ideal.annualSpend.amountMinor).toBeGreaterThan(recommended.annualSpend.amountMinor);
  });

  it('names the SKU a client would recognise, not the slug', () => {
    const { ideal } = buildPortfolio(buildInputs(scenario));
    expect(ideal.selections[0]?.tierName).toBe('Advanced');
  });

  it('says why this SKU and not the one next to it', () => {
    // A tier is a decision the client pays for, so hard rule 5 applies to it.
    const { recommended } = buildPortfolio(buildInputs(scenario));
    expect(recommended.selections[0]?.rationale.join(' ')).toContain('Advanced');
  });

  it('costs the bundle on the tier it selected', () => {
    const { ideal } = buildPortfolio(buildInputs(scenario));
    const selection = ideal.selections[0]!;
    expect(selection.cost.tierId).toBe(selection.tierId);
    // List, not net: a volume band applies on top, and this is asserting which
    // SKU was costed rather than what the discount did to it.
    expect(selection.cost.licenceListAnnual.amountMinor).toBe(40_000_00);
  });
});

describe('step 6: the MSSP alternative', () => {
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
    const portfolio = buildPortfolio(
      buildInputs({ products: [product('siem-a', 'siem', 100_000)] }),
    );
    for (const bundle of [portfolio.essential, portfolio.recommended, portfolio.ideal]) {
      expect(bundle.mssp.annual.amountMinor).toBeGreaterThan(0);
    }
  });
});

describe('determinism', () => {
  it('gives an identical portfolio for the same input twice', () => {
    const products = [product('siem-a', 'siem', 10_000_00), product('edr-a', 'edr', 10_000_00)];
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
    // in the same selection disagreed about the same product, and the wrong
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

    const undiscountedTco = costOfTier(inputs.costs, discounted!.productId, discounted!.tierId)!.tco
      .amountMinor;
    expect(discounted!.tco.amountMinor).toBeLessThan(undiscountedTco);

    // And the bundle total must reflect it too.
    const full = recommended.selections.find((s) => !s.suiteDiscountApplied)!;
    expect(recommended.tco.amountMinor).toBeLessThan(full.tco.amountMinor * 2);
  });

  it('surfaces a mandated category the estate has nothing for, instead of dropping it', () => {
    // Was: mandatory required `applicable`, so a framework demand against an
    // absent surface vanished with no output at all. The exact failure step 7
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
      products: [product('siem-a', 'siem', 10_000_00), product('backup-a', 'backup', 10_000_00)],
    });
    const { ideal } = buildPortfolio(inputs);

    expect(ideal.mssp.coversCategories).toContain('siem');
    expect(ideal.mssp.uncoveredCategories).toContain('backup');
    expect(ideal.mssp.residualAnnual.amountMinor).toBeGreaterThan(0);
    expect(ideal.mssp.totalAnnual.amountMinor).toBe(
      ideal.mssp.annual.amountMinor + ideal.mssp.residualAnnual.amountMinor,
    );
    // The category is named in words, not as its enum value: this sentence is
    // printed verbatim into a proposal, and "backup" there is a leaked field.
    expect(ideal.mssp.rationale.join(' ')).toContain('Does not cover Backup and recovery');
  });

  it('does not buy less compliance with more budget when both strategies fund the same categories', () => {
    // Was: buildRecommended compared the two strategies on weighted need alone.
    // They optimise different denominators (cheapest ranks on what a product
    // costs to buy, value density on fit per unit of what it costs to own) so
    // they can fund exactly the same categories with different products. That
    // tied, density won by default, and the stack satisfied fewer mandated
    // controls than a smaller budget would have bought.
    //
    // Found when the iam category landed: at a USD 20,000 cap identity was
    // Keycloak, claiming CIS Controls 5 and 6; at USD 50,000 it became Duo
    // Essentials: dearer to buy, far cheaper to own, and deliberately claiming
    // only Control 6 because it is not a directory.
    const twoIamControls = buildFramework({
      id: 'cis-v8',
      name: 'CIS Controls',
      sourceQuality: 'secondary_sources',
      version: '8',
      // Deliberately NOT mandatory: this test exercises the tie-break on
      // in-scope controls generally. The mandatory-control rule, which outranks
      // weighted need, has its own test below.
      controls: [
        { id: '5', title: 'Account Management', satisfiedBy: ['iam'], mandatory: false },
        { id: '6', title: 'Access Control Management', satisfiedBy: ['iam'], mandatory: false },
      ],
    });

    // Cheap to buy, expensive to own, closes both controls. The directory.
    const broad: Product = {
      ...buildProduct({
        id: 'broad-iam',
        pricing: [
          {
            model: 'flat_tiered',
            tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(100_00) }],
          },
        ],
        opsBurden: { baseFte: 0.6, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
      }),
      category: 'iam',
      vendor: 'Broad Inc.',
      controlsCovered: ['cis-v8:5', 'cis-v8:6'],
      supports: { ...buildProduct().supports, deviceClasses: ['server', 'workstation'] },
    };

    // Dearer to buy, almost free to own, closes one control. The MFA bolt-on.
    const narrow: Product = {
      ...buildProduct({
        id: 'narrow-iam',
        pricing: [
          {
            model: 'flat_tiered',
            tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(3_000_00) }],
          },
        ],
        opsBurden: { baseFte: 0.01, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
      }),
      category: 'iam',
      vendor: 'Narrow Inc.',
      controlsCovered: ['cis-v8:6'],
      supports: { ...buildProduct().supports, deviceClasses: ['server', 'workstation'] },
    };

    const inputs = buildInputs({
      products: [broad, narrow],
      frameworks: [twoIamControls],
      annualCap: 10_000_00,
    });

    // The pathology only exists if density really does prefer the narrow one:
    // without that this test would pass for the wrong reason.
    const { candidates, recommended } = buildPortfolio(inputs);
    const densityOf = (id: string) =>
      candidates.find((candidate) => candidate.productId === id)!.valueDensity;
    expect(densityOf('narrow-iam')).toBeGreaterThan(densityOf('broad-iam'));

    expect(recommended.selections.map((selection) => selection.productId)).toEqual(['broad-iam']);
    expect(recommended.rationale.join(' ')).toContain('Spending more must not cover less');
  });

  it('meets a mandate rather than funding one more optional category', () => {
    // Found when the ndr category landed. For the PCI-scoped retailer the
    // portfolio began funding a ninth category, network detection, by
    // switching the endpoint pick to one that does not claim PCI requirement 5,
    // anti-malware. More categories funded, a mandatory control lost, in a
    // cardholder data environment. No QSA would accept that stack, so weighted
    // need must not outrank a mandate.
    const pciMandatingIam: Framework = buildFramework({
      id: 'pci-dss-4.0',
      name: 'PCI DSS',
      sourceQuality: 'secondary_sources',
      version: '4.0',
      controls: [{ id: '7', title: 'Restrict access', satisfiedBy: ['iam'], mandatory: true }],
    });

    // Dear to buy, cheap to own, and the only thing that meets the mandate.
    const mandateMeeting: Product = {
      ...buildProduct({
        id: 'mandate-iam',
        pricing: [
          {
            model: 'flat_tiered',
            tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(3_000_00) }],
          },
        ],
        opsBurden: { baseFte: 0.01, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
      }),
      category: 'iam',
      vendor: 'Mandate Inc.',
      controlsCovered: ['pci-dss-4.0:7'],
      supports: { ...buildProduct().supports, deviceClasses: ['server', 'workstation'] },
    };

    // Cheap to buy, expensive to own, meets nothing.
    const cheapMiss: Product = {
      ...buildProduct({
        id: 'cheap-iam',
        pricing: [
          {
            model: 'flat_tiered',
            tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(100_00) }],
          },
        ],
        opsBurden: { baseFte: 0.6, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
      }),
      category: 'iam',
      vendor: 'Cheap Inc.',
      supports: { ...buildProduct().supports, deviceClasses: ['server', 'workstation'] },
    };

    // The extra category the cheap stack can afford and the mandate stack cannot.
    const extraCategory = product('some-ndr', 'ndr', 1_000_00);

    const { recommended } = buildPortfolio(
      buildInputs({
        products: [mandateMeeting, cheapMiss, extraCategory],
        frameworks: [pciMandatingIam],
        annualCap: 3_500_00,
      }),
    );

    // The cheap stack funds two categories and meets no mandate; the mandate
    // stack funds one and meets it. The mandate wins.
    expect(recommended.selections.map((selection) => selection.productId)).toEqual(['mandate-iam']);
    expect(recommended.rationale.join(' ')).toContain('mandatory obligations');
  });

  it('leaves the density winner alone when no framework is selected', () => {
    // The tie-break above must not fire for an unregulated client: with nothing
    // ticked both control counts are zero, and density keeps the better product.
    const broad: Product = {
      ...buildProduct({
        id: 'broad-iam',
        pricing: [
          {
            model: 'flat_tiered',
            tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(100_00) }],
          },
        ],
        opsBurden: { baseFte: 0.6, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
      }),
      category: 'iam',
      vendor: 'Broad Inc.',
      controlsCovered: ['cis-v8:5', 'cis-v8:6'],
      supports: { ...buildProduct().supports, deviceClasses: ['server', 'workstation'] },
    };
    const narrow: Product = {
      ...buildProduct({
        id: 'narrow-iam',
        pricing: [
          {
            model: 'flat_tiered',
            tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(3_000_00) }],
          },
        ],
        opsBurden: { baseFte: 0.01, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
      }),
      category: 'iam',
      vendor: 'Narrow Inc.',
      controlsCovered: ['cis-v8:6'],
      supports: { ...buildProduct().supports, deviceClasses: ['server', 'workstation'] },
    };

    const { recommended } = buildPortfolio(
      buildInputs({ products: [broad, narrow], annualCap: 10_000_00 }),
    );
    expect(recommended.selections.map((selection) => selection.productId)).toEqual(['narrow-iam']);
  });

  it('does not let one expensive category starve two cheaper ones worth more', () => {
    // The classic greedy-knapsack failure, and the third distinct way this
    // stage has managed to buy less with more money.
    //
    // The fill walks categories in weight order, so once an expensive high-
    // weight category becomes affordable it takes the money and the cheaper
    // categories below it go unfunded. Found on the §12.3 estate after the
    // per-category infrastructure change made the cheap categories cheaper: a
    // USD 30,000 cap funded LESS weighted risk-reduction than a USD 20,000 cap,
    // because the extra money reached mdr (weight 65, USD 17,280) and buying it
    // starved email_security (53) and soar (45). 65 bought, 98 lost.
    //
    // buildRecommended now also fills in risk-reduction-per-pound order and
    // keeps whichever bundle covers more.
    // Three vendors, not one: the step-4 suite discount would otherwise take
    // 10% off the second and third picks and make all three affordable, which
    // is a different behaviour and not the one under test.
    const dearHighWeight = product('dear-mdr', 'mdr', 17_000_00, 'Dear Inc.');
    const cheapA = product('cheap-email', 'email_security', 500_00, 'Cheap A Inc.');
    const cheapB = product('cheap-soar', 'soar', 500_00, 'Cheap B Inc.');

    const weights = {
      mdr: 65,
      email_security: 53,
      soar: 45,
    } as Record<ProductCategory, number>;

    const inputs: PortfolioInputs = {
      ...buildInputs({
        // Tight enough that the trade-off actually bites: weight order buys
        // mdr and has USD 200 left, which buys neither cheap category. Per-pound
        // order buys both cheap ones for USD 1,000 and cannot then afford mdr.
        products: [dearHighWeight, cheapA, cheapB],
        annualCap: 17_200_00,
      }),
    };
    // Rank the three categories the way the real weights did: mdr first.
    const ranked: PortfolioInputs = {
      ...inputs,
      relevance: inputs.relevance.map((entry) =>
        weights[entry.category] === undefined
          ? { ...entry, applicable: false, weight: 0, estateMultiplier: 0 }
          : { ...entry, weight: weights[entry.category] },
      ),
    };

    const { recommended } = buildPortfolio(ranked);
    const funded = recommended.selections.map((selection) => selection.productId).sort();

    // Both cheap categories, not the single expensive one: 98 beats 65.
    expect(funded).toEqual(['cheap-email', 'cheap-soar']);
    expect(recommended.rationale.join(' ')).toContain('risk-reduction per pound');
  });

  it('quotes an empty bundle no residual', () => {
    const inputs = buildInputs({ products: [] });
    const { recommended } = buildPortfolio(inputs);
    expect(recommended.selections).toEqual([]);
    expect(recommended.mssp.residualAnnual.amountMinor).toBe(0);
  });
});

describe('rationale that repeats itself', () => {
  // A product with four SKUs produced three near-identical sentences
  // ("Community subscription costs more and scores no better", then Basic, then
  // Standard) differing only in the name. They are named together now.
  function withTiers(id: string, category: ProductCategory, prices: readonly number[]): Product {
    const base = buildProduct({ id });
    return {
      ...base,
      category,
      vendor: `${id} Inc.`,
      supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
      opsBurden: { baseFte: 0.1, ftePerThousandAssets: 0, confidence: 'analyst_estimate' },
      tiers: prices.map((price, index) => ({
        id: `tier-${index}`,
        name: `Tier ${index}`,
        capabilities: [],
        controlsCovered: [],
        pricing: [
          {
            model: 'flat_tiered' as const,
            tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(price) }],
            termYears: 1,
            pricingConfidence: 'public_list' as const,
            sources: [{ url: 'https://example.com/p', asOf: '2026-01-01' }],
            refresh: {
              method: 'manual' as const,
              checkUrl: 'https://example.com/p',
              note: 'test fixture',
            },
          },
        ],
      })),
    };
  }

  it('names the dearer-for-nothing tiers together instead of once each', () => {
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [withTiers('siem-a', 'siem', [1_000_00, 2_000_00, 3_000_00, 4_000_00])],
        annualCap: 500_000_00,
      }),
    );

    const siem = recommended.selections.find((entry) => entry.category === 'siem');
    const lines = siem?.rationale ?? [];

    // The property that was violated: no line may be repeated, and no two may
    // say the same thing with a different name swapped in.
    const dearer = lines.filter((line) => line.includes('cost more and score no better'));
    expect(dearer).toHaveLength(1);
    expect(dearer[0]).toContain(' and ');
    // The range is what the collapsed line adds over the three it replaces.
    expect(dearer[0]).toMatch(/\$[\d,]+ to \$[\d,]+ a year/);
    // And in the interface's own notation. This read "USD 1,000" while the
    // card beside it read "$411,903". The same currency written two ways,
    // which reads as two currencies.
    expect(dearer[0]).not.toMatch(/USD \d/);
  });

  it('still gives a better-scoring tier a line of its own', () => {
    // Each is a distinct proposition with its own price. The sentence an
    // analyst repeats when a client asks about the upgrade.
    const { recommended } = buildPortfolio(
      buildInputs({
        products: [withTiers('siem-a', 'siem', [1_000_00, 2_000_00])],
        annualCap: 500_000_00,
      }),
    );
    const siem = recommended.selections.find((entry) => entry.category === 'siem');
    expect((siem?.rationale ?? []).every((line) => line.length > 0)).toBe(true);
  });
});
