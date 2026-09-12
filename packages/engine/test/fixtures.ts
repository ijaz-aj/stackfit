// Fixtures for engine tests.
//
// Assumptions are built here rather than read from data/config, so a unit test
// asserts the arithmetic and not the current value of a tunable. The committed
// coefficients are exercised separately, by the worked examples in the
// repo-root `data` test project.

import {
  AssetClass,
  ProductCategory,
  Region,
  type AssetClassAssumption,
  type ClientProfile,
  type CostAssumptions,
  type CoverageAssumptions,
  type DeploymentMode,
  Framework,
  type MsspRateCard,
  type PortfolioAssumptions,
  type FreshnessPolicy,
  type FxConfig,
  type Implementation,
  type LabourRates,
  type OpsBurden,
  type CategoryWeights,
  type DeviceClass,
  type PricingRule,
  Product,
  type ScoringWeights,
  type SizingAssumptions,
} from '@stackfit/schema';

import type { CostInputs } from '../src/index';

/** Deliberately round numbers, so expected values can be worked out by hand. */
const DEFAULT_ASSUMPTION: AssetClassAssumption = {
  eventsPerSecond: 1,
  role: 'server',
  monitored: true,
  basis: 'test fixture',
};

export function buildSizingAssumptions(
  assetClassOverrides: Partial<Record<AssetClass, Partial<AssetClassAssumption>>> = {},
  overrides: Partial<Omit<SizingAssumptions, 'assetClasses'>> = {},
): SizingAssumptions {
  const assetClasses = Object.fromEntries(
    AssetClass.options.map((assetClass) => [
      assetClass,
      { ...DEFAULT_ASSUMPTION, eventsPerSecond: 0, ...assetClassOverrides[assetClass] },
    ]),
  ) as SizingAssumptions['assetClasses'];

  return {
    asOf: '2026-01-01',
    assetClasses,
    averageEventBytes: 1000,
    peakFactor: 2,
    compressionRatio: 0.5,
    verbosityFactors: { quiet: 0.5, default: 1, chatty: 2 },
    privilegedAccountsPerItStaff: 2,
    retention: { defaultDays: 100, byFramework: { 'pci-dss-4.0': 365 } },
    scaleClassThresholds: { smallMax: 250, midMax: 1000, largeMax: 5000 },
    sources: [],
    ...overrides,
  };
}

export function buildClientProfile(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    orgName: 'Test Org',
    industry: 'other',
    region: 'other',
    employeeCount: 100,
    itStaffCount: 4,
    securityStaffFte: 0,
    hasSoc: 'none',
    riskTolerance: 'medium',
    dataSensitivity: 'internal',
    compliance: [],
    budget: { annualCap: null, oneTimeCap: null, currency: 'USD', horizonYears: 3 },
    environment: 'not_asked',
    deploymentConstraint: 'none',
    procurementBias: 'no_preference',
    retainedTools: [],
    excludedProducts: [],
    ...overrides,
  };
}

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

export function buildFxConfig(): FxConfig {
  return {
    base: 'USD',
    asOf: '2026-01-01',
    rates: [
      { currency: 'USD', rateMicros: 1_000_000 },
      { currency: 'INR', rateMicros: 94_843_169 },
      { currency: 'EUR', rateMicros: 860_279 },
    ],
    sources: [{ url: 'https://example.com/fx', asOf: '2026-01-01' }],
  };
}

/** Round labour rates, so expected costs can be worked out by hand. */
export function buildLabourRates(): LabourRates {
  const rate = {
    loadedAnnualCost: usd(10_000_000), // USD 100,000
    implementationDayRate: usd(100_000), // USD 1,000
    basis: 'test fixture',
  };
  return {
    asOf: '2026-01-01',
    byRegion: Object.fromEntries(
      Region.options.map((region) => [region, rate]),
    ) as LabourRates['byRegion'],
    sources: [{ url: 'https://example.com/labour', asOf: '2026-01-01' }],
  };
}

