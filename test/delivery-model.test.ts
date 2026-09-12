// Does the delivery-model answer actually reach the recommendation? (Committed data.)
//
// This file was `soc-posture.test.ts` and asked whether `hasSoc` reached the
// engine. It did, eventually. The field it guarded is gone: every client this
// tool is pointed at is being onboarded into our SOC, so "do they have
// monitoring" had one answer and could not drive anything. `deliveryModel`
// replaced it and asks what actually varies, which is how much of the stack we
// take on.
//
// The unit tests in `packages/engine/test/scoring.test.ts` prove the weights
// move. This file asks the harder question: does anything a client would
// actually receive change, against the real catalog and the real presets?
//
// It drives off the committed presets rather than a profile invented here. A
// hand-built profile answers the question about itself and not about anything
// the product ships: the first draft of the file this replaces used one, found
// no difference, and was wrong, because the preset it was imitating differs in
// budget and procurement bias and those decide which ranking strategy runs.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPresets } from '@stackfit/data';
import { describe, expect, it } from 'vitest';

import { runScenario } from './scenarios/harness';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const presets = loadPresets(DATA_DIR);

const MODELS = ['mssp_managed', 'co_managed', 'client_operated'] as const;

/** Every product id in a bundle, order-independent. */
const idsOf = (selections: readonly { productId: string }[]) =>
  selections
    .map((selection) => selection.productId)
    .sort()
    .join(',');

const categoriesOf = (selections: readonly { category: string }[]) =>
  selections.map((selection) => selection.category);

describe('the delivery model, against the committed catalog and presets', () => {
  it('changes what at least one real preset is recommended', () => {
    // The regression this file exists for. If `deliveryModel` stops reaching
    // the weights, every model returns the same stack for every preset and this
    // goes red.
    const moved = presets.filter((preset) => {
      const results = MODELS.map((deliveryModel) =>
        runScenario({ ...preset.profile, orgName: preset.name, deliveryModel }, preset.inventory),
      );
      const bundles = results.flatMap((result) => [
        idsOf(result.recommended.selections),
        idsOf(result.phase2.selections),
      ]);
      return new Set(bundles).size > 2;
    });

    expect(
      moved.map((preset) => preset.id),
      'no committed preset changed on any delivery model',
    ).not.toHaveLength(0);
  });

  it('stops quoting a third-party MDR service on an engagement we operate', () => {
    // The commercial point, and the reason a weight modifier beat deleting the
    // category. MDR stays in the catalog for the engagements where the client
    // keeps their own response contract; it simply does not arise where we are
    // the monitoring, because then it is a second provider hired to do the job
    // we were hired for.
    for (const preset of presets) {
      const managed = runScenario(
        { ...preset.profile, orgName: preset.name, deliveryModel: 'mssp_managed' },
        preset.inventory,
      );

      for (const bundle of [managed.essential, managed.recommended, managed.phase2]) {
        expect(
          categoriesOf(bundle.selections),
          `${preset.id} ${bundle.kind} quotes a competitor's MDR`,
        ).not.toContain('mdr');
      }
    }
  });

  it('says why, rather than dropping the category silently', () => {
    // A category that vanishes without a sentence is indistinguishable from a
    // bug, and the analyst is the one who has to answer for it on the call.
    const preset = presets[0];
    if (preset === undefined) throw new Error('expected a preset');

    const managed = runScenario(
      { ...preset.profile, orgName: preset.name, deliveryModel: 'mssp_managed' },
      preset.inventory,
    );
    const mdr = managed.rankings.find((ranking) => ranking.category === 'mdr');

    expect(mdr?.weight).toBe(0);
    expect(mdr?.rationale.join(' ')).toContain('Not ranked under this engagement');
  });

  it('never changes the bundle for a preset that states no budget at all', () => {
    // Not a limitation so much as the shape of the engine, worth pinning so the
    // claim above is not read more broadly than it holds. Where the budget
    // cannot buy the mandatory set, `portfolio.ts` ranks on cheapest-acceptable
    // rather than on fit, and a cheapest-first ranking does not consult the fit
    // score at all. The delivery model still moves the weights; it just has
    // nothing left to decide.
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

    const stacks = MODELS.map((deliveryModel) =>
      idsOf(runScenario({ ...broke, deliveryModel }, preset.inventory).recommended.selections),
    );
    expect(new Set(stacks).size).toBe(1);
  });
});
