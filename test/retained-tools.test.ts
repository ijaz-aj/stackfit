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

import { runScenario } from './scenarios/harness';

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
    // The retail preset cannot afford backup, so nothing in the recommended
    // stack covers it. A client who already runs Proxmox Backup Server has
    // those controls closed: the proposal should say so rather than quote them
    // a gap they closed years ago.
    const without = runScenario(profileOf([]), retailer.inventory);
    const with_ = runScenario(profileOf(['proxmox-backup-server']), retailer.inventory);

    const coveredIn = (result: typeof without) =>
      result.coverage.frameworks
        .filter((framework) => framework.inScope)
        .reduce((total, framework) => total + framework.coveredControls, 0);

    const gapsIn = (result: typeof without) =>
      result.coverage.frameworks
        .filter((framework) => framework.inScope)
        .reduce((total, framework) => total + framework.gapControls, 0);

    expect(coveredIn(with_)).toBeGreaterThan(coveredIn(without));
    expect(gapsIn(with_)).toBeLessThan(gapsIn(without));
  });

  it('says the control is closed by a holding and not by the quote', () => {
    // A client reading "covered" has to be able to tell what they are paying
    // for from what they already have. Otherwise the coverage figure quietly
    // includes things the quote does not buy.
    const result = runScenario(profileOf(['proxmox-backup-server']), retailer.inventory);
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
    const with_ = runScenario(profileOf(['proxmox-backup-server']), retailer.inventory);

    const addressable = (result: typeof without) =>
      result.coverage.frameworks.map((framework) => framework.addressableControls).join(',');

    expect(addressable(with_)).toBe(addressable(without));
  });

  it('ignores a retained id the catalog does not carry', () => {
    // The analyst typed what the client said. A catalog that does not carry it
    // is StackFit's gap, not theirs, and it must not throw or silently drop the
    // rest of the list.
    const real = runScenario(profileOf(['proxmox-backup-server']), retailer.inventory);
    const withNoise = runScenario(
      profileOf(['proxmox-backup-server', 'some-tool-we-have-never-heard-of']),
      retailer.inventory,
    );

    const covered = (result: typeof real) =>
      result.coverage.frameworks.map((framework) => framework.coveredControls).join(',');

    expect(covered(withNoise)).toBe(covered(real));
  });
});
