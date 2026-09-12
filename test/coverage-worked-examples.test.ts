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
        "pci-dss-4.0 | in scope true | covered 8/8 of 12 | partial 0 | gaps 0 | 100%",
        "nist-csf-2.0 | in scope false | covered 12/13 of 22 | partial 1 | gaps 0 | 92.3%",
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
        "Protect 4/4 = 100",
        "Detect 2/2 = 100",
        "Respond 3/4 = 75",
        "Recover 1/1 = 100",
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

  it('leaves no unmet PCI mandate at all, now the catalog can fill every category', () => {
    // This assertion inverted during Phase 7 and that is the point of the
    // phase. It used to name three critical gaps — requirements 1, 7 and 8 —
    // because the catalog stocked no ngfw, iam or pam product to close them
    // with. It now names none: every PCI control a purchase could satisfy is
    // satisfied by the recommended bundle, at the same USD 25k/yr cap.
    //
    // The rationale sentence about "obligations, not preferences" is therefore
    // absent, because nothing is unmet. That wording is still pinned, on a
    // fixture with a real unmet mandate, in packages/engine/test/coverage.test.ts.
    const critical = coverage.gaps.filter((gap) => gap.residualRisk === 'critical');
    expect(critical).toEqual([]);

    const pci = coverage.frameworks.find((framework) => framework.frameworkId === 'pci-dss-4.0');
    expect(pci?.coveredControls).toBe(pci?.addressableControls);
    expect(pci?.coveragePercent).toBe(100);
  });

  it('says plainly which gaps the catalog cannot close yet, and closes the rest', () => {
    // ⚠ CATALOG LIMITATION: GONE, for this scenario. It was nine unclosable
    // gaps out of eleven when Phase 7 started, because the catalog stocked
    // three categories. It is now zero: every remaining gap has a product in
    // the catalog that would close it, and the fix list has a price.
    //
    // Keep the assertion as an equality rather than a bound. If a later
    // catalog or engine change reintroduces an unclosable gap here, that is
    // worth going red over.
    expect(coverage.unclosableGaps).toEqual([]);
    expect(coverage.gaps.length).toBe(1);

    // The one that remains is a partial — the stack has a SIEM and nothing in
    // it claims CSF incident analysis — and it has a route: TheHive. Before
    // partials entered this list the client was shown a coverage percentage
    // with no way to improve it at all.
    const closable = coverage.gaps.filter((gap) => gap.cheapestCloser !== null);
    expect(closable.map((gap) => gap.controlId)).toEqual(['nist-csf-2.0:RS.AN']);
    expect(closable.every((gap) => gap.kind === 'partial')).toBe(true);

    // PCI requirement 7 is worth watching across Phase 7 as a measure of what
    // the catalog is for. Before the phase it was an unclosable critical gap:
    // the client was failing a PCI mandate and StackFit had nothing to sell
    // them. After iam it became a closable one, fixable by upgrading a tier of
    // a product already in the bundle. After pam it is simply covered.
    expect(coverage.gaps.map((gap) => gap.controlId)).not.toContain('pci-dss-4.0:7');

    // And every purchase on the list must actually achieve something. A
    // product that merely belongs to the right category cannot move a control
    // that is already partial, so offering one would be recommending a
    // purchase that buys nothing.
    for (const option of coverage.remediation) {
      expect(option.closesControls.length).toBeGreaterThan(0);
    }
    // And the converse: with nothing unclosable, the bundle must NOT be
    // telling the client that StackFit has a gap. That wording is still pinned,
    // on a fixture that genuinely has one, in packages/engine/test/coverage.test.ts.
    expect(coverage.rationale.join(' ')).not.toContain('a gap in StackFit');
  });

  it('covers more as the bundle gets richer', () => {
    const essential = coverageOf(retail, retail.essential).summary.coveragePercent ?? 0;
    const recommended = coverage.summary.coveragePercent ?? 0;
    const ideal = coverageOf(retail, retail.ideal).summary.coveragePercent ?? 0;

    expect(`essential ${essential} → recommended ${recommended} → ideal ${ideal}`).toMatchInlineSnapshot(`"essential 87.5 → recommended 100 → ideal 100"`);
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
        "passbolt (pam) | 2450.04 USD/yr | 0.16 FTE | closes 3",
        "crowdstrike-falcon-go (edr) | 11998 USD/yr | 0.12 FTE | closes 1",
        "azure-backup (backup) | 2640 USD/yr | 0.11 FTE | closes 4",
        "security-onion (ndr) | 2450.04 USD/yr | 0.57 FTE | closes 3",
        "opnsense (ngfw) | 2450.04 USD/yr | 0.22 FTE | closes 1",
        "proxmox-mail-gateway (email_security) | 2450.04 USD/yr | 0.26 FTE | closes 1",
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
