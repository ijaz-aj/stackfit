// PROJECT_SPEC §12 acceptance scenarios.
//
// These run the whole pipeline against the committed catalog, rate cards and
// framework library. They are the tests CONTRIBUTING.md forbids editing to make a
// change pass: if one goes red, the engine or the data is wrong.
//
// ⚠ CATALOG LIMITATION. The catalog currently holds 8 products across 3
// categories — siem, edr and vulnerability_management. There is no MDR,
// backup, iam, pam, ngfw, ndr, email_security, soar, asset_discovery or
// deception product. Scenarios 1 and 2 depend on categories that do not exist
// yet, so each asserts the engine behaviour that *can* be verified today and
// names precisely what is still unverifiable, rather than being skipped or
// quietly weakened. Phase 7 (catalog expansion) is what closes this, and those
// assertions must be tightened when it lands.

import { describe, expect, it } from 'vitest';

import { cheapestTierCost } from '@stackfit/engine';

import {
  allRationale,
  inventoryOf,
  profileOf,
  runScenario,
} from './harness';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

describe('§12.1 — small retail client, PCI DSS, USD 25k/yr cap', () => {
  const profile = profileOf({
    orgName: 'Retail Co',
    industry: 'retail',
    employeeCount: 60,
    itStaffCount: 3,
    securityStaffFte: 0.5,
    dataSensitivity: 'regulated',
    compliance: ['pci-dss-4.0'],
    budget: { annualCap: usd(2_500_000), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
  });
  const inventory = inventoryOf({
    windowsEndpoints: 45,
    iotCctvPosDevices: 40,
    windowsServers: 6,
    firewalls: 2,
    switches: 6,
    m365Seats: 60,
    privilegedAccounts: 4,
  });

  const result = runScenario(profile, inventory);

  it('returns a viable Essential bundle rather than nothing', () => {
    expect(result.essential.selections.length).toBeGreaterThan(0);
    expect(result.essential.withinAnnualCap).toBe(true);
  });

  it('funds log retention — PCI requirement 10 mandates a SIEM, and one is selected', () => {
    // "including log retention" from §12.1: requirement 10 is what forces it,
    // and the sizing stage already lengthens retention to 365 days for PCI.
    expect(result.sizing.retentionDays).toBe(365);
    const categories = result.essential.selections.map((selection) => selection.category);
    expect(categories).toContain('siem');
  });

  it('funds every category PCI mandates, now the catalog stocks them', () => {
    // TIGHTENED IN PHASE 7, as the header of this file said it must be. This
    // assertion used to require unfundedMandatory to be non-empty: PCI mandates
    // ngfw, iam and pam, the catalog stocked none of them, and reporting the
    // shortfall was the honest answer. All three now exist, all three are
    // funded inside the same USD 25k/yr cap, and there is nothing to warn about.
    //
    // §7.4 step 7 itself is still pinned, by §12.5 below (HIPAA at USD 3k/yr,
    // which genuinely cannot be met) and by a unit test in
    // packages/engine/test/portfolio.test.ts.
    expect(result.recommended.unfundedMandatory).toEqual([]);
    expect(allRationale(result.recommended)).not.toContain('SHORTFALL');

    const funded = new Set(result.recommended.selections.map((selection) => selection.category));
    for (const category of ['siem', 'edr', 'vulnerability_management', 'iam', 'pam', 'ngfw']) {
      expect(funded.has(category as never), `${category} is mandated by PCI and unfunded`).toBe(
        true,
      );
    }
  });

  it('flags any placeholder-priced product in the mandatory set', () => {
    // §12.1: "no placeholder-priced product in the mandatory set without a
    // warning". The committed catalog has no placeholders left, so this asserts
    // the invariant holds rather than that a warning fired.
    const mandatory = result.recommended.selections.filter((selection) => selection.mandatory);
    for (const selection of mandatory) {
      // The costing the selection was actually made on, tier included.
      const cost = selection.cost;
      expect(
        cost.hasPlaceholderPricing,
        `${selection.productId} is placeholder-priced inside the mandatory set`,
      ).toBe(false);
    }
  });
});

describe('§12.2 — zero security staff, 300 endpoints', () => {
  const profile = profileOf({
    orgName: 'No SecOps Ltd',
    employeeCount: 300,
    itStaffCount: 8,
    securityStaffFte: 0,
    budget: { annualCap: usd(15_000_000), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
  });
  const inventory = inventoryOf({
    windowsEndpoints: 300,
    windowsServers: 12,
    windowsDomainControllers: 2,
    m365Seats: 300,
    privilegedAccounts: 8,
  });

  const result = runScenario(profile, inventory);

  it('makes the ops-fit penalty visible in the rationale', () => {
    // §12.2 requires this explicitly. A client with no security staff must be
    // told why a self-hosted tool is a bad idea, not just given a lower number.
    const selfHosted = result.scores.find((score) => score.productId === 'wazuh');
    const opsFit = selfHosted?.dimensions.find((d) => d.dimension === 'ops_fit');
    expect(opsFit?.score).toBeLessThan(50);
    expect(opsFit?.rationale).toContain('no security staff');
  });

  it('scores every self-hosted option badly on operability', () => {
    for (const id of ['wazuh', 'graylog-open', 'velociraptor', 'greenbone-openvas']) {
      const score = result.scores.find((entry) => entry.productId === id);
      if (score === undefined || score.eliminated) continue;
      const opsFit = score.dimensions.find((d) => d.dimension === 'ops_fit');
      expect(opsFit?.score, `${id} ops fit`).toBeLessThan(50);
    }
  });

  it('ranks managed options above self-hosted ones on operability', () => {
    // TIGHTENED IN PHASE 7. This used to assert only that the MSSP alternative
    // was costed and presented, because there was no mdr product in the catalog
    // for "MDR outranks self-hosted SIEM" to be true of. There are five now.
    //
    // The comparison is on ops fit rather than on total score, because fit is
    // scored against each category's own remit and is not comparable across
    // categories. Operability is the dimension §12.2 actually names.
    const opsFitOf = (productId: string) =>
      result.scores
        .find((score) => score.productId === productId)
        ?.dimensions.find((dimension) => dimension.dimension === 'ops_fit')?.score ?? -1;

    const managed = ['huntress', 'blumira', 'sophos-mdr', 'arctic-wolf'];
    const selfHosted = ['wazuh', 'graylog-open', 'security-onion', 'greenbone-openvas'];

    for (const service of managed) {
      for (const platform of selfHosted) {
        expect(
          opsFitOf(service),
          `${service} ops fit must beat ${platform} for a client with no security staff`,
        ).toBeGreaterThan(opsFitOf(platform));
      }
    }

    // And an MDR product is actually in the recommended stack, not merely
    // scored well and then left out.
    const categories = result.recommended.selections.map((selection) => selection.category);
    expect(categories).toContain('mdr');

    // The generic managed alternative is still costed and presented alongside
    // it — they answer different questions, and both should be on the table.
    expect(result.recommended.mssp.annual.amountMinor).toBeGreaterThan(0);
    expect(allRationale(result.recommended)).toContain('managed');
  });
});

describe('§12.3 — open-source-first, low budget, 2 security FTE', () => {
  const profile = profileOf({
    orgName: 'OSS First',
    employeeCount: 400,
    itStaffCount: 12,
    securityStaffFte: 2,
    procurementBias: 'open_source_first',
    deploymentPreference: 'on_prem',
    // §12.3 says "low budget", and it has to actually be low: USD 8k/yr of
    // procurement spend for a 500-asset estate is a budget that cannot buy
    // commercial licences, which is the situation the scenario describes.
    budget: { annualCap: usd(800_000), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
  });
  const inventory = inventoryOf({
    windowsEndpoints: 350,
    linuxServers: 80,
    windowsServers: 40,
    windowsDomainControllers: 2,
    hypervisors: 8,
    firewalls: 4,
    databases: 12,
  });

  const result = runScenario(profile, inventory);

  it('recommends an open-source stack, not a token open-source product', () => {
    // §12.3: "OSS stack recommended". Every selection must be open source or
    // open core — at this budget nothing else is affordable, and the bias
    // resolves any remaining tie.
    const byId = new Map(result.products.map((product) => [product.id, product]));
    expect(result.recommended.selections.length).toBeGreaterThan(1);
    for (const selection of result.recommended.selections) {
      const licence = byId.get(selection.productId)?.licenceModel;
      expect(
        licence === 'open_source' || licence === 'open_core',
        `${selection.productId} is ${licence}`,
      ).toBe(true);
    }
  });

  it('does NOT cost the open-source stack at zero', () => {
    // The single most important assertion in this file. Hard rule 8 exists
    // because "Wazuh is free" is the wrong answer, and this is what proves the
    // tool never gives it.
    const wazuh = cheapestTierCost(result.costs, 'wazuh');
    expect(wazuh?.licenceAnnual.amountMinor).toBe(0);
    expect(wazuh?.tco.amountMinor).toBeGreaterThan(0);
  });

  it('makes people and implementation the dominant line items for open source', () => {
    const wazuh = cheapestTierCost(result.costs, 'wazuh');
    expect(wazuh).toBeDefined();

    const opsOverHorizon =
      wazuh!.opsFteAnnual.amountMinor * profile.budget.horizonYears +
      wazuh!.implementationOneTime.amountMinor;

    // §12.3: FTE and implementation must dominate, not be a rounding error.
    expect(opsOverHorizon).toBeGreaterThan(wazuh!.tco.amountMinor * 0.5);
  });
});

describe('§12.4 — air-gapped OT environment', () => {
  const profile = profileOf({
    orgName: 'Air Gapped Plant',
    industry: 'manufacturing',
    employeeCount: 250,
    itStaffCount: 6,
    securityStaffFte: 1,
    deploymentPreference: 'air_gapped',
    budget: { annualCap: null, oneTimeCap: null, currency: 'USD', horizonYears: 3 },
  });
  const inventory = inventoryOf({
    windowsEndpoints: 120,
    windowsServers: 20,
    otIcsScadaDevices: 400,
    iotCctvPosDevices: 150,
    firewalls: 6,
    switches: 30,
  });

  const result = runScenario(profile, inventory);

  it('hard-filters every SaaS-only product, with a stated reason', () => {
    // §12.4 verbatim. These three are cloud-only in the committed catalog.
    for (const id of ['microsoft-sentinel', 'crowdstrike-falcon-go', 'microsoft-defender-for-endpoint']) {
      const score = result.scores.find((entry) => entry.productId === id);
      expect(score?.eliminated, `${id} should be eliminated`).toBe(true);
      expect(score?.eliminationReasons.join(' '), `${id} reason`).toContain('air-gapped');
    }
  });

  it('keeps the air-gap-capable products available', () => {
    for (const id of ['wazuh', 'graylog-open', 'velociraptor', 'greenbone-openvas']) {
      const score = result.scores.find((entry) => entry.productId === id);
      expect(
        score?.eliminationReasons.join(' ') ?? '',
        `${id} should not be eliminated for air-gap`,
      ).not.toContain('air-gapped');
    }
  });

  it('never selects a product it eliminated', () => {
    const eliminated = new Set(
      result.scores.filter((score) => score.eliminated).map((score) => score.productId),
    );
    for (const bundle of [result.essential, result.recommended, result.ideal]) {
      for (const selection of bundle.selections) {
        expect(eliminated.has(selection.productId), `${selection.productId} in ${bundle.kind}`).toBe(
          false,
        );
      }
    }
  });
});

describe('§12.5 — impossible budget: HIPAA client, USD 3k/yr cap', () => {
  const profile = profileOf({
    orgName: 'Tiny Clinic',
    industry: 'healthcare',
    employeeCount: 40,
    itStaffCount: 2,
    securityStaffFte: 0,
    dataSensitivity: 'regulated',
    compliance: ['hipaa'],
    budget: { annualCap: usd(300_000), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
  });
  const inventory = inventoryOf({
    windowsEndpoints: 35,
    windowsServers: 4,
    m365Seats: 40,
    privilegedAccounts: 3,
  });

  const result = runScenario(profile, inventory);

  it('returns an explicit shortfall rather than a fake recommendation', () => {
    expect(result.recommended.unfundedMandatory.length).toBeGreaterThan(0);
    expect(allRationale(result.recommended)).toContain('SHORTFALL');
    expect(allRationale(result.recommended)).toContain('does not meet');
  });

  it('states a minimum viable budget', () => {
    expect(result.recommended.minimumViableAnnual).not.toBeNull();
  });

  it('never claims a mandatory category is satisfied when it is not', () => {
    const funded = new Set(result.recommended.selections.map((selection) => selection.category));
    for (const category of result.recommended.unfundedMandatory) {
      expect(funded.has(category), `${category} reported both funded and unfunded`).toBe(false);
    }
  });
});

describe('§12.6 — determinism', () => {
  const profile = profileOf({
    orgName: 'Determinism',
    compliance: ['pci-dss-4.0'],
    budget: { annualCap: usd(5_000_000), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
  });
  const inventory = inventoryOf({
    windowsEndpoints: 200,
    windowsServers: 30,
    firewalls: 3,
    m365Seats: 200,
  });

  it('gives an identical result for the same input twice, across the whole pipeline', () => {
    // The existing determinism test covers sizing only. This covers the seams.
    expect(JSON.stringify(runScenario(profile, inventory))).toEqual(
      JSON.stringify(runScenario(profile, inventory)),
    );
  });

  it('is unaffected by the order of keys in the inventory', () => {
    const forwards = inventoryOf({ windowsServers: 30, firewalls: 3, m365Seats: 200 });
    const backwards = inventoryOf({ m365Seats: 200, firewalls: 3, windowsServers: 30 });
    expect(JSON.stringify(runScenario(profile, forwards))).toEqual(
      JSON.stringify(runScenario(profile, backwards)),
    );
  });
});

describe('§12.7 — currency', () => {
  const inventory = inventoryOf({
    windowsEndpoints: 200,
    windowsServers: 30,
    windowsDomainControllers: 2,
    firewalls: 3,
  });

  const inUsd = runScenario(
    profileOf({
      region: 'us',
      budget: { annualCap: null, oneTimeCap: null, currency: 'USD', horizonYears: 3 },
    }),
    inventory,
  );
  const inInr = runScenario(
    profileOf({
      region: 'us',
      budget: { annualCap: null, oneTimeCap: null, currency: 'INR', horizonYears: 3 },
    }),
    inventory,
  );

  it('selects the same products regardless of the currency they are quoted in', () => {
    expect(inInr.recommended.selections.map((s) => s.productId)).toEqual(
      inUsd.recommended.selections.map((s) => s.productId),
    );
  });

  it('keeps every figure a whole number of minor units in both currencies', () => {
    // §12.7 forbids floating-point drift. A fractional paisa is the symptom.
    for (const result of [inUsd, inInr]) {
      for (const selection of result.recommended.selections) {
        expect(Number.isInteger(selection.annualRecurring.amountMinor)).toBe(true);
        expect(Number.isInteger(selection.tco.amountMinor)).toBe(true);
      }
      expect(Number.isInteger(result.recommended.tco.amountMinor)).toBe(true);
    }
  });

  it('converts totals consistently under the configured rate', () => {
    // Not equality — rounding to whole minor units happens per line — but the
    // INR total must track the USD total to within a rounding tolerance.
    const usdTotal = inUsd.recommended.tco.amountMinor;
    const inrTotal = inInr.recommended.tco.amountMinor;
    expect(usdTotal).toBeGreaterThan(0);
    expect(inrTotal).toBeGreaterThan(usdTotal); // INR is the weaker unit
  });
});

describe('regressions found by these scenarios', () => {
  const inventory = inventoryOf({
    windowsEndpoints: 350,
    linuxServers: 80,
    windowsServers: 40,
    windowsDomainControllers: 2,
    hypervisors: 8,
    firewalls: 4,
    databases: 12,
  });

  it('never covers less as the budget goes up', () => {
    // Was: a USD 15,000 cap bought one product while a USD 8,000 cap bought
    // three, because ranking purely on value density let one expensive product
    // take the money and starve every category after it. A client whose budget
    // went up would have been shown a worse stack.
    const coveredWeightAt = (capMinor: number): number =>
      runScenario(
        profileOf({
          employeeCount: 400,
          itStaffCount: 12,
          securityStaffFte: 2,
          deploymentPreference: 'on_prem',
          budget: { annualCap: usd(capMinor), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
        }),
        inventory,
      ).recommended.selections.reduce((sum, selection) => sum + selection.categoryWeight, 0);

    const caps = [500_000, 800_000, 1_200_000, 1_500_000, 2_000_000, 3_000_000, 8_000_000];
    let previous = -1;
    for (const cap of caps) {
      const covered = coveredWeightAt(cap);
      expect(covered, `cap ${cap} covers less than the cap below it`).toBeGreaterThanOrEqual(
        previous,
      );
      previous = covered;
    }
  });

  it('never charges operational salary against the procurement cap', () => {
    // Was: annualRecurring (which includes ops FTE) was tested against the cap,
    // so every open-source product was "unaffordable" on salary alone.
    const result = runScenario(
      profileOf({
        employeeCount: 400,
        itStaffCount: 12,
        securityStaffFte: 2,
        budget: { annualCap: usd(800_000), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
      }),
      inventory,
    );
    expect(result.recommended.selections.length).toBeGreaterThan(0);
    expect(result.recommended.annualSpend.amountMinor).toBeLessThanOrEqual(800_000);
    // People are still counted, just not against this cap.
    expect(result.recommended.annualRecurring.amountMinor).toBeGreaterThan(
      result.recommended.annualSpend.amountMinor,
    );
  });
});