export function buildCostAssumptions(overrides: Partial<CostAssumptions> = {}): CostAssumptions {
  return {
    asOf: '2026-01-01',
    annualUpliftRate: 0.05,
    supportRateOfLicence: 0,
    trainingDaysRatio: 0.15,
    discountBands: [
      { maxAnnualSpend: usd(2_500_000), discountRate: 0, label: 'smb' },
      { maxAnnualSpend: usd(10_000_000), discountRate: 0.15, label: 'mid' },
      { maxAnnualSpend: null, discountRate: 0.25, label: 'enterprise' },
    ],
    infra: {
      asOf: '2026-01-01',
      vcpuMonth: usd(2500),
      ramGbMonth: usd(500),
      storageTbMonth: usd(2300),
      gbPerDayPerVcpu: 15,
      ramGbPerVcpu: 4,
      minimumVcpu: 4,
      // Every category, because the schema insists — a fixture that could skip
      // one would let the engine fall back to a log platform's sizing without
      // any test noticing. siem and ndr keep the log-platform shape; everything
      // else is a flat floor here, so a fixture product's infra does not move
      // when an unrelated sizing coefficient changes.
      byCategory: ProductCategory.options.map((category) => ({
        category,
        vcpuBasis:
          category === 'siem' || category === 'ndr'
            ? ('log_ingest' as const)
            : ('monitored_assets' as const),
        minimumVcpu: 4,
        vcpuPerThousandAssets: 0,
        chargesLogRetentionStorage: category === 'siem' || category === 'ndr',
        basis: 'test fixture',
      })),
      sources: [{ url: 'https://example.com/infra', asOf: '2026-01-01' }],
    },
    sources: [],
    ...overrides,
  };
}

export function buildFreshnessPolicy(overrides: Partial<FreshnessPolicy> = {}): FreshnessPolicy {
  return {
    asOf: '2026-01-01',
    maxAgeDaysByConfidence: {
      public_list: 90,
      vendor_quote: 180,
      analyst_estimate: 120,
      placeholder: 60,
    },
    warnAtFraction: 0.75,
    ...overrides,
  };
}

export function buildCostInputs(overrides: Partial<CostInputs> = {}): CostInputs {
  return {
    labourRates: buildLabourRates(),
    costAssumptions: buildCostAssumptions(),
    fx: buildFxConfig(),
    freshnessPolicy: buildFreshnessPolicy(),
    // Fixture prices are dated 2026-01-01, so this keeps them fresh unless a
    // test deliberately moves the clock forward.
    today: '2026-01-15',
    ...overrides,
  };
}

interface ProductOverrides {
  readonly id?: string;
  readonly licenceModel?: Product['licenceModel'];
  readonly pricing?: readonly Partial<PricingRule>[];
  readonly deploymentModes?: readonly DeploymentMode[];
  /** Partial: a test that does not care about confidence should not state one. */
  readonly opsBurden?: Partial<OpsBurden>;
  readonly implementation?: Partial<Implementation>;
  /** Needed by any test that grades an effort figure `placeholder`. */
  readonly notes?: string;
}

/**
 * A minimal catalog product. Pricing rules are given as partials and completed
 * with a source and confidence, so a test says only what it cares about.
 */
export function buildProduct(overrides: ProductOverrides = {}): Product {
  // Parsed rather than cast: a malformed fixture (a pricing rule with the wrong
  // key, say) would otherwise price at zero and quietly make a test vacuous.
  return Product.parse(buildProductShape(overrides));
}

