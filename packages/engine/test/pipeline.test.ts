// The pipeline wiring (PROJECT_SPEC §7).
//
// The stages are tested individually elsewhere, and end to end against the
// committed data in the acceptance scenarios. What is left, and what these
// cover, is the wiring itself: that the client's own framework selections drive
// the recommendation, that CSF is always *also* reported without being treated
// as an obligation, and that running the whole thing twice gives the same
// answer. The property every caller depends on and none of them can check.

import type { AssetInventory, Framework, Product, ProductCategory } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { coverageOfBundle, runPipeline, type PipelineInputs } from '../src/pipeline';
import {
  buildCategoryWeights,
  buildClientProfile,
  buildCostInputs,
  buildCoverageAssumptions,
  buildFramework,
  buildMsspRateCard,
  buildPortfolioAssumptions,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

const inventory = {
  windowsEndpoints: { count: 120 },
  windowsServers: { count: 20 },
  networkVendors: [],
} as AssetInventory;

function product(id: string, category: ProductCategory, annualMinor: number, controls: string[]) {
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
    controlsCovered: controls,
    supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
  } as Product;
}

const pci: Framework = buildFramework({
  id: 'pci-dss-4.0',
  name: 'PCI DSS',
  version: '4.0.1',
  sourceQuality: 'secondary_sources',
  controls: [{ id: '10', title: 'Log and monitor', satisfiedBy: ['siem'], mandatory: true }],
});

const csf: Framework = buildFramework({
  id: 'nist-csf-2.0',
  name: 'NIST CSF',
  version: '2.0',
  groups: [{ id: 'DE', name: 'Detect' }],
  controls: [
    { id: 'DE.CM', title: 'Continuous Monitoring', group: 'DE', satisfiedBy: ['siem'] },
    { id: 'DE.AE', title: 'Adverse Event Analysis', group: 'DE', satisfiedBy: ['siem'] },
  ],
});

const products = [
  product('a-siem', 'siem', 500_000, ['pci-dss-4.0:10', 'nist-csf-2.0:DE.CM']),
  product('an-edr', 'edr', 300_000, []),
];

function inputs(overrides: Partial<PipelineInputs> = {}): PipelineInputs {
  return {
    profile: buildClientProfile({ securityStaffFte: 2, compliance: ['pci-dss-4.0'] }),
    inventory,
    products,
    frameworks: new Map([
      ['pci-dss-4.0', pci],
      ['nist-csf-2.0', csf],
    ]),
    sizingAssumptions: buildSizingAssumptions({
      windowsEndpoints: { eventsPerSecond: 0.2, role: 'endpoint', monitored: true },
      windowsServers: { eventsPerSecond: 2, role: 'server', monitored: true },
    }),
    categoryWeights: buildCategoryWeights(),
    scoringWeights: buildScoringWeights(),
    portfolioAssumptions: buildPortfolioAssumptions(),
    coverageAssumptions: buildCoverageAssumptions(),
    mssp: buildMsspRateCard(),
    costInputs: buildCostInputs(),
    ...overrides,
  };
}

describe('runPipeline', () => {
  it('carries a scenario from an inventory to a costed, covered bundle', () => {
    const result = runPipeline(inputs());

    expect(result.sizing.epsTotal).toBeGreaterThan(0);
    expect(result.recommended.selections.length).toBeGreaterThan(0);
    expect(result.recommended.tco.amountMinor).toBeGreaterThan(0);
    expect(result.coverage.frameworks.length).toBe(2);
    // Every stage's output has to explain itself (hard rule 5).
    expect(result.recommended.rationale.length).toBeGreaterThan(0);
    expect(result.coverage.rationale.length).toBeGreaterThan(0);
  });

  it('gives the same answer twice', () => {
    expect(JSON.stringify(runPipeline(inputs()))).toBe(JSON.stringify(runPipeline(inputs())));
  });

  it('reports CSF even when the client did not select it, and never as an obligation', () => {
    const result = runPipeline(inputs());

    const csfCoverage = result.coverage.frameworks.find(
      (framework) => framework.frameworkId === 'nist-csf-2.0',
    );
    expect(csfCoverage?.inScope).toBe(false);
    expect(result.coverage.summary.frameworksInScope).toBe(1);
    // The headline percentage is measured against what the client is actually
    // on the hook for, not against the reference lens.
    expect(result.coverage.summary.totalControls).toBe(1);
  });

  it('lets the client’s selections decide what is mandatory', () => {
    const withPci = runPipeline(inputs());
    const withNothing = runPipeline(
      inputs({ profile: buildClientProfile({ securityStaffFte: 2, compliance: [] }) }),
    );

    expect(withPci.rankings.find((ranking) => ranking.category === 'siem')?.mandatory).toBe(true);
    expect(withNothing.rankings.find((ranking) => ranking.category === 'siem')?.mandatory).toBe(
      false,
    );
  });

  it('lets the estate decide deployment fit when the client states no preference', () => {
    // The wiring the infrastructure stage exists to feed: `scoring` runs after
    // `infrastructure` so that a client with no stated preference is scored
    // against what they actually run. Two estates, one catalog, one profile.
    const cloudOnly = product('cloud-siem', 'siem', 500_000, []);
    const onPremOnly = {
      ...cloudOnly,
      id: 'on-prem-siem',
      supports: { ...cloudOnly.supports, deploymentModes: ['on_prem' as const] },
    };

    const saasEstate = {
      m365Seats: { count: 400 },
      macosEndpoints: { count: 200 },
      otherCriticalSaasApps: { count: 20 },
      networkVendors: [],
    } as AssetInventory;

    const onPrem = runPipeline(inputs({ products: [cloudOnly, onPremOnly] }));
    const saas = runPipeline(inputs({ products: [cloudOnly, onPremOnly], inventory: saasEstate }));

    expect(onPrem.infrastructure.shape).toBe('on_prem_centric');
    expect(saas.infrastructure.shape).toBe('saas_centric');

    const fit = (result: typeof onPrem, productId: string) =>
      result.scores
        .find((score) => score.productId === productId)
        ?.dimensions.find((dimension) => dimension.dimension === 'deployment_fit')?.score;

    expect(fit(onPrem, 'on-prem-siem')).toBeGreaterThan(fit(onPrem, 'cloud-siem') ?? 0);
    expect(fit(saas, 'cloud-siem')).toBeGreaterThan(fit(saas, 'on-prem-siem') ?? 0);
  });

  it('measures every bundle against the same denominator', () => {
    // §8.1 puts the three bundles side by side, which only means anything if
    // they are scored out of the same total.
    const result = runPipeline(inputs());
    const totals = [result.essential, result.recommended, result.ideal].map(
      (bundle) => coverageOfBundle(result, bundle).summary.addressableControls,
    );

    expect(new Set(totals).size).toBe(1);
  });
});
