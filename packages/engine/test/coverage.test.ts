// Coverage (PROJECT_SPEC §7.5).
//
// The assertions that matter most are about what is *not* claimed: that a
// control no purchase can satisfy stays out of the denominator, and that having
// the right kind of product is reported as partial rather than as coverage.

import type {
  CoverageAssumptions,
  Framework,
  Money,
  Product,
  ProductCategory,
} from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { costCatalog } from '../src/cost';
import { computeCoverage, coverageDisclaimer, type CoverageInputs } from '../src/coverage';
import { computeCategoryRelevance, computeInfrastructureProfile } from '../src/infrastructure';
import type { Bundle, BundleSelection } from '../src/portfolio';
import { scoreProducts } from '../src/scoring';
import { computeSizing } from '../src/sizing';
import {
  buildCategoryWeights,
  buildClientProfile,
  buildCostInputs,
  buildFramework,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures';

const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' });
const zero = usd(0);

const assumptions: CoverageAssumptions = {
  mandatoryControlRisk: 'critical',
  residualRiskBands: [
    { risk: 'high', minCategoryWeight: 85, label: 'essential here' },
    { risk: 'medium', minCategoryWeight: 50, label: 'material here' },
    { risk: 'low', minCategoryWeight: 0, label: 'situational here' },
  ],
  basis: 'test fixture',
};

const inventory = {
  windowsServers: { count: 20 },
  windowsEndpoints: { count: 20 },
  networkVendors: [],
} as never;

/** A priced product, optionally claiming controls. */
function product(
  id: string,
  category: ProductCategory,
  annualMinor: number,
  controlsCovered: readonly string[] = [],
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
    controlsCovered: [...controlsCovered],
    supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    opsBurden: { baseFte: 0.1, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
  };
}

/**
 * A bundle holding exactly these products. Built by hand rather than through
 * `buildPortfolio`, so a coverage assertion fails for coverage reasons only.
 */
function bundleOf(
  selections: readonly { id: string; category: ProductCategory; tierId?: string }[],
): Bundle {
  // Coverage never reads the cost breakdown; it is here because a selection
  // carries the costing it was made on, and a fixture that lied about the
  // shape is how the last fixture bug got in.
  const costShape = {
    productId: 'x',
    tierId: 'standard',
    currency: 'USD' as const,
    licenceListAnnual: zero,
    deployment: {
      mode: 'on_prem' as const,
      selfHosted: true,
      assumed: false,
      rationale: 'test fixture',
    },
    discountRate: 0,
    discountLabel: '',
    licenceAnnual: zero,
    supportAnnual: zero,
    infraAnnual: zero,
    opsFteAnnual: zero,
    opsFte: 0,
    opsBurdenConfidence: 'analyst_estimate' as const,
    implementationConfidence: 'analyst_estimate' as const,
    implementationOneTime: zero,
    trainingOneTime: zero,
    year1: zero,
    annualRecurring: zero,
    procurementAnnual: zero,
    cashflowByYear: [zero],
    tco: zero,
    horizonYears: 3,
    pricingConfidence: 'public_list' as const,
    hasPlaceholderPricing: false,
    freshness: {
      status: 'fresh' as const,
      newestSourceDate: '2026-01-01',
      ageDays: 0,
      maxAgeDays: 90,
      recheckBy: '2026-04-01',
      refreshMethod: 'manual' as const,
      explanation: 'test fixture',
    },
    needsRecheck: false,
    lines: [],
    rationale: [],
  };

  const selection = (entry: {
    id: string;
    category: ProductCategory;
    tierId?: string;
  }): BundleSelection => ({
    category: entry.category,
    productId: entry.id,
    productName: entry.id,
    vendor: 'Example Inc.',
    tierId: entry.tierId ?? 'standard',
    tierName: entry.tierId ?? 'Standard',
    fitScore: 80,
    categoryWeight: 90,
    mandatory: false,
    valueDensity: 1,
    annualRecurring: zero,
    annualSpend: zero,
    oneTime: zero,
    tco: zero,
    suiteDiscountApplied: false,
    cost: { ...costShape, productId: entry.id, tierId: entry.tierId ?? 'standard' },
    rationale: [],
  });

  return {
    kind: 'recommended',
    currency: 'USD',
    selections: selections.map(selection),
    annualRecurring: zero,
    annualSpend: zero,
    oneTime: zero,
    tco: zero,
    totalOpsFte: 0,
    withinAnnualCap: true,
    withinOneTimeCap: true,
    unfundedMandatory: [],
    unfundedReasons: [],
    annualShortfall: null,
    minimumViableAnnual: null,
    oneTimeShortfall: null,
    minimumViableOneTime: null,
    mssp: {
      monthly: zero,
      annual: zero,
      overHorizon: zero,
      serviceLevel: 'monitoring',
      coversCategories: [],
      uncoveredCategories: [],
      residualAnnual: zero,
      totalAnnual: zero,
      buildAnnual: zero,
      rationale: [],
    },
    // Coverage does not read attribution; this is the empty shape so the
    // fixture satisfies `Bundle` without asserting anything about who pays.
    attribution: {
      currency: 'USD',
      bySelection: [],
      clientProcurementAnnual: zero,
      clientOpsAnnual: zero,
      providerFeeAnnual: zero,
      clientTotalAnnual: zero,
      providerOpsAnnual: zero,
      fullBuildAnnual: zero,
      rationale: [],
    },
    rationale: [],
  };
}

interface Scenario {
  readonly catalog: readonly Product[];
  readonly selected: readonly { id: string; category: ProductCategory; tierId?: string }[];
  readonly frameworks: readonly Framework[];
  /** Framework ids the client actually ticked. */
  readonly compliance?: readonly string[];
  readonly excludedProducts?: readonly string[];
  readonly categoryWeightOverrides?: Partial<Record<ProductCategory, number>>;
}

function buildInputs(scenario: Scenario): CoverageInputs {
  const profile = buildClientProfile({
    securityStaffFte: 3,
    compliance: [...(scenario.compliance ?? [])] as never,
    excludedProducts: [...(scenario.excludedProducts ?? [])],
  });
  const sizing = computeSizing(inventory, profile, buildSizingAssumptions());
  const costInputs = buildCostInputs();

  const weights = buildCategoryWeights();
  const overrides = scenario.categoryWeightOverrides ?? {};
  const weighted = {
    ...weights,
    categories: weights.categories.map((category) => ({
      ...category,
      baseRiskReduction: overrides[category.category] ?? category.baseRiskReduction,
    })),
  };

  const costs = costCatalog(scenario.catalog, sizing, profile, costInputs);

  return {
    profile,
    bundle: bundleOf(scenario.selected),
    products: scenario.catalog,
    scores: scoreProducts(scenario.catalog, {
      profile,
      inventory,
      sizing,
      frameworks: scenario.frameworks,
      weights: buildScoringWeights(),
      categoryWeights: weighted,
    }),
    costs,
    frameworks: scenario.frameworks,
    relevance: computeCategoryRelevance(
      computeInfrastructureProfile(inventory, weighted),
      weighted,
    ),
    assumptions,
  };
}

/** Four controls: one claimable, one category-only, one unfunded, one unbuyable. */
const pci = buildFramework({
  id: 'pci-dss-4.0',
  name: 'PCI DSS',
  sourceQuality: 'secondary_sources',
  version: '4.0.1',
  controls: [
    { id: '10', title: 'Log and monitor', satisfiedBy: ['siem'], mandatory: true },
    { id: '11', title: 'Test security', satisfiedBy: ['siem'] },
    { id: '5', title: 'Anti-malware', satisfiedBy: ['edr'], mandatory: true },
    { id: '12', title: 'Policy', satisfiedBy: [] },
  ],
});

describe('the coverage matrix', () => {
  const catalog = [
    product('claiming-siem', 'siem', 500_000, ['pci-dss-4.0:10']),
    product('silent-siem', 'siem', 400_000),
    product('some-edr', 'edr', 300_000, ['pci-dss-4.0:5']),
  ];

  function statusOf(result: ReturnType<typeof computeCoverage>, controlId: string): string {
    const control = result.frameworks[0]!.controls.find((entry) => entry.controlId === controlId);
    return control?.status ?? 'missing';
  }

  it('counts a control as covered only when a selected product claims it', () => {
    const result = computeCoverage(
      buildInputs({
        catalog,
        selected: [{ id: 'claiming-siem', category: 'siem' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    expect(statusOf(result, 'pci-dss-4.0:10')).toBe('covered');
    expect(result.frameworks[0]!.controls[0]!.coveredBy).toEqual(['claiming-siem']);
  });

  it('reports the right kind of product with no claim as partial, not covered', () => {
    const result = computeCoverage(
      buildInputs({
        catalog,
        selected: [{ id: 'silent-siem', category: 'siem' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    // Requirement 10 maps to siem, and a siem is in the stack, but this one
    // does not claim it. That is a prompt to check, not a coverage claim.
    expect(statusOf(result, 'pci-dss-4.0:10')).toBe('partial');
    expect(result.frameworks[0]!.coveredControls).toBe(0);
    expect(result.summary.partialControls).toBe(2);
    expect(result.rationale.join(' ')).toContain('partial');
  });

  it('keeps a control no purchase can satisfy out of the denominator', () => {
    const result = computeCoverage(
      buildInputs({
        catalog,
        selected: [
          { id: 'claiming-siem', category: 'siem' },
          { id: 'some-edr', category: 'edr' },
        ],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    expect(statusOf(result, 'pci-dss-4.0:12')).toBe('not_addressable');
    // 4 controls, 3 of them buyable, 2 covered: 67%, not 50%. Counting
    // requirement 12 would mark the stack down for not buying a policy.
    expect(result.frameworks[0]!.addressableControls).toBe(3);
    expect(result.frameworks[0]!.coveragePercent).toBe(66.7);
  });

  it('does not let a product claim pull an unbuyable control into the denominator', () => {
    // Requirement 12 is policy: the framework maps it to no category. A product
    // claiming it anyway must not change what the stack is scored out of, or
    // two bundles for the same client would have different denominators and
    // §8.1's side-by-side comparison would mean nothing. The conflict is
    // reported instead.
    const result = computeCoverage(
      buildInputs({
        catalog: [product('claiming-siem', 'siem', 500_000, ['pci-dss-4.0:12'])],
        selected: [{ id: 'claiming-siem', category: 'siem' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    expect(statusOf(result, 'pci-dss-4.0:12')).toBe('not_addressable');
    expect(result.frameworks[0]!.addressableControls).toBe(3);
    const control = result.frameworks[0]!.controls.find(
      (entry) => entry.controlId === 'pci-dss-4.0:12',
    );
    expect(control?.rationale.join(' ')).toContain('One of the two is wrong');
  });

  it('reports a gap when nothing in the bundle addresses the control', () => {
    const result = computeCoverage(
      buildInputs({
        catalog,
        selected: [{ id: 'claiming-siem', category: 'siem' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    expect(statusOf(result, 'pci-dss-4.0:5')).toBe('gap');
    // The gap list also carries partials, which are uncovered for a different
    // reason; this assertion is about the controls nothing addresses at all.
    expect(result.gaps.filter((gap) => gap.kind === 'gap').map((gap) => gap.controlId)).toEqual([
      'pci-dss-4.0:5',
    ]);
  });

  it('says when a framework has no product mappings at all, rather than just 0%', () => {
    // The difference between "this stack does nothing for you" and "nobody has
    // mapped the catalog against this framework yet" is the whole story, and a
    // bare 0% tells the wrong one. Seen for real on a HIPAA scenario: every
    // catalog product claims CIS, NIST and PCI controls and none claims HIPAA.
    const result = computeCoverage(
      buildInputs({
        catalog,
        selected: [{ id: 'silent-siem', category: 'siem' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    expect(result.frameworks[0]!.coveredControls).toBe(0);
    expect(result.frameworks[0]!.partialControls).toBeGreaterThan(0);
    expect(result.frameworks[0]!.rationale.join(' ')).toContain(
      'a mapping this catalog has not been given',
    );
  });

  it('warns when the framework itself is not publisher-verified', () => {
    const result = computeCoverage(
      buildInputs({ catalog, selected: [], frameworks: [pci], compliance: ['pci-dss-4.0'] }),
    );

    // Spelled out, not the enum value: this sentence is printed verbatim into
    // a proposal, and `secondary_sources` there reads as a leaked field.
    expect(result.frameworks[0]!.rationale.join(' ')).toContain('graded secondary sources');
  });

  it('marks a framework the client did not select as a reference view only', () => {
    const result = computeCoverage(
      buildInputs({ catalog, selected: [], frameworks: [pci], compliance: [] }),
    );

    expect(result.frameworks[0]!.inScope).toBe(false);
    expect(result.summary.frameworksInScope).toBe(0);
    expect(result.frameworks[0]!.rationale.join(' ')).toContain('not a compliance position');
  });
});

describe('group roll-up', () => {
  const csf = buildFramework({
    id: 'nist-csf-2.0',
    name: 'NIST CSF',
    version: '2.0',
    groups: [
      { id: 'GV', name: 'Govern' },
      { id: 'DE', name: 'Detect' },
    ],
    controls: [
      { id: 'GV.PO', title: 'Policy', group: 'GV', satisfiedBy: [] },
      { id: 'DE.CM', title: 'Continuous Monitoring', group: 'DE', satisfiedBy: ['siem'] },
      { id: 'DE.AE', title: 'Adverse Event Analysis', group: 'DE', satisfiedBy: ['siem'] },
    ],
  });

  const catalog = [product('claiming-siem', 'siem', 500_000, ['nist-csf-2.0:DE.CM'])];

  it('rolls coverage up to the framework’s own groups', () => {
    const result = computeCoverage(
      buildInputs({
        catalog,
        selected: [{ id: 'claiming-siem', category: 'siem' }],
        frameworks: [csf],
        compliance: ['nist-csf-2.0'],
      }),
    );

    const detect = result.frameworks[0]!.groups.find((group) => group.groupId === 'DE');
    expect(detect?.coveredControls).toBe(1);
    expect(detect?.partialControls).toBe(1);
    expect(detect?.coveragePercent).toBe(50);
  });

  it('reports no percentage for a group nothing can be bought for', () => {
    const result = computeCoverage(
      buildInputs({ catalog, selected: [], frameworks: [csf], compliance: ['nist-csf-2.0'] }),
    );

    const govern = result.frameworks[0]!.groups.find((group) => group.groupId === 'GV');
    expect(govern?.coveragePercent).toBeNull();
    expect(govern?.rationale.join(' ')).toContain('not addressed by purchases');
  });
});

describe('residual risk', () => {
  const catalog = [product('some-edr', 'edr', 300_000, ['pci-dss-4.0:5'])];

  it('grades an unmet mandatory control of a selected framework as critical', () => {
    const result = computeCoverage(
      buildInputs({
        catalog,
        selected: [],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    const mandatory = result.gaps.find((gap) => gap.controlId === 'pci-dss-4.0:10');
    expect(mandatory?.residualRisk).toBe('critical');
    expect(result.rationale.join(' ')).toContain('obligations, not preferences');
  });

  it('does not treat a mandatory control of an unselected framework as an obligation', () => {
    const result = computeCoverage(
      buildInputs({ catalog, selected: [], frameworks: [pci], compliance: [] }),
    );

    expect(result.gaps.find((gap) => gap.controlId === 'pci-dss-4.0:10')?.residualRisk).not.toBe(
      'critical',
    );
  });

  it('bands a non-mandatory gap on what the closing category is worth here', () => {
    const heavy = computeCoverage(
      buildInputs({
        catalog,
        selected: [],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
        categoryWeightOverrides: { siem: 90 },
      }),
    );
    const light = computeCoverage(
      buildInputs({
        catalog,
        selected: [],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
        categoryWeightOverrides: { siem: 20 },
      }),
    );

    expect(heavy.gaps.find((gap) => gap.controlId === 'pci-dss-4.0:11')?.residualRisk).toBe('high');
    expect(light.gaps.find((gap) => gap.controlId === 'pci-dss-4.0:11')?.residualRisk).toBe('low');
  });
});

describe('what it would cost to fix', () => {
  it('prefers a product that claims the control over a cheaper one that does not', () => {
    const result = computeCoverage(
      buildInputs({
        catalog: [
          product('cheap-silent-edr', 'edr', 100_000),
          product('claiming-edr', 'edr', 300_000, ['pci-dss-4.0:5']),
        ],
        selected: [],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    const gap = result.gaps.find((entry) => entry.controlId === 'pci-dss-4.0:5');
    expect(gap?.cheapestCloser?.productId).toBe('claiming-edr');
    expect(gap?.cheapestCloser?.closesFully).toBe(true);
  });

  it('takes the cheapest on procurement spend when both claim the control', () => {
    const result = computeCoverage(
      buildInputs({
        catalog: [
          product('dear-edr', 'edr', 900_000, ['pci-dss-4.0:5']),
          product('cheap-edr', 'edr', 200_000, ['pci-dss-4.0:5']),
        ],
        selected: [],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    expect(
      result.gaps.find((gap) => gap.controlId === 'pci-dss-4.0:5')?.cheapestCloser?.productId,
    ).toBe('cheap-edr');
  });

  it('never offers a product the analyst excluded', () => {
    const result = computeCoverage(
      buildInputs({
        catalog: [
          product('cheap-edr', 'edr', 200_000, ['pci-dss-4.0:5']),
          product('other-edr', 'edr', 800_000, ['pci-dss-4.0:5']),
        ],
        selected: [],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
        excludedProducts: ['cheap-edr'],
      }),
    );

    expect(
      result.gaps.find((gap) => gap.controlId === 'pci-dss-4.0:5')?.cheapestCloser?.productId,
    ).toBe('other-edr');
  });

  it('says so plainly when the catalog cannot close a gap at all', () => {
    const result = computeCoverage(
      buildInputs({
        catalog: [product('claiming-siem', 'siem', 500_000, ['pci-dss-4.0:10'])],
        selected: [{ id: 'claiming-siem', category: 'siem' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    // Control 11 is a partial, the bundle's SIEM is the right kind of tool and
    // claims nothing here, and no product or tier in this catalog claims it
    // either, so it is as unclosable as the one nothing addresses at all.
    expect(result.unclosableGaps).toEqual(['pci-dss-4.0:5', 'pci-dss-4.0:11']);
    expect(result.gaps.every((gap) => gap.cheapestCloser === null)).toBe(true);
    expect(result.rationale.join(' ')).toContain('a gap in StackFit, not in the client');
  });

  it('counts one purchase once, however many controls it closes', () => {
    const twoSiemControls = buildFramework({
      id: 'cis-v8',
      name: 'CIS Controls',
      version: 'v8',
      controls: [
        { id: '8', title: 'Audit Log Management', satisfiedBy: ['siem'] },
        { id: '13', title: 'Network Monitoring', satisfiedBy: ['siem'] },
      ],
    });

    const result = computeCoverage(
      buildInputs({
        catalog: [product('claiming-siem', 'siem', 500_000, ['cis-v8:8', 'cis-v8:13'])],
        selected: [],
        frameworks: [twoSiemControls],
        compliance: ['cis-v8'],
      }),
    );

    expect(result.gaps).toHaveLength(2);
    expect(result.remediation).toHaveLength(1);
    expect(result.remediation[0]!.closesControls).toEqual(['cis-v8:13', 'cis-v8:8']);
    // One licence, not two: the same product closing two controls is one
    // purchase, and the fix total has to say so.
    expect(result.remediationAnnualSpend).toEqual(result.remediation[0]!.annualSpend);
  });

  it('reuses a product already proposed rather than buying a second one', () => {
    const twoCategories = buildFramework({
      id: 'cis-v8',
      name: 'CIS Controls',
      version: 'v8',
      controls: [
        { id: '8', title: 'Audit Log Management', satisfiedBy: ['siem'] },
        { id: '13', title: 'Network Monitoring', satisfiedBy: ['siem', 'ndr'] },
      ],
    });

    const result = computeCoverage(
      buildInputs({
        catalog: [
          product('claiming-siem', 'siem', 500_000, ['cis-v8:8', 'cis-v8:13']),
          product('cheap-ndr', 'ndr', 10_000, ['cis-v8:13']),
        ],
        selected: [],
        frameworks: [twoCategories],
        compliance: ['cis-v8'],
      }),
    );

    // The NDR is cheaper for control 13 on its own, but the SIEM has to be
    // bought anyway for control 8 and closes 13 too. A fix list is a shopping
    // list, and two tools doing one job is what §7.4 step 4 refuses.
    expect(result.remediation.map((option) => option.productId)).toEqual(['claiming-siem']);

    // The two views agree: the gap still reports the cheapest single fix §7.5
    // asks for, and also names the purchase that actually closes it.
    const gap = result.gaps.find((entry) => entry.controlId === 'cis-v8:13');
    expect(gap?.cheapestCloser?.productId).toBe('cheap-ndr');
    expect(gap?.remediationProductId).toBe('claiming-siem');
    expect(gap?.rationale.join(' ')).toContain('one purchase doing three jobs');
  });

  it('does not let the order the gaps are listed in decide what gets bought', () => {
    // Control 13 sorts before control 8 as a string, so a plan built gap by gap
    // in list order buys the cheap NDR first and the SIEM second. The greedy
    // pass has to reach the same one-purchase answer either way.
    const framework = buildFramework({
      id: 'cis-v8',
      name: 'CIS Controls',
      version: 'v8',
      controls: [
        { id: '13', title: 'Network Monitoring', satisfiedBy: ['siem', 'ndr'] },
        { id: '8', title: 'Audit Log Management', satisfiedBy: ['siem'] },
      ],
    });

    const result = computeCoverage(
      buildInputs({
        catalog: [
          product('claiming-siem', 'siem', 500_000, ['cis-v8:8', 'cis-v8:13']),
          product('cheap-ndr', 'ndr', 10_000, ['cis-v8:13']),
        ],
        selected: [],
        frameworks: [framework],
        compliance: ['cis-v8'],
      }),
    );

    expect(result.remediation).toHaveLength(1);
    expect(result.remediationAnnualSpend).toEqual(usd(500_000));
  });

  it('keeps the fix cost in money and the fix effort in people', () => {
    const result = computeCoverage(
      buildInputs({
        catalog: [product('claiming-edr', 'edr', 300_000, ['pci-dss-4.0:5'])],
        selected: [],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    );

    const option = result.remediation.find((entry) => entry.productId === 'claiming-edr');
    // Procurement spend only: licence, support, infrastructure. Salary is not
    // procurement, and the FTE is reported next to it instead of inside it.
    expect(option?.annualSpend).toEqual(usd(300_000));
    expect(option?.opsFte).toBeGreaterThan(0);
    expect(result.remediationOpsFte).toBeGreaterThan(0);
    expect(result.rationale.join(' ')).toContain('salary is not procurement');
  });
});

describe('a claim belongs to the tier that was bought', () => {
  /** Control 11 is sold only in the upper tier; control 5 comes with both. */
  function tieredEdr(): Product {
    const base = product('tiered-edr', 'edr', 300_000, ['pci-dss-4.0:5']);
    const tier = base.tiers[0]!;
    return {
      ...base,
      tiers: [
        { ...tier, id: 'plan-1', controlsCovered: [] },
        { ...tier, id: 'plan-2', controlsCovered: ['pci-dss-4.0:11'] },
      ],
    };
  }

  function statusOf(tierId: string, controlId: string): string {
    const edr = tieredEdr();
    const result = computeCoverage(
      buildInputs({
        catalog: [edr],
        selected: [{ id: 'tiered-edr', category: 'edr', tierId }],
        frameworks: [{ ...pci, controls: pci.controls.map(asEdrControl) }],
        compliance: ['pci-dss-4.0'],
      }),
    );
    return (
      result.frameworks[0]!.controls.find((control) => control.controlId === controlId)?.status ??
      'missing'
    );
  }

  /** Both controls have to be addressable by an EDR for this to test anything. */
  const asEdrControl = (control: Framework['controls'][number]) =>
    control.satisfiedBy.length === 0 ? control : { ...control, satisfiedBy: ['edr' as const] };

  it('does not credit the cheap tier with what only the expensive one delivers', () => {
    // Was: `controlsCovered` was product-level while capabilities are sold by
    // tier, so Defender Plan 1 was credited with CIS 7 continuous
    // vulnerability management, which the same catalog entry's own tier list
    // puts in Plan 2. A bundle must not claim coverage the selected tier does
    // not buy.
    expect(statusOf('plan-1', 'pci-dss-4.0:11')).toBe('partial');
    expect(statusOf('plan-2', 'pci-dss-4.0:11')).toBe('covered');
  });

  it('still credits every tier with the product-level claims', () => {
    expect(statusOf('plan-1', 'pci-dss-4.0:5')).toBe('covered');
    expect(statusOf('plan-2', 'pci-dss-4.0:5')).toBe('covered');
  });
});

describe('closing a gap with a SKU the client already owns', () => {
  /** Owned at `basic`; only `advanced` claims control 11. */
  function tieredSiem(): Product {
    const base = product('owned-siem', 'siem', 100_000, ['pci-dss-4.0:10']);
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
              tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(100_000) }],
            },
          ],
        },
        {
          ...tier,
          id: 'advanced',
          name: 'Advanced',
          controlsCovered: ['pci-dss-4.0:11'],
          pricing: [
            {
              ...tier.pricing[0]!,
              tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(150_000) }],
            },
          ],
        },
      ],
    };
  }

  /** A second tool that would also close control 11, and costs more. */
  const rival = product('rival-siem', 'siem', 900_000, ['pci-dss-4.0:11']);

  function remediationFor() {
    return computeCoverage(
      buildInputs({
        catalog: [tieredSiem(), rival],
        selected: [{ id: 'owned-siem', category: 'siem', tierId: 'basic' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    ).remediation;
  }

  it('offers the upgrade rather than a second tool', () => {
    // The recommendation an analyst needs: the client already holds this
    // licence, and the capability is one tier up. Telling them to buy another
    // SIEM instead is how a proposal loses a technical review.
    const [first] = remediationFor();
    expect(first?.productId).toBe('owned-siem');
    expect(first?.upgradeFromTierId).toBe('basic');
    expect(first?.tierName).toBe('Advanced');
    expect(first?.closesControls).toContain('pci-dss-4.0:11');
  });

  it('prices the upgrade as the difference, not as the price of the tier', () => {
    const [first] = remediationFor();
    // 150,000 minor less the 100,000 already being paid.
    expect(first?.annualSpend.amountMinor).toBe(50_000);
    expect(first?.rationale.join(' ')).toContain('The difference, not the price of the tier');
  });

  it('still offers a new product when nothing owned can be upgraded', () => {
    const plain = product('plain-siem', 'siem', 100_000, ['pci-dss-4.0:10']);
    const remediation = computeCoverage(
      buildInputs({
        catalog: [plain, rival],
        selected: [{ id: 'plain-siem', category: 'siem' }],
        frameworks: [pci],
        compliance: ['pci-dss-4.0'],
      }),
    ).remediation;

    const forEleven = remediation.find((option) =>
      option.closesControls.includes('pci-dss-4.0:11'),
    );
    expect(forEleven?.productId).toBe('rival-siem');
    expect(forEleven?.upgradeFromTierId).toBeNull();
    expect(forEleven?.annualSpend.amountMinor).toBe(900_000);
  });
});

describe('determinism', () => {
  it('produces byte-identical output for the same input', () => {
    const scenario: Scenario = {
      catalog: [
        product('claiming-siem', 'siem', 500_000, ['pci-dss-4.0:10']),
        product('some-edr', 'edr', 300_000, ['pci-dss-4.0:5']),
      ],
      selected: [{ id: 'claiming-siem', category: 'siem' }],
      frameworks: [pci],
      compliance: ['pci-dss-4.0'],
    };

    const first = JSON.stringify(computeCoverage(buildInputs(scenario)));
    const second = JSON.stringify(computeCoverage(buildInputs(scenario)));
    expect(first).toBe(second);
  });
});

describe('the coverage disclaimer', () => {
  // A coverage percentage is the number in this tool most likely to be
  // misread. "PCI DSS 100% covered" invites a reader to conclude the audit is
  // handled, when no product satisfies a control on its own: policy, process,
  // configuration, evidence and an assessor's judgement decide compliance, and
  // none of them are visible here. The mapping bodies say as much about their
  // own mappings; this says it about ours.
  it('says what a coverage figure is not, in as many words', () => {
    const text = coverageDisclaimer();

    expect(text).toContain('SUPPORT');
    expect(text).toContain('not a compliance assessment');
    expect(text).toContain('not an audit result');
    expect(text).toContain('never as a statement of compliance');
  });

  it('is a constant, so every surface shows the same sentence', () => {
    // Verbatim everywhere is the point: the dashboard, the DOCX, the PDF and
    // the analyst's spreadsheet must not each qualify this differently.
    expect(coverageDisclaimer()).toBe(coverageDisclaimer());
  });
});
