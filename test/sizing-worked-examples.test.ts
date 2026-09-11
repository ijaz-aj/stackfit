// Phase 2 definition of done: three worked example environments producing
// EPS/GB numbers that can be sanity-checked by eye.
//
// Unlike the engine unit tests, these run against the *committed* coefficients
// in data/config/sizing-assumptions.yaml. That makes them a review surface as
// much as a regression test: the snapshots below are the numbers a change to
// those coefficients would move, so tuning one shows up in the diff as a
// changed estimate rather than as a silent shift.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSizing, type SizingResult } from '@stackfit/engine';
import type { AssetInventory, ClientProfile } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { loadSizingAssumptions } from '@stackfit/data';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const assumptions = loadSizingAssumptions(join(REPO_ROOT, 'data'));

function profileFor(overrides: Partial<ClientProfile>): ClientProfile {
  return {
    orgName: 'Example',
    industry: 'other',
    region: 'in',
    employeeCount: 100,
    itStaffCount: 4,
    securityStaffFte: 0,
    hasSoc: 'none',
    riskTolerance: 'medium',
    dataSensitivity: 'internal',
    compliance: [],
    budget: { annualCap: null, oneTimeCap: null, currency: 'INR', horizonYears: 3 },
    deploymentPreference: 'hybrid',
    procurementBias: 'no_preference',
    retainedTools: [],
    excludedProducts: [],
    ...overrides,
  };
}

/** The figures an analyst would read off the sizing worksheet. */
function summarise(result: SizingResult) {
  return {
    eps: result.epsTotal,
    gbPerDay: result.gbPerDay,
    licensedGbPerDay: result.licensedGbPerDay,
    storageTb: result.storageTb,
    retentionDays: result.retentionDays,
    monitoredAssets: result.monitoredAssetCount,
    scaleClass: result.scaleClass,
  };
}

/** The classes contributing most of the ingest — where tuning pays off. */
function topContributors(result: SizingResult, count = 3) {
  return [...result.perAssetClass]
    .sort((a, b) => b.eventsPerSecond - a.eventsPerSecond)
    .slice(0, count)
    .map((row) => `${row.assetClass}: ${row.eventsPerSecond} EPS`);
}

describe('Worked example A — small retail chain, 40 stores, PCI DSS', () => {
  // 60 staff, mostly POS. The §12.1 acceptance scenario's environment.
  const inventory: AssetInventory = {
    windowsEndpoints: { count: 45 },
    iotCctvPosDevices: { count: 40, criticality: 'crown_jewel' },
    windowsServers: { count: 5 },
    windowsDomainControllers: { count: 1 },
    linuxServers: { count: 1 },
    firewalls: { count: 2, internetFacing: true },
    switches: { count: 6 },
    networkVendors: ['cisco'],
  };

  const result = computeSizing(
    inventory,
    profileFor({
      orgName: 'Retail Co',
      industry: 'retail',
      employeeCount: 60,
      itStaffCount: 2,
      compliance: ['pci-dss-4.0'],
      dataSensitivity: 'regulated',
    }),
    assumptions,
  );

  it('sizes to a small environment on modest ingest', () => {
    expect(summarise(result)).toMatchInlineSnapshot(`
      {
        "eps": 263,
        "gbPerDay": 11.362,
        "licensedGbPerDay": 17.042,
        "monitoredAssets": 100,
        "retentionDays": 365,
        "scaleClass": "small",
        "storageTb": 2.025,
      }
    `);
  });

  it('holds logs for 12 months because PCI DSS requires it', () => {
    expect(result.retentionDays).toBe(365);
    expect(result.rationale.join('\n')).toContain('required by pci-dss-4.0');
  });

  it('is dominated by firewall logging, which is the first thing to tune', () => {
    expect(topContributors(result)).toMatchInlineSnapshot(`
      [
        "firewalls: 200 EPS",
        "windowsDomainControllers: 25 EPS",
        "iotCctvPosDevices: 12 EPS",
      ]
    `);
  });
});

