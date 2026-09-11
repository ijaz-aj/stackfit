import type { AssetInventory } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { computeSizing } from '../src/index';
import { buildClientProfile, buildSizingAssumptions } from './fixtures';

const profile = buildClientProfile();

describe('computeSizing — the §7.1 formulas', () => {
  // 10 servers × 1 EPS × verbosity 1 = 10 EPS.
  // GB/day  = 10 × 86,400 × 1,000 / 1e9              = 0.864
  // Licensed = 0.864 × peakFactor 2                  = 1.728
  // Storage  = 0.864 × 100 days × (1 - 0.5) / 1024   = 0.0422 TB
  const assumptions = buildSizingAssumptions({ linuxServers: { eventsPerSecond: 1 } });
  const inventory: AssetInventory = { linuxServers: { count: 10 }, networkVendors: [] };

  const result = computeSizing(inventory, profile, assumptions);

  it('sums EPS across asset classes', () => {
    expect(result.epsTotal).toBe(10);
  });

  it('derives GB/day from EPS, seconds per day and average event size', () => {
    expect(result.gbPerDay).toBe(0.864);
  });

  it('applies the peak factor to licensed volume only', () => {
    expect(result.licensedGbPerDay).toBe(1.728);
    expect(result.gbPerDay).toBe(0.864);
  });

  it('derives storage from retention and compression', () => {
    expect(result.storageTb).toBe(0.042);
  });

  it('returns a per-class worksheet for every class with a count', () => {
    expect(result.perAssetClass).toEqual([
      {
        assetClass: 'linuxServers',
        count: 10,
        eventsPerSecondPerAsset: 1,
        eventsPerSecond: 10,
      },
    ]);
  });

  it('explains every derived number (hard rule 5)', () => {
    expect(result.rationale.length).toBeGreaterThanOrEqual(6);
    expect(result.rationale.join('\n')).toContain('86,400');
  });
});

describe('computeSizing — verbosity', () => {
  const assumptions = buildSizingAssumptions({ windowsServers: { eventsPerSecond: 2 } });
  const base: AssetInventory = { windowsServers: { count: 100 }, networkVendors: [] };

  it('scales EPS by the verbosity profile', () => {
    const quiet = computeSizing({ ...base, verbosityOverride: 'quiet' }, profile, assumptions);
    const normal = computeSizing(base, profile, assumptions);
    const chatty = computeSizing({ ...base, verbosityOverride: 'chatty' }, profile, assumptions);

    expect(quiet.epsTotal).toBe(100);
    expect(normal.epsTotal).toBe(200);
    expect(chatty.epsTotal).toBe(400);
  });

  it('reports the factor it used', () => {
    const chatty = computeSizing({ ...base, verbosityOverride: 'chatty' }, profile, assumptions);
    expect(chatty.verbosityFactor).toBe(2);
    expect(chatty.rationale.join('\n')).toContain('chatty verbosity');
  });
});

describe('computeSizing — retention is driven by compliance', () => {
  const assumptions = buildSizingAssumptions({ linuxServers: { eventsPerSecond: 1 } });
  const inventory: AssetInventory = { linuxServers: { count: 10 }, networkVendors: [] };

  it('uses the configured default when no framework demands longer', () => {
    const result = computeSizing(inventory, profile, assumptions);
    expect(result.retentionDays).toBe(100);
    expect(result.rationale.join('\n')).toContain('configured default');
  });

  it('lengthens retention for PCI DSS, and says which framework did it', () => {
    const result = computeSizing(
      inventory,
      buildClientProfile({ compliance: ['pci-dss-4.0'] }),
      assumptions,
    );
    expect(result.retentionDays).toBe(365);
    expect(result.rationale.join('\n')).toContain('required by pci-dss-4.0');
  });

  it('grows storage in proportion, so compliance shows up as a cost', () => {
    const standard = computeSizing(inventory, profile, assumptions);
    const pci = computeSizing(
      inventory,
      buildClientProfile({ compliance: ['pci-dss-4.0'] }),
      assumptions,
    );
    expect(pci.storageTb).toBeGreaterThan(standard.storageTb);
  });

  it('takes the longest requirement when several frameworks apply', () => {
    const assumptionsWithTwo = buildSizingAssumptions(
      { linuxServers: { eventsPerSecond: 1 } },
      { retention: { defaultDays: 100, byFramework: { 'pci-dss-4.0': 365, hipaa: 2190 } } },
    );
    const result = computeSizing(
      inventory,
      buildClientProfile({ compliance: ['pci-dss-4.0', 'hipaa'] }),
      assumptionsWithTwo,
    );
    expect(result.retentionDays).toBe(2190);
  });
});

