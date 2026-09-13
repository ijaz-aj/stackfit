// What the client already owns, against the committed catalog.
//
// `retainedTools` is documented in PROJECT_SPEC §5.1 as "products they already
// own and will keep". It reached the integration-fit score and the tier
// prerequisites, and no further: coverage never counted a holding's control
// claims, so a client who said "we are keeping Proxmox Backup Server" had the
// controls that product closes reported back to them as gaps.
//
// Reporting a covered control as a gap is not a conservative estimate. It is a
// wrong answer, and one a client spots in the first five minutes of reading the
// proposal they are being asked to pay for.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPresets } from '@stackfit/data';
import { describe, expect, it } from 'vitest';

import { proposalFor, runScenario } from './scenarios/harness';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const presets = loadPresets(DATA_DIR);

const retailer = presets.find((preset) => preset.id === 'retail-chain-40-stores');
if (retailer === undefined) throw new Error('expected the retail preset');

const profileOf = (retainedTools: string[]) => ({
  ...retailer.profile,
  orgName: retailer.name,
  retainedTools,
});

describe('a tool the client already owns', () => {
  it('closes the controls it claims, instead of being reported as a gap', () => {
    // A client who already runs Defender for Endpoint has the controls an
    // endpoint agent closes *closed*. The proposal should say so rather than
    // quote them a gap they closed years ago.
    //
    // ⚠ The premise has now moved twice, and the property has not. It first
    // used a backup product, on the premise that the retailer could not afford
    // backup; that stopped being true when mandate resolution was corrected and
    // the freed money reached backup in year one. It then used the retail
    // preset for both halves, on the premise that retail defers EDR to Phase 2;
    // that stopped being true when the one-time allocator was corrected and
    // retail now funds EDR in year one, which leaves it with zero gaps and
    // nothing for a holding to close.
    //
    // So each half is now asserted where it is observable. Retail still shows
    // the holding *covering* more (7 to 9). The manufacturer is the preset that
    // genuinely has no EDR in year one, and shows the holding *closing gaps*
    // (9 to 3). Splitting them is what stops this test being quietly satisfied
    // by a scenario in which nothing is being tested at all.
    const coveredIn = (result: ReturnType<typeof runScenario>) =>
      result.coverage.frameworks
        .filter((framework) => framework.inScope)
        .reduce((total, framework) => total + framework.coveredControls, 0);

    const gapsIn = (result: ReturnType<typeof runScenario>) =>
      result.coverage.frameworks
        .filter((framework) => framework.inScope)
        .reduce((total, framework) => total + framework.gapControls, 0);

    const without = runScenario(profileOf([]), retailer.inventory);
    const with_ = runScenario(profileOf(['microsoft-defender-for-endpoint']), retailer.inventory);
    expect(coveredIn(with_)).toBeGreaterThan(coveredIn(without));

    // The gap half, on a preset whose year-one stack genuinely lacks EDR.
    const plant = presets.find((preset) => preset.id === 'manufacturer-two-plants');
    if (plant === undefined) throw new Error('expected the manufacturer preset');
    const plantProfile = (retainedTools: string[]) => ({
      ...plant.profile,
      orgName: plant.name,
      retainedTools,
    });

    const plantWithout = runScenario(plantProfile([]), plant.inventory);
    const plantWith = runScenario(
      plantProfile(['microsoft-defender-for-endpoint']),
      plant.inventory,
    );

    // The premise this half rests on, asserted rather than assumed, so it fails
    // loudly if a future change funds EDR here too.
    expect(plantWithout.recommended.selections.some((s) => s.category === 'edr')).toBe(false);
    expect(gapsIn(plantWith)).toBeLessThan(gapsIn(plantWithout));
  });

  it('says the control is closed by a holding and not by the quote', () => {
    // A client reading "covered" has to be able to tell what they are paying
    // for from what they already have. Otherwise the coverage figure quietly
    // includes things the quote does not buy.
    const result = runScenario(profileOf(['microsoft-defender-for-endpoint']), retailer.inventory);
    const rationale = result.coverage.frameworks
      .flatMap((framework) => framework.controls)
      .flatMap((control) => control.rationale)
      .join(' ');

    expect(rationale).toContain('already owns');
  });

  it('does not change the denominator', () => {
    // Addressability is a property of the control, never of what the client
    // happens to own. If a holding could pull a control into or out of the
    // denominator, two clients with the same obligations would be scored out of
    // different totals and §8.1's comparison would mean nothing.
    const without = runScenario(profileOf([]), retailer.inventory);
    const with_ = runScenario(profileOf(['microsoft-defender-for-endpoint']), retailer.inventory);

    const addressable = (result: typeof without) =>
      result.coverage.frameworks.map((framework) => framework.addressableControls).join(',');

    expect(addressable(with_)).toBe(addressable(without));
  });

  it('ignores a retained id the catalog does not carry', () => {
    // The analyst typed what the client said. A catalog that does not carry it
    // is StackFit's gap, not theirs, and it must not throw or silently drop the
    // rest of the list.
    const real = runScenario(profileOf(['microsoft-defender-for-endpoint']), retailer.inventory);
    const withNoise = runScenario(
      profileOf(['microsoft-defender-for-endpoint', 'some-tool-we-have-never-heard-of']),
      retailer.inventory,
    );

    const covered = (result: typeof real) =>
      result.coverage.frameworks.map((framework) => framework.coveredControls).join(',');

    expect(covered(withNoise)).toBe(covered(real));
  });
});