function buildProductShape(overrides: ProductOverrides = {}): unknown {
  const pricing = (overrides.pricing ?? [{ model: 'zero_licence' }]).map((rule) => ({
    termYears: 1,
    pricingConfidence: 'public_list' as const,
    sources: [{ url: 'https://example.com/pricing', asOf: '2026-01-01' }],
    ...rule,
  })) as PricingRule[];

  return {
    id: overrides.id ?? 'example-product',
    name: 'Example Product',
    vendor: 'Example Inc.',
    category: 'siem',
    licenceModel: overrides.licenceModel ?? 'commercial',
    maturity: 'established',
    tiers: [{ id: 'standard', name: 'Standard', capabilities: [], pricing }],
    supports: {
      os: ['windows'],
      deviceClasses: ['server'],
      cloudPlatforms: [],
      deploymentModes: [...(overrides.deploymentModes ?? ['cloud'])],
      scaleFloor: 'small',
      scaleCeiling: 'enterprise',
      airGapCapable: (overrides.deploymentModes ?? []).includes('air_gapped'),
    },
    integrations: [],
    controlsCovered: [],
    opsBurden: {
      baseFte: 0.1,
      ftePerThousandAssets: 0.1,
      confidence: 'analyst_estimate',
      ...overrides.opsBurden,
    },
    implementation: {
      effortDays: 5,
      skillLevel: 'generalist',
      typicalWeeks: 2,
      confidence: 'analyst_estimate',
      ...overrides.implementation,
    },
    strengths: [],
    weaknesses: [],
    bestFor: [],
    avoidWhen: [],
    sources: [{ url: 'https://example.com/docs', asOf: '2026-01-01' }],
    ...(overrides.notes === undefined ? {} : { notes: overrides.notes }),
  };
}

/** Portfolio assumptions with round numbers, for tests that only need them wired. */
export function buildPortfolioAssumptions(
  overrides: Partial<PortfolioAssumptions> = {},
): PortfolioAssumptions {
  return {
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
    ...overrides,
  };
}

export function buildCoverageAssumptions(
  overrides: Partial<CoverageAssumptions> = {},
): CoverageAssumptions {
  return {
    mandatoryControlRisk: 'critical',
    residualRiskBands: [
      { risk: 'high', minCategoryWeight: 85, label: 'essential here' },
      { risk: 'medium', minCategoryWeight: 50, label: 'material here' },
      { risk: 'low', minCategoryWeight: 0, label: 'situational here' },
    ],
    basis: 'test fixture',
    ...overrides,
  };
}