describe('computeSizing — headline counts', () => {
  const assumptions = buildSizingAssumptions({
    windowsEndpoints: { eventsPerSecond: 0.2, role: 'endpoint', monitored: true },
    windowsServers: { eventsPerSecond: 2, role: 'server', monitored: true },
    m365Seats: { eventsPerSecond: 0.05, role: 'saas_seat', monitored: false },
    awsAccounts: { eventsPerSecond: 5, role: 'cloud', monitored: false },
  });

  const inventory: AssetInventory = {
    windowsEndpoints: { count: 200 },
    windowsServers: { count: 20 },
    m365Seats: { count: 220 },
    awsAccounts: { count: 3 },
    networkVendors: [],
  };

  const result = computeSizing(inventory, profile, assumptions);

  it('separates endpoints from servers', () => {
    expect(result.endpointCount).toBe(200);
    expect(result.serverCount).toBe(20);
  });

  it('excludes user seats and log-source-only classes from monitored assets', () => {
    // Seats drive per-user licensing and an AWS account is a log source, not
    // something an agent is licensed onto. Counting either would inflate the
    // scale class and every per-asset ops-burden figure downstream.
    expect(result.monitoredAssetCount).toBe(220);
    expect(result.userSeatCount).toBe(220);
  });

  it('still counts unmonitored classes toward ingest volume', () => {
    // 200×0.2 + 20×2 + 220×0.05 + 3×5 = 40 + 40 + 11 + 15
    expect(result.epsTotal).toBe(106);
  });
});

describe('computeSizing — privileged accounts', () => {
  const assumptions = buildSizingAssumptions({ linuxServers: { eventsPerSecond: 1 } });
  const inventory: AssetInventory = { linuxServers: { count: 10 }, networkVendors: [] };

  it('estimates from IT headcount when not captured, and says so', () => {
    const result = computeSizing(inventory, buildClientProfile({ itStaffCount: 5 }), assumptions);
    expect(result.privilegedAccountCount).toBe(10);
    expect(result.privilegedAccountCountEstimated).toBe(true);
    expect(result.rationale.join('\n')).toContain('Confirm before sizing PAM');
  });

  it('rounds an estimate up — a fractional admin account is not a thing', () => {
    const assumptionsOdd = buildSizingAssumptions(
      { linuxServers: { eventsPerSecond: 1 } },
      { privilegedAccountsPerItStaff: 2.5 },
    );
    const result = computeSizing(
      inventory,
      buildClientProfile({ itStaffCount: 3 }),
      assumptionsOdd,
    );
    expect(result.privilegedAccountCount).toBe(8);
  });

  it('prefers a captured count over the estimate', () => {
    const result = computeSizing(
      { ...inventory, privilegedAccounts: { count: 42 } },
      buildClientProfile({ itStaffCount: 5 }),
      assumptions,
    );
    expect(result.privilegedAccountCount).toBe(42);
    expect(result.privilegedAccountCountEstimated).toBe(false);
  });

  it('distinguishes a captured zero from an absent count', () => {
    const result = computeSizing(
      { ...inventory, privilegedAccounts: { count: 0 } },
      buildClientProfile({ itStaffCount: 5 }),
      assumptions,
    );
    expect(result.privilegedAccountCount).toBe(0);
    expect(result.privilegedAccountCountEstimated).toBe(false);
  });
});

describe('computeSizing — scale class', () => {
  const assumptions = buildSizingAssumptions({
    windowsEndpoints: { eventsPerSecond: 0.2, role: 'endpoint', monitored: true },
  });

  const scaleClassFor = (count: number) =>
    computeSizing({ windowsEndpoints: { count }, networkVendors: [] }, profile, assumptions)
      .scaleClass;

  it.each([
    [1, 'small'],
    [250, 'small'],
    [251, 'mid'],
    [1000, 'mid'],
    [1001, 'large'],
    [5000, 'large'],
    [5001, 'enterprise'],
  ])('classifies %i monitored assets as %s', (count, expected) => {
    expect(scaleClassFor(count)).toBe(expected);
  });
});

describe('computeSizing — empty inventory', () => {
  it('returns zeroes and says the inventory is empty, not that the client is small', () => {
    const result = computeSizing({ networkVendors: [] }, profile, buildSizingAssumptions());

    expect(result.epsTotal).toBe(0);
    expect(result.gbPerDay).toBe(0);
    expect(result.storageTb).toBe(0);
    expect(result.perAssetClass).toEqual([]);
    expect(result.rationale.join('\n')).toContain('empty inventory, not a small environment');
  });
});