describe('a category the client already runs', () => {
  const bank = presets.find((preset) => preset.id === 'bank-60-branches');
  if (bank === undefined) throw new Error('expected the bank preset');

  const bankProfile = (retainedTools: string[]) => ({
    ...bank.profile,
    orgName: bank.name,
    retainedTools,
  });

  it('is not quoted, in any bundle', () => {
    // The reviewer's decision, 2026-09-12: do not re-buy what they own. A bank
    // that opens the call saying it keeps CrowdStrike should not be handed a
    // quote for a second EDR, and that includes Ideal: "what would you buy with
    // no budget limit" is still a question about what they need.
    const without = runScenario(bankProfile([]), bank.inventory);
    const keeping = runScenario(bankProfile(['crowdstrike-falcon-go']), bank.inventory);

    const edrIn = (bundle: { selections: readonly { category: string }[] }) =>
      bundle.selections.filter((selection) => selection.category === 'edr').length;

    expect(edrIn(without.recommended)).toBeGreaterThan(0);
    for (const bundle of [keeping.recommended, keeping.essential, keeping.phase2]) {
      expect(edrIn(bundle)).toBe(0);
    }
  });

  it('costs the client less by exactly what it stopped quoting', () => {
    const without = runScenario(bankProfile([]), bank.inventory);
    const keeping = runScenario(bankProfile(['crowdstrike-falcon-go']), bank.inventory);

    const edr = without.recommended.selections.find((selection) => selection.category === 'edr');
    expect(edr).toBeDefined();
    expect(keeping.recommended.annualSpend.amountMinor).toBe(
      without.recommended.annualSpend.amountMinor - edr!.annualSpend.amountMinor,
    );
  });

  it('does not report the category as an unfunded obligation', () => {
    // `unfundedMandatory` means "compliance demands this and the budget could
    // not buy it". A holding that meets the obligation is not that, and raising
    // it as one would be a false alarm on a compliance line.
    const keeping = runScenario(bankProfile(['crowdstrike-falcon-go']), bank.inventory);
    expect(keeping.recommended.unfundedMandatory).not.toContain('edr');
  });

  it('names the holding in the proposal a client actually reads', () => {
    // The rationale reaches the assumptions panel. This reaches the DOCX and
    // the PDF, which is where a reader counts thirteen categories in the
    // coverage matrix against twelve in the stack table and wonders what
    // happened to the thirteenth. The first version of this fix was silent
    // there, which is a worse answer than quoting the category twice.
    const keeping = runScenario(bankProfile(['crowdstrike-falcon-go']), bank.inventory);
    const document = JSON.stringify(proposalFor(keeping, bankProfile(['crowdstrike-falcon-go'])));

    expect(document).toContain('already runs it and is keeping it');
    expect(document).toContain('CrowdStrike Falcon Go');
  });

  it('says so in the rationale, rather than letting the category vanish', () => {
    // A category disappearing from a quote without explanation is a worse
    // answer than quoting it twice. This line is also what carries the fact
    // into the DOCX and the PDF, which render the same rationale.
    const keeping = runScenario(bankProfile(['crowdstrike-falcon-go']), bank.inventory);
    const said = keeping.recommended.rationale.join(' ');

    expect(said).toContain('already runs');
    expect(said).toContain('CrowdStrike Falcon Go');
  });
});
