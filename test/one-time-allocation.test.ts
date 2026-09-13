// The one-time budget is a second knapsack, and it was being filled greedily.
//
// Reported 2026-09-13 from the wizard readout: "Unfunded mandatory: edr.
// Stopped by the one-time budget, not the annual one." The message was
// correctly worded and the advice behind it was wrong. Funding every mandatory
// category for that client costs INR 1,368,500 of setup against a 2,000,000
// cap. The engine spent 1,972,250, funded five of six mandatory categories plus
// a discretionary one, and told the client to raise a budget that was never the
// constraint.
//
// Two faults, and both had to be fixed for either to help:
//
//   1. No selection objective ranked on implementation cost. `cheapest` ranks
//      on annual licence and `lowest_tco` on cost of ownership, so nothing
//      could see that one SKU costs four times another to stand up. `iam` took
//      Keycloak at 603,750 of setup (free to licence, so `cheapest` loved it)
//      and left 27,750 for an EDR needing 175,000.
//   2. `buildRecommended` compared its strategies on controls met and weighted
//      need and never on unfunded mandatory categories, so a bundle that
//      skipped a mandated category outright could win by claiming a couple more
//      optional controls somewhere else.
//
// Fault 1 means no strategy *generates* a good allocation; fault 2 means the
// comparison would not *pick* one if it existed. Sabotaging either turns tests
// below red, which is how the pair was confirmed to be minimal: a lookahead
// reservation inside the selection loop was also built, measured, and removed
// again once it proved to be a third mechanism doing what these two already do.
//
// These run against the committed catalog and the committed presets, because
// the defect was a property of real data and would not reproduce on a fixture.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPresets } from '@stackfit/data';
import { describe, expect, it } from 'vitest';

import { runScenario } from './scenarios/harness';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const presets = loadPresets(DATA_DIR);

const retailer = presets.find((preset) => preset.id === 'retail-chain-40-stores');
if (retailer === undefined) throw new Error('expected the retail preset');

/** The retail preset with its one-time cap set to a stated figure. */
function atOneTimeCap(majorUnits: number) {
  return runScenario(
    {
      ...retailer!.profile,
      orgName: retailer!.name,
      budget: {
        ...retailer!.profile.budget,
        oneTimeCap: { amountMinor: majorUnits * 100, currency: retailer!.profile.budget.currency },
      },
    },
    retailer!.inventory,
  );
}

/** Cheapest setup cost per category, over the candidates the engine considered. */
function minimumSetupForMandatory(result: ReturnType<typeof runScenario>): number {
  const mandatory = result.rankings.filter((ranking) => ranking.mandatory);
  return mandatory.reduce((total, ranking) => {
    const cheapest = result.candidates
      .filter((candidate) => candidate.category === ranking.category)
      .map(
        (candidate) =>
          Number(candidate.cost.implementationOneTime.amountMinor) +
          Number(candidate.cost.trainingOneTime.amountMinor),
      )
      .sort((a, b) => a - b)[0];
    return total + (cheapest ?? 0);
  }, 0);
}

describe('the one-time budget', () => {
  /**
   * The reported case, exactly. A cap comfortably above what the mandatory set
   * costs to stand up must fund all of it.
   */
  it('funds every mandatory category when the setup budget can afford them all', () => {
    const result = atOneTimeCap(2_000_000);
    const needed = minimumSetupForMandatory(result) / 100;

    // The premise, asserted so this test cannot pass by the cap being tight.
    expect(needed).toBeLessThan(2_000_000);
    expect(result.recommended.unfundedMandatory).toEqual([]);
  });

  it('still funds them at a cap only just above what they cost', () => {
    const result = atOneTimeCap(1_500_000);
    expect(minimumSetupForMandatory(result) / 100).toBeLessThan(1_500_000);
    expect(result.recommended.unfundedMandatory).toEqual([]);
  });

  /**
   * A category must not be starved by another category's avoidable
   * extravagance. Keycloak at 603,750 of setup against Cisco Duo at 161,000 is
   * the specific pair this is about: both satisfy the identity mandate, and
   * only one of them leaves room for the EDR mandate.
   */
  it('does not spend the setup budget on a dear SKU when a mandate still needs it', () => {
    const result = atOneTimeCap(2_000_000);
    const spent = Number(result.recommended.oneTime.amountMinor) / 100;

    expect(result.recommended.unfundedMandatory).toEqual([]);
    expect(spent).toBeLessThanOrEqual(2_000_000);
  });

  /**
   * Budget monotonicity in the one-time dimension. The annual dimension has
   * been pinned since Phase 4; this is the same guarantee for the cap that was
   * never checked, and it is the property the greedy fill broke.
   */
  it('never funds fewer mandatory categories when the setup budget goes up', () => {
    const caps = [250_000, 500_000, 1_000_000, 1_500_000, 2_000_000, 4_000_000];
    let previous = Number.POSITIVE_INFINITY;

    for (const cap of caps) {
      const unfunded = atOneTimeCap(cap).recommended.unfundedMandatory.length;
      expect(unfunded, `cap ${cap} funded fewer mandates than the cap below it`).toBeLessThanOrEqual(
        previous,
      );
      previous = unfunded;
    }
  });

  it('holds that guarantee for every committed preset', () => {
    for (const preset of presets) {
      let previous = Number.POSITIVE_INFINITY;
      for (const cap of [250_000, 1_000_000, 4_000_000, 8_000_000]) {
        const result = runScenario(
          {
            ...preset.profile,
            orgName: preset.name,
            budget: {
              ...preset.profile.budget,
              oneTimeCap: { amountMinor: cap * 100, currency: preset.profile.budget.currency },
            },
          },
          preset.inventory,
        );
        const unfunded = result.recommended.unfundedMandatory.length;
        expect(unfunded, `${preset.id} went backwards at cap ${cap}`).toBeLessThanOrEqual(previous);
        previous = unfunded;
      }
    }
  });

  /**
   * The infeasible case must still spend what it can. A fix that protects the
   * mandatory set by declining to buy anything would satisfy every test above
   * and be worse than the defect.
   */
  it('still spends what it can when the mandatory set cannot all be funded', () => {
    const result = atOneTimeCap(1_000_000);
    const needed = minimumSetupForMandatory(result) / 100;
    const spent = Number(result.recommended.oneTime.amountMinor) / 100;

    // The premise: this cap genuinely cannot fund everything.
    expect(needed).toBeGreaterThan(1_000_000);
    expect(result.recommended.unfundedMandatory.length).toBeGreaterThan(0);
    // But it must not sit on the money. Most of the cap should be working.
    expect(spent).toBeGreaterThan(900_000);
  });

  /** Every preset at its own committed budget still funds its mandates. */
  it('leaves no mandatory category unfunded at the committed budgets', () => {
    for (const preset of presets) {
      const result = runScenario({ ...preset.profile, orgName: preset.name }, preset.inventory);
      expect(result.recommended.unfundedMandatory, preset.id).toEqual([]);
    }
  });
});
