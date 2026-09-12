// A blank intake, through the whole pipeline and into the document.
//
// "Start blank" produces a valid `ClientProfile` and an empty `AssetInventory`.
// Every sizing figure derived from it is correctly zero, and the sizing stage
// has always said so in its rationale: "an empty inventory, not a small
// environment".
//
// Nothing downstream could read a rationale string. So the portfolio funded
// thirteen products, the cost engine put a three-year TCO on them, and the
// executive summary opened "operates an estate of 0 monitored assets ... This
// proposal recommends 13 security controls, costed over 3 years", in the
// document that goes to a client, with no hint anywhere in it that the
// inventory was never filled in.
//
// The arithmetic was right the whole time. What was missing is that an empty
// inventory is not a client with nothing to protect; it is an intake nobody has
// finished.

import { describe, expect, it } from 'vitest';

import { inventoryOf, profileOf, proposalFor, runScenario } from './scenarios/harness';

const EMPTY = inventoryOf({});
const profile = profileOf({ orgName: 'Blank client', employeeCount: 100, itStaffCount: 3 });
const result = runScenario(profile, EMPTY);

describe('sizing, with nothing captured', () => {
  it('derives zero for every ingest figure', () => {
    // Not a complaint, a check: the formulas must not produce a floor, a
    // default or a NaN when every count is zero.
    expect(result.sizing.epsTotal).toBe(0);
    expect(result.sizing.gbPerDay).toBe(0);
    expect(result.sizing.licensedGbPerDay).toBe(0);
    expect(result.sizing.storageTb).toBe(0);
    expect(result.sizing.monitoredAssetCount).toBe(0);
    expect(result.sizing.endpointCount).toBe(0);
    expect(result.sizing.serverCount).toBe(0);
  });

  it('still estimates privileged accounts, and says it estimated them', () => {
    // PAM licensing needs a number and analysts rarely capture one on a first
    // call. Estimating is defensible; pretending it was measured is not.
    expect(result.sizing.privilegedAccountCount).toBeGreaterThan(0);
    expect(result.sizing.privilegedAccountCountEstimated).toBe(true);
    expect(result.sizing.rationale.join(' ')).toContain('Confirm before sizing PAM');
  });

  it('reports the estate as uncaptured, separately from its scale class', () => {
    // `scaleClass` has to answer in one of four bands because products declare
    // their support in those bands, so an empty inventory comes back `small`:
    // the same answer a real 250-asset business gets. The two questions are
    // different and now have two answers.
    expect(result.sizing.scaleClass).toBe('small');
    expect(result.sizing.estateCaptured).toBe(false);
  });

  it('is not confused with a small estate that was actually captured', () => {
    const small = runScenario(profile, inventoryOf({ windowsEndpoints: 12 }));
    expect(small.sizing.scaleClass).toBe('small');
    expect(small.sizing.estateCaptured).toBe(true);
  });
});

describe('everything downstream of an uncaptured estate', () => {
  it('warns in every bundle, not only in the sizing rationale', () => {
    // The regression. Each bundle is read on its own, and a warning that lives
    // one stage upstream is a warning nobody sees.
    for (const bundle of [result.essential, result.operable, result.recommended, result.ideal]) {
      expect(bundle.rationale.join(' '), `${bundle.kind} is silent`).toContain(
        'not a recommendation yet',
      );
    }
  });

  it('warns in the proposal a client reads', () => {
    const document = JSON.stringify(proposalFor(result, profile));
    expect(document).toContain('No asset inventory was captured');
    expect(document).toContain('unfinished intake');
  });

  it('does not claim to recommend controls for an estate of zero', () => {
    // The specific sentence that was wrong. It is not enough to add a warning
    // above a claim that still contradicts it.
    const document = JSON.stringify(proposalFor(result, profile));
    expect(document).not.toContain('operates an estate of 0 monitored assets');
  });

  it('says nothing of the kind once an estate exists', () => {
    // The warning has to be absent in the normal case, or it is noise that
    // teaches people to skip it.
    const real = runScenario(profile, inventoryOf({ windowsEndpoints: 400, windowsServers: 20 }));
    const document = JSON.stringify(proposalFor(real, profile));

    expect(document).not.toContain('No asset inventory was captured');
    for (const bundle of [real.essential, real.recommended, real.ideal]) {
      expect(bundle.rationale.join(' ')).not.toContain('not a recommendation yet');
    }
  });
});
