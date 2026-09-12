// Does the SOC answer actually reach the recommendation? (Committed data.)
//
// `hasSoc` was asked at intake, stored, shown in the compare diff and read by
// no stage of the pipeline. A client with a 24/7 rota and a client with nobody
// watching received byte-identical recommendations, which is the oldest
// failure in security procurement written into an engine: a SIEM is a machine
// for producing alerts, and alerts nobody is rostered to triage are shelfware
// with a licence fee.
//
// The unit tests in `packages/engine/test/scoring.test.ts` prove the weights
// move. This file asks the harder question: does anything a client would
// actually receive change, against the real catalog and the real presets?
//
// It drives off the committed presets rather than a profile invented here. A
// hand-built profile answered the question about itself and not about anything
// the product ships: the first draft of this file used one, found no
// difference, and was wrong, because the preset it was imitating differs in
// budget and procurement bias and those decide which ranking strategy runs.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPresets } from '@stackfit/data';
import { describe, expect, it } from 'vitest';

import { runScenario } from './scenarios/harness';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const presets = loadPresets(DATA_DIR);

const POSTURES = ['none', 'business_hours', '24x7', 'outsourced'] as const;

/** Every product id in a bundle, order-independent. */
const idsOf = (selections: readonly { productId: string }[]) =>
  selections
    .map((selection) => selection.productId)
    .sort()
    .join(',');

describe('the SOC answer, against the committed catalog and presets', () => {
  it('changes what at least one real preset is recommended', () => {
    // The regression this file exists for. If `hasSoc` stops reaching the
    // weights, every posture returns the same stack for every preset and this
    // goes red.
    const moved = presets.filter((preset) => {
      const results = POSTURES.map((hasSoc) =>
        runScenario({ ...preset.profile, orgName: preset.name, hasSoc }, preset.inventory),
      );
      const bundles = results.flatMap((result) => [
        idsOf(result.recommended.selections),
        idsOf(result.ideal.selections),
        idsOf(result.operable.selections),
      ]);
      return new Set(bundles).size > 3;
    });

    expect(
      moved.map((preset) => preset.id),
      'no committed preset changed on any SOC posture',
    ).not.toHaveLength(0);
  });

  it('never changes the bundle for a preset that states no budget at all', () => {
    // Not a limitation so much as the shape of the engine, worth pinning so
    // the claim above is not read more broadly than it holds. Where the budget
    // cannot buy the mandatory set, `portfolio.ts` ranks on cheapest-acceptable
    // rather than on fit, and a cheapest-first ranking does not consult the fit
    // score at all. The SOC answer still moves the weights; it just has nothing
    // left to decide.
    const preset = presets.find((entry) => entry.id === 'hospital-300-beds');
    if (preset === undefined) throw new Error('expected the hospital preset');

    const broke = {
      ...preset.profile,
      orgName: preset.name,
      budget: {
        annualCap: { amountMinor: 100_00, currency: preset.profile.budget.currency },
        oneTimeCap: null,
        currency: preset.profile.budget.currency,
        horizonYears: 3,
      },
    };

    const stacks = POSTURES.map((hasSoc) =>
      idsOf(runScenario({ ...broke, hasSoc }, preset.inventory).recommended.selections),
    );
    expect(new Set(stacks).size).toBe(1);
  });
});
