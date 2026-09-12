// Phase 4b definition of done: the coverage matrix and the gap list, run
// against the *committed* catalog, config and framework library.
//
// Like the cost worked examples, these snapshots are a review surface first and
// a regression test second. If a control mapping or a catalog price moves, the
// coverage picture moves with it, in the diff.

import { describe, expect, it } from 'vitest';

import { coverageOf, inventoryOf, profileOf, runScenario } from './scenarios/harness';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

/** The §12.1 retailer: 60 staff, PCI DSS, USD 25k/yr cap. */
const retail = runScenario(
  profileOf({
    orgName: 'Retail Co',
    industry: 'retail',
    employeeCount: 60,
    itStaffCount: 3,
    securityStaffFte: 0.5,
    dataSensitivity: 'regulated',
    compliance: ['pci-dss-4.0'],
    budget: { annualCap: usd(2_500_000), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
  }),
  inventoryOf({
    windowsEndpoints: 45,
    iotCctvPosDevices: 40,
    windowsServers: 6,
    firewalls: 2,
    switches: 6,
    m365Seats: 60,
    privilegedAccounts: 4,
  }),
);

describe('Coverage for the 60-staff PCI DSS retailer', () => {
  const coverage = retail.coverage;

  it('scores each framework against what a purchase could actually satisfy', () => {
    expect(
      coverage.frameworks.map(
        (framework) =>
          `${framework.frameworkId} | in scope ${framework.inScope} | covered ${framework.coveredControls}` +
          `/${framework.addressableControls} of ${framework.totalControls} | partial ${framework.partialControls}` +
          ` | gaps ${framework.gapControls} | ${framework.coveragePercent}%`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "pci-dss-4.0 | in scope true | covered 6/8 of 12 | partial 1 | gaps 1 | 75%",
        "nist-csf-2.0 | in scope false | covered 6/13 of 22 | partial 3 | gaps 4 | 46.2%",
      ]
    `);
  });

  it('maps the bundle to the six CSF Functions (§7.5)', () => {
    // The reason §7.5 asks for this view: a SIEM, an EDR and a scanner can see
    // and find, and cannot respond or recover. That reads off the Functions in
    // one line and off a list of controls not at all.
    const csf = coverage.frameworks.find(
      (framework) => framework.frameworkId === 'nist-csf-2.0',
    );
    expect(
      csf?.groups.map(
        (group) =>
          `${group.name} ${group.coveredControls}/${group.addressableControls} = ${group.coveragePercent}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "Govern 0/0 = null",
        "Identify 2/2 = 100",
        "Protect 2/4 = 50",
        "Detect 2/2 = 100",
        "Respond 0/4 = 0",
        "Recover 0/1 = 0",
      ]
    `);
  });

  it('treats CSF as a reference lens, not as a compliance claim', () => {
    // The client selected PCI DSS and nothing else. CSF is reported because it
    // is how any stack is read, and it must never be counted as an obligation.
    const csf = coverage.frameworks.find((framework) => framework.frameworkId === 'nist-csf-2.0');
    expect(csf?.inScope).toBe(false);
    expect(coverage.summary.frameworksInScope).toBe(1);
    // 12 PCI controls, 8 of which a purchase could satisfy.
    expect(coverage.summary.totalControls).toBe(12);
  });

  it('grades every unmet PCI mandate as critical, and names them', () => {
    const critical = coverage.gaps.filter((gap) => gap.residualRisk === 'critical');
    expect(critical.map((gap) => gap.controlId)).toMatchInlineSnapshot(`
      [
        "pci-dss-4.0:1",
        "pci-dss-4.0:7",
      ]
    `);
    for (const gap of critical) {
      expect(gap.mandatory).toBe(true);
      expect(gap.inScope).toBe(true);
    }
    expect(coverage.rationale.join(' ')).toContain('obligations, not preferences');
  });

  it('says plainly which gaps the catalog cannot close yet, and closes the rest', () => {
    // ⚠ CATALOG LIMITATION, shrinking. Was nine of eleven before Phase 7; the
    // iam category closed three of them. The remainder need pam, ngfw, backup
    // or email_security, none of which the catalog stocks yet. The honest
    // output for those is "StackFit cannot fix this", not a silent empty fix
    // list, and this number should keep falling as Phase 7 lands categories.
    expect(coverage.unclosableGaps.length).toBe(6);
    expect(coverage.gaps.length).toBe(9);

    // The other three are partials — the stack has the right kind of tool and
    // nothing in it claims the control — and those do have a route. Before
    // partials entered this list the client was shown a coverage percentage
    // with no way to improve it at all.
    const closable = coverage.gaps.filter((gap) => gap.cheapestCloser !== null);
    expect(closable.map((gap) => gap.controlId)).toEqual([
      'pci-dss-4.0:7',
      'nist-csf-2.0:RS.MI',
      'nist-csf-2.0:RS.AN',
    ]);
    expect(closable.every((gap) => gap.kind === 'partial')).toBe(true);

    // PCI requirement 7 is the Phase 7 addition and the best single output on
    // this page. At USD 25k/yr the bundle now buys Duo Essentials for identity,
    // which does not claim requirement 7 — so the client is told they are still
    // failing a PCI mandate, and the fix is not a second product but the next
    // tier of one they are already buying. That is the Phase 6 upgrade path
    // firing on real catalog data for the first time.
    const requirementSeven = closable.find((gap) => gap.controlId === 'pci-dss-4.0:7');
    expect(requirementSeven?.residualRisk).toBe('critical');
    expect(requirementSeven?.cheapestCloser?.productId).toBe('cisco-duo');

    // And every purchase on the list must actually achieve something. A
    // product that merely belongs to the right category cannot move a control
    // that is already partial, so offering one would be recommending a
    // purchase that buys nothing.
    for (const option of coverage.remediation) {
      expect(option.closesControls.length).toBeGreaterThan(0);
    }
    expect(coverage.rationale.join(' ')).toContain('a gap in StackFit, not in the client');
  });

  it('covers more as the bundle gets richer', () => {
    const essential = coverageOf(retail, retail.essential).summary.coveragePercent ?? 0;
    const recommended = coverage.summary.coveragePercent ?? 0;
    const ideal = coverageOf(retail, retail.ideal).summary.coveragePercent ?? 0;

    expect(`essential ${essential} → recommended ${recommended} → ideal ${ideal}`).toMatchInlineSnapshot(`"essential 62.5 → recommended 75 → ideal 87.5"`);
    expect(recommended).toBeGreaterThanOrEqual(essential);
    expect(ideal).toBeGreaterThanOrEqual(recommended);
  });
});

describe('Coverage for a 250-seat manufacturer on CIS v8', () => {
  const inventory = inventoryOf({
    windowsEndpoints: 200,
    windowsServers: 20,
    windowsDomainControllers: 2,
    firewalls: 4,
    switches: 10,
    m365Seats: 250,
    privilegedAccounts: 12,
  });

  const at = (capMinor: number) =>
    runScenario(
      profileOf({
        orgName: 'CIS Co',
        industry: 'manufacturing',
        employeeCount: 250,
        itStaffCount: 6,
        securityStaffFte: 1,
        compliance: ['cis-v8'],
        budget: { annualCap: usd(capMinor), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
      }),
      inventory,
    );

  it('prices the fix list in money and in people, even when every fix is free', () => {
    // At USD 3,000/yr the bundle affords one EDR. The two products that would
    // close the most gaps are OpenVAS and Wazuh — both zero-licence, and the
    // fix list still costs thousands a year and most of an engineer. That is
    // hard rule 8 carried into the gap analysis rather than solved once in the
    // cost stage and forgotten here.
    //
    // CrowdStrike sits between them closing one control: it is dearer than
    // either free tool and earns its place only on the control neither claims.
    const coverage = at(300_000).coverage;

    expect(
      coverage.remediation.map(
        (option) =>
          `${option.productId} (${option.category}) | ${option.annualSpend.amountMinor / 100} USD/yr` +
          ` | ${option.opsFte.toFixed(2)} FTE | closes ${option.closesControls.length}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "greenbone-openvas (vulnerability_management) | 2450.04 USD/yr | 0.33 FTE | closes 6",
        "keycloak (iam) | 2450.04 USD/yr | 0.42 FTE | closes 3",
        "crowdstrike-falcon-go (edr) | 11998 USD/yr | 0.12 FTE | closes 1",
        "wazuh (siem) | 2450.04 USD/yr | 0.57 FTE | closes 3",
      ]
    `);

    for (const option of coverage.remediation) {
      expect(option.annualSpend.amountMinor).toBeGreaterThan(0);
      expect(option.opsFte).toBeGreaterThan(0);
    }
    expect(coverage.remediationOpsFte).toBeGreaterThan(0);
  });

  it('never covers less as the budget goes up', () => {
    // The same property the portfolio monotonicity test pins, read at the other
    // end of the pipeline: more money must not buy less compliance coverage.
    const caps = [300_000, 800_000, 2_000_000, 5_000_000];
    let previous = -1;
    for (const cap of caps) {
      const covered = at(cap).coverage.summary.coveredControls;
      expect(covered, `cap ${cap} covers fewer controls than the cap below it`).toBeGreaterThanOrEqual(
        previous,
      );
      previous = covered;
    }
  });

  it('is deterministic against the committed data', () => {
    expect(JSON.stringify(at(800_000).coverage)).toBe(JSON.stringify(at(800_000).coverage));
  });
});