export function buildMsspRateCard(): MsspRateCard {
  return {
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
        coveredCategories: ['siem', 'mdr', 'edr'],
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
}

/**
 * A framework, parsed rather than cast.
 *
 * Casting one is how a fixture ends up missing a field the schema defaults —
 * `groups`, say — and then crashes a stage that trusts the schema. Same lesson
 * as the `buildProduct` fixture, which priced at zero while it cast.
 */
export function buildFramework(overrides: Record<string, unknown>): Framework {
  return Framework.parse({
    name: 'Test Framework',
    version: '1.0',
    sourceQuality: 'publisher_verified',
    commonIn: ['global'],
    sources: [{ url: 'https://example.com', asOf: '2026-01-01' }],
    ...overrides,
  });
}

/**
 * Scoring config with the spec's default weights and deliberately simple
 * remits, so an expected score can be worked out by hand.
 */
export function buildScoringWeights(overrides: Partial<ScoringWeights> = {}): ScoringWeights {
  const basis = 'test fixture';
  return {
    dimensions: [
      { dimension: 'asset_coverage', weight: 25, basis },
      { dimension: 'compliance_fit', weight: 20, basis },
      { dimension: 'ops_fit', weight: 20, basis },
      { dimension: 'deployment_fit', weight: 10, basis },
      { dimension: 'integration_fit', weight: 10, basis },
      { dimension: 'scale_fit', weight: 10, basis },
      { dimension: 'maturity', weight: 5, basis },
    ],
    biasAdjustments: [
      { bias: 'open_source_first', deltas: [{ dimension: 'ops_fit', delta: 10, basis }] },
      { bias: 'commercial', deltas: [] },
      { bias: 'no_preference', deltas: [] },
    ],
    opsFit: {
      comfortableShareOfFte: 0.35,
      unusableShareOfFte: 1.2,
      scoreWithNoSecurityStaff: 15,
      unusableFteWithNoSecurityStaff: 0.5,
      basis,
    },
    deploymentFit: {
      statedMatch: 100,
      statedHybridFallback: 70,
      statedMismatch: 30,
      statedSingleModeInHybrid: 85,
      inferredMatch: 100,
      inferredHybridFallback: 85,
      inferredMismatch: 55,
      noSignal: 85,
      byEstateShape: [
        { shape: 'on_prem_centric', prefers: ['on_prem'], basis },
        { shape: 'ot_heavy', prefers: ['on_prem', 'air_gapped'], basis },
        { shape: 'saas_centric', prefers: ['cloud'], basis },
        { shape: 'cloud_native', prefers: ['cloud'], basis },
        { shape: 'hybrid', prefers: ['hybrid', 'cloud', 'on_prem'], basis },
        { shape: 'unknown', prefers: [], basis },
      ],
      basis,
    },
    maturityScores: { established: 100, emerging: 60, legacy: 30 },
    assetClassDeviceClass: {
      windowsEndpoints: 'workstation',
      macosEndpoints: 'workstation',
      linuxEndpoints: 'workstation',
      windowsServers: 'server',
      windowsDomainControllers: 'domain_controller',
      linuxServers: 'server',
      hypervisors: 'hypervisor',
      containerNodes: 'container_node',
      routers: 'network_device',
      switches: 'network_device',
      wirelessControllers: 'network_device',
      firewalls: 'firewall',
      vpnConcentrators: 'network_device',
      loadBalancers: 'network_device',
      databases: 'database',
      fileServers: 'server',
      internalWebApps: 'web_app',
      publicWebApps: 'web_app',
      otIcsScadaDevices: 'ot_ics',
      iotCctvPosDevices: 'iot',
      awsAccounts: 'cloud_workload',
      azureSubscriptions: 'cloud_workload',
      gcpProjects: 'cloud_workload',
      cloudWorkloads: 'cloud_workload',
      m365Seats: 'mailbox',
      googleWorkspaceSeats: 'mailbox',
      otherCriticalSaasApps: 'saas_tenant',
      remoteUsers: 'identity',
      privilegedAccounts: 'identity',
      serviceAccounts: 'identity',
    },
    categoryRemits: ProductCategory.options.map((category) => ({
      category,
      deviceClasses:
        category === 'email_security'
          ? (['mailbox'] as DeviceClass[])
          : (['server', 'workstation', 'mailbox'] as DeviceClass[]),
      basis,
    })),
    ...overrides,
  };
}

/**
 * Surface weights for tests. Every asset class weighs 1 by default, so a test
 * asserting "30 of 40 assets = 75%" still works by hand; pass `unitWeights` to
 * exercise the weighting itself.
 */
export function buildCategoryWeights(
  unitWeights: Partial<Record<AssetClass, number>> = {},
): CategoryWeights {
  const basis = 'test fixture';
  const surfaceOf = (assetClass: string): string =>
    assetClass.includes('Endpoint')
      ? 'endpoint'
      : assetClass.includes('Seats') || assetClass.includes('Saas')
        ? 'saas_identity'
        : 'on_prem_server';

  return {
    materialSurfaceShare: 0.1,
    otHeavyShare: 0.35,
    dominantLocusShare: 0.6,
    surfaceUnits: Object.fromEntries(
      AssetClass.options.map((assetClass) => [
        assetClass,
        { surface: surfaceOf(assetClass), weight: unitWeights[assetClass] ?? 1, basis },
      ]),
    ) as CategoryWeights['surfaceUnits'],
    categories: ProductCategory.options.map((category) => ({
      category,
      baseRiskReduction: 90,
      basis,
      requiresAnyOf: [
        'endpoint',
        'on_prem_server',
        'network_edge',
        'public_app',
        'cloud_iaas',
        'saas_identity',
        'ot_ics',
        'identity',
      ] as CategoryWeights['categories'][number]['requiresAnyOf'],
      affinities: [],
    })),
    industryModifiers: [],
  };
}
