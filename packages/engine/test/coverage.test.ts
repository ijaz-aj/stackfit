// Coverage (PROJECT_SPEC §7.5).
//
// The assertions that matter most are about what is *not* claimed: that a
// control no purchase can satisfy stays out of the denominator, and that having
// the right kind of product is reported as partial rather than as coverage.

import type { CoverageAssumptions, Framework, Money, Product, ProductCategory } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { computeProductCost, type ProductCost } from '../src/cost';
import { computeCoverage, type CoverageInputs } from '../src/coverage';
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
      { model: 'flat_tiered', tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(annualMinor) }] },
    ],
  });
  return {
    ...base,
    category,
    controlsCovered: [...controlsCovered],
    supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    opsBurden: { baseFte: 0.1, ftePerThousandAssets: 0 },
  };
}

/**
 * A bundle holding exactly these products. Built by hand rather than through
 * `buildPortfolio`, so a coverage assertion fails for coverage reasons only.
 */
function bundleOf(selections: readonly { id: string; category: ProductCategory }[]): Bundle {
  const selection = (entry: { id: string; category: ProductCategory }): BundleSelection => ({
    category: entry.category,
    productId: entry.id,
    productName: entry.id,
    vendor: 'Example Inc.',
    tierId: 'standard',
    fitScore: 80,
    categoryWeight: 90,
    mandatory: false,
    valueDensity: 1,
    annualRecurring: zero,
    annualSpend: zero,
    oneTime: zero,
    tco: zero,
    suiteDiscountApplied: false,
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
    annualShortfall: null,
    minimumViableAnnual: null,
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
    rationale: [],
  };
}

interface Scenario {
  readonly catalog: readonly Product[];
  readonly selected: readonly { id: string; category: ProductCategory }[];
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

  const costs = new Map<string, ProductCost>(
    scenario.catalog.map((entry) => [
      entry.id,
      computeProductCost(entry, entry.tiers[0]!, sizing, profile, costInputs),
    ]),
  );

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

    // Requirement 10 maps to siem, and a siem is in the stack — but this one
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
    // 4 controls, 3 of them buyable, 2 covered — 67%, not 50%. Counting
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
    expect(result.gaps.map((gap) => gap.controlId)).toEqual(['pci-dss-4.0:5']);
  });

  it('warns when the framework itself is not publisher-verified', () => {
    const result = computeCoverage(
      buildInputs({ catalog, selected: [], frameworks: [pci], compliance: ['pci-dss-4.0'] }),
    );

    expect(result.frameworks[0]!.rationale.join(' ')).toContain('secondary_sources');
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

    expect(result.unclosableGaps).toEqual(['pci-dss-4.0:5']);
    expect(result.gaps[0]?.cheapestCloser).toBeNull();
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
    // Procurement spend only — licence, support, infrastructure. Salary is not
    // procurement, and the FTE is reported next to it instead of inside it.
    expect(option?.annualSpend).toEqual(usd(300_000));
    expect(option?.opsFte).toBeGreaterThan(0);
    expect(result.remediationOpsFte).toBeGreaterThan(0);
    expect(result.rationale.join(' ')).toContain('salary is not procurement');
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
