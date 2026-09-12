import { NO_SIZING_OVERRIDES, type AssetInventory, type SizingOverrides } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { applySizingOverrides, computeSizing } from '../src/index';
import { buildClientProfile, buildSizingAssumptions } from './fixtures';

const profile = buildClientProfile();

describe('computeSizing: the §7.1 formulas', () => {
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

  it('derives storage from retention and compression, in decimal TB', () => {
    // 0.864 GB/day x 100 days (the fixture's default retention) x 0.5 kept
    // = 43.2 GB = 0.0432 TB, rounded to three places.
    //
    // Was 0.042, because TB was 1024 GB while GB was 1e9 bytes: a decimal
    // gigabyte divided by a binary thousand, which is 2.3% under a real TB and
    // 7.4% over a real TiB. Storage is bought in decimal TB, so that is the
    // unit this reports.
    expect(result.storageTb).toBe(0.043);
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

describe('computeSizing: verbosity', () => {
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

describe('computeSizing: retention is driven by compliance', () => {
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

describe('computeSizing: headline counts', () => {
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

describe('computeSizing: privileged accounts', () => {
  const assumptions = buildSizingAssumptions({ linuxServers: { eventsPerSecond: 1 } });
  const inventory: AssetInventory = { linuxServers: { count: 10 }, networkVendors: [] };

  it('estimates from IT headcount when not captured, and says so', () => {
    const result = computeSizing(inventory, buildClientProfile({ itStaffCount: 5 }), assumptions);
    expect(result.privilegedAccountCount).toBe(10);
    expect(result.privilegedAccountCountEstimated).toBe(true);
    expect(result.rationale.join('\n')).toContain('Confirm before sizing PAM');
  });

  it('rounds an estimate up: a fractional admin account is not a thing', () => {
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

describe('computeSizing: scale class', () => {
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

describe('computeSizing: empty inventory', () => {
  it('returns zeroes and says the inventory is empty, not that the client is small', () => {
    const result = computeSizing({ networkVendors: [] }, profile, buildSizingAssumptions());

    expect(result.epsTotal).toBe(0);
    expect(result.gbPerDay).toBe(0);
    expect(result.storageTb).toBe(0);
    expect(result.perAssetClass).toEqual([]);
    expect(result.rationale.join('\n')).toContain('empty inventory, not a small environment');
  });
});

describe('sizing overrides (§8.6)', () => {
  const inventory = {
    firewalls: { count: 4 },
    windowsServers: { count: 10 },
    networkVendors: [],
  } as AssetInventory;

  const assumptions = buildSizingAssumptions({
    firewalls: { eventsPerSecond: 100, role: 'network', monitored: true },
    windowsServers: { eventsPerSecond: 2, role: 'server', monitored: true },
  });

  it('changes nothing when there is nothing to change', () => {
    const base = computeSizing(inventory, buildClientProfile(), assumptions);
    const merged = applySizingOverrides(assumptions, NO_SIZING_OVERRIDES);

    expect(JSON.stringify(computeSizing(inventory, buildClientProfile(), merged))).toBe(
      JSON.stringify(base),
    );
  });

  it('lets an analyst say these firewalls are quieter than that', () => {
    // The coefficient the repo argues about once, corrected for one client on
    // one call. 4 firewalls at 100 EPS dominate this estate; at 10 they do not.
    const merged = applySizingOverrides(assumptions, {
      eventsPerSecond: { firewalls: 10 },
    });
    const sized = computeSizing(inventory, buildClientProfile(), merged);

    expect(sized.epsTotal).toBe(4 * 10 + 10 * 2);
    // The override says so on the worksheet rather than silently replacing the
    // reasoning behind the default.
    expect(merged.assetClasses.firewalls.basis).toContain('Analyst override');
    expect(merged.assetClasses.firewalls.basis).toContain('default 100');
  });

  it('does not mutate the assumptions it was given', () => {
    const before = JSON.stringify(assumptions);
    applySizingOverrides(assumptions, { eventsPerSecond: { firewalls: 1 }, peakFactor: 9 });
    expect(JSON.stringify(assumptions)).toBe(before);
  });

  it('lets compliance lengthen an overridden retention, never shorten it', () => {
    // An analyst deciding 30 days is enough does not exempt a PCI client from
    // requirement 10. The override replaces the default; the framework still
    // wins when it asks for more.
    // Deliberately a bare object: this is the shape stored JSON can arrive in.
    const merged = applySizingOverrides(assumptions, { retentionDays: 30 } as SizingOverrides);

    const unregulated = computeSizing(inventory, buildClientProfile(), merged);
    expect(unregulated.retentionDays).toBe(30);

    const pci = computeSizing(
      inventory,
      buildClientProfile({ compliance: ['pci-dss-4.0'] }),
      merged,
    );
    expect(pci.retentionDays).toBe(365);
  });

  it('applies the storage knobs', () => {
    const merged = applySizingOverrides(assumptions, {
      eventsPerSecond: {},
      averageEventBytes: 2000,
      peakFactor: 3,
    });

    const base = computeSizing(inventory, buildClientProfile(), assumptions);
    const tuned = computeSizing(inventory, buildClientProfile(), merged);

    // Fixture is 1000 bytes and peak factor 2, so both double and treble.
    expect(tuned.gbPerDay).toBeCloseTo(base.gbPerDay * 2, 6);
    expect(tuned.licensedGbPerDay).toBeCloseTo(tuned.gbPerDay * 3, 6);
  });
});

describe('measured ingest, which outranks every coefficient here', () => {
  // The per-asset EPS figures are the standard first-pass method and every
  // vendor calculator uses them. They also disagree with each other by more
  // than an order of magnitude for the same device class: a Windows workstation
  // is published at 1, 2, 5 and 10 to 50 EPS by four different sources, and a
  // domain controller at 100 to 500. Those sources are not disagreeing about
  // the hardware. They are disagreeing about audit policy and about what an
  // estate forwards, which is a fact about a client's configuration.
  //
  // So a client who measured their own is right and this file is a guess.

  const inventory = {
    windowsEndpoints: { count: 500 },
    windowsServers: { count: 40 },
    networkVendors: [],
  } as never;

  const assumptions = buildSizingAssumptions();
  const profile = buildClientProfile();
  const derived = computeSizing(inventory, profile, assumptions);

  it('replaces the derived event rate, and everything that follows from it', () => {
    const measured = computeSizing(inventory, profile, assumptions, { eps: 4_000 });

    expect(derived.epsTotal).not.toBe(4_000);
    expect(measured.epsTotal).toBe(4_000);
    // Volume, licence and storage all hang off EPS, so all three move.
    expect(measured.gbPerDay).toBeGreaterThan(derived.gbPerDay);
    expect(measured.licensedGbPerDay).toBeCloseTo(measured.gbPerDay * assumptions.peakFactor, 6);
    expect(measured.storageTb).toBeGreaterThan(derived.storageTb);
  });

  it('replaces the volume directly, whatever the event rate implies', () => {
    // The commoner case. An organisation running a SIEM knows its GB/day,
    // because that is the number the licence bills on.
    const measured = computeSizing(inventory, profile, assumptions, { gbPerDay: 42 });

    expect(measured.gbPerDay).toBe(42);
    expect(measured.licensedGbPerDay).toBeCloseTo(42 * assumptions.peakFactor, 6);
    // EPS is untouched: they measured volume, not rate.
    expect(measured.epsTotal).toBe(derived.epsTotal);
  });

  it('accepts both, and reports the estate’s real event size', () => {
    // Measuring both is legitimate and useful: the ratio between them is this
    // client's actual average event size rather than this file's assumption.
    const measured = computeSizing(inventory, profile, assumptions, {
      eps: 1_000,
      gbPerDay: 8.64,
    });
    expect(measured.epsTotal).toBe(1_000);
    expect(measured.gbPerDay).toBe(8.64);
    // 8.64 GB/day at 1,000 EPS is 100 bytes an event.
    expect(measured.rationale.join(' ')).toContain('100 bytes');
  });

  it('treats a measured zero as a measurement, not as an absence', () => {
    // "We forward nothing today" is a real answer and a common one on a first
    // call. It must not fall back to the coefficients.
    const measured = computeSizing(inventory, profile, assumptions, { eps: 0 });
    expect(measured.epsTotal).toBe(0);
    expect(measured.gbPerDay).toBe(0);
    expect(measured.ingestSource).toBe('measured');
  });

  it('labels which of the two it is', () => {
    // A coefficient-derived 40 GB/day and a metered 40 GB/day are the same
    // number and not the same claim.
    expect(derived.ingestSource).toBe('derived');
    expect(computeSizing(inventory, profile, assumptions, { gbPerDay: 40 }).ingestSource).toBe(
      'measured',
    );
  });

  it('says in the rationale what it did and what it would have said', () => {
    const measured = computeSizing(inventory, profile, assumptions, { eps: 4_000 });
    const said = measured.rationale.join(' ');
    expect(said).toContain('because the client measured it');
    // The derived figure is still reported, so the gap between the estimate and
    // the measurement is visible rather than quietly discarded.
    expect(said).toContain('would have given');
  });
});