describe('Worked example B — mid-sized professional services firm', () => {
  const inventory: AssetInventory = {
    windowsEndpoints: { count: 260 },
    macosEndpoints: { count: 40 },
    windowsServers: { count: 25 },
    windowsDomainControllers: { count: 2 },
    hypervisors: { count: 6 },
    firewalls: { count: 4, internetFacing: true },
    switches: { count: 20 },
    wirelessControllers: { count: 2 },
    databases: { count: 8 },
    internalWebApps: { count: 5 },
    publicWebApps: { count: 2, internetFacing: true },
    m365Seats: { count: 320 },
    awsAccounts: { count: 2 },
    remoteUsers: { count: 180 },
    networkVendors: ['fortinet', 'aruba'],
  };

  const result = computeSizing(
    inventory,
    profileFor({
      orgName: 'Consulting Partners',
      industry: 'saas',
      employeeCount: 320,
      itStaffCount: 6,
      securityStaffFte: 1,
      compliance: ['iso-27001-2022', 'soc-2'],
    }),
    assumptions,
  );

  it('sizes to a mid environment', () => {
    expect(summarise(result)).toMatchInlineSnapshot(`
      {
        "eps": 684,
        "gbPerDay": 29.549,
        "licensedGbPerDay": 44.323,
        "monitoredAssets": 374,
        "retentionDays": 90,
        "scaleClass": "mid",
        "storageTb": 1.299,
      }
    `);
  });

  it('keeps the default retention — neither ISO 27001 nor SOC 2 sets a fixed period', () => {
    expect(result.retentionDays).toBe(90);
  });

  it('estimates privileged accounts from IT headcount and flags the estimate', () => {
    expect(result.privilegedAccountCountEstimated).toBe(true);
    expect(result.privilegedAccountCount).toBe(15);
  });

  it('excludes the 320 M365 seats and 180 remote users from monitored assets', () => {
    expect(result.userSeatCount).toBe(320);
    expect(result.monitoredAssetCount).toBe(374);
  });
});

describe('Worked example C — large manufacturer with an OT estate', () => {
  const inventory: AssetInventory = {
    windowsEndpoints: { count: 1500 },
    linuxEndpoints: { count: 60 },
    windowsServers: { count: 120 },
    windowsDomainControllers: { count: 6 },
    linuxServers: { count: 80 },
    hypervisors: { count: 40 },
    containerNodes: { count: 24 },
    fileServers: { count: 12 },
    firewalls: { count: 12, internetFacing: true },
    switches: { count: 80 },
    routers: { count: 14 },
    wirelessControllers: { count: 8 },
    databases: { count: 20 },
    otIcsScadaDevices: { count: 400, criticality: 'crown_jewel' },
    iotCctvPosDevices: { count: 200 },
    privilegedAccounts: { count: 95 },
    networkVendors: ['cisco', 'juniper'],
  };

  const result = computeSizing(
    inventory,
    profileFor({
      orgName: 'Industrial Manufacturing Ltd',
      industry: 'manufacturing',
      employeeCount: 2400,
      itStaffCount: 30,
      securityStaffFte: 3,
      dataSensitivity: 'critical',
      deploymentPreference: 'air_gapped',
    }),
    assumptions,
  );

  it('sizes to a large environment', () => {
    expect(summarise(result)).toMatchInlineSnapshot(`
      {
        "eps": 2525.5,
        "gbPerDay": 109.102,
        "licensedGbPerDay": 163.652,
        "monitoredAssets": 2576,
        "retentionDays": 90,
        "scaleClass": "large",
        "storageTb": 4.795,
      }
    `);
  });

  it('uses the captured privileged account count rather than estimating', () => {
    expect(result.privilegedAccountCount).toBe(95);
    expect(result.privilegedAccountCountEstimated).toBe(false);
  });

  it('counts OT and IoT devices as monitored assets', () => {
    // 400 OT + 200 IoT is a quarter of this estate. Excluding them would drop
    // the environment a scale class and under-size everything downstream.
    expect(result.monitoredAssetCount).toBeGreaterThan(2000);
  });
});

describe('the three examples together', () => {
  it('produce ingest volumes that grow with the estate', () => {
    // A weak assertion on purpose: the point is that the ordering is sane, not
    // that any single number is right. The snapshots above are for eyeballing.
    const gbPerDay = (inventory: AssetInventory, profile: Partial<ClientProfile>) =>
      computeSizing(inventory, profileFor(profile), assumptions).gbPerDay;

    const small = gbPerDay({ windowsEndpoints: { count: 45 }, networkVendors: [] }, {});
    const mid = gbPerDay({ windowsEndpoints: { count: 300 }, networkVendors: [] }, {});
    const large = gbPerDay({ windowsEndpoints: { count: 1500 }, networkVendors: [] }, {});

    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(large);
  });
});
