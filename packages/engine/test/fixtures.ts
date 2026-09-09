// Fixtures for engine tests.
//
// Assumptions are built here rather than read from data/config, so a unit test
// asserts the arithmetic and not the current value of a tunable. The committed
// coefficients are exercised separately, by the worked examples in the
// repo-root `data` test project.

import {
  AssetClass,
  type AssetClassAssumption,
  type ClientProfile,
  type SizingAssumptions,
} from '@stackfit/schema';

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
    deploymentPreference: 'hybrid',
    procurementBias: 'no_preference',
    retainedTools: [],
    ...overrides,
  };
}
