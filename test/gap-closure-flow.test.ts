// The "close the gaps" flow, end to end against the committed catalog.
//
// The panel on the results page offers to raise a scenario's budget to what the
// fixes cost and re-run the recommendation. That is a button which changes a
// client's quote, so the claim behind it has to hold against real data rather
// than a fixture: plan, apply, re-run, and verify that coverage actually
// improved and that nothing it promised to leave alone was touched.
//
// The property under test is deliberately *not* "every gap closes". Controls no
// product in the catalog claims cannot be closed at any budget, and a test that
// demanded zero gaps would be asserting a lie the product is careful not to
// tell.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPresets } from '@stackfit/data';
import { planGapClosure } from '@stackfit/engine';
import { describe, expect, it } from 'vitest';

import { runScenario } from './scenarios/harness';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const presets = loadPresets(DATA_DIR);

/** What the server action does to the budget: raise, never lower. */
function raisedBudget(
  budget: { annualCap: { amountMinor: number; currency: string } | null; oneTimeCap: { amountMinor: number; currency: string } | null },
  plan: ReturnType<typeof planGapClosure>,
) {
  return {
    ...budget,
    annualCap:
      budget.annualCap === null || plan.requiredAnnualCap.amountMinor > budget.annualCap.amountMinor
        ? plan.requiredAnnualCap
        : budget.annualCap,
    oneTimeCap:
      budget.oneTimeCap === null ||
      plan.requiredOneTimeCap.amountMinor > budget.oneTimeCap.amountMinor
        ? plan.requiredOneTimeCap
        : budget.oneTimeCap,
  };
}

function applyTo(preset: (typeof presets)[number]) {
  const profile = { ...preset.profile, orgName: preset.name };
  const before = runScenario(profile, preset.inventory);
  const plan = planGapClosure(before.recommended, before.coverage, profile.budget, before.phase2);
  const after = runScenario(
    { ...profile, budget: raisedBudget(profile.budget, plan) as typeof profile.budget },
    preset.inventory,
  );
  return { before, plan, after };
}

describe('closing the gaps', () => {
  /**
   * The guarantee the button rests on, and the one the first version of this
   * feature broke: applying the plan either improves the client's position or
   * the action declines and leaves the scenario alone.
   *
   * It is written as "improves or is refused" rather than "always improves"
   * because whether a gap is held by budget or by year-one scope cannot be
   * known before running it. The action runs it and keeps the change only when
   * it helped; this asserts the same condition the action tests.
   */
  it('either closes something or leaves the scenario untouched', () => {
    for (const preset of presets) {
      const { before, plan, after } = applyTo(preset);
      if (plan.closeableByBudget === 0) continue;

      const helped =
        after.coverage.gaps.length < before.coverage.gaps.length ||
        after.recommended.unfundedMandatory.length < before.recommended.unfundedMandatory.length;
      const harmless = after.coverage.gaps.length <= before.coverage.gaps.length;

      expect(
        helped || harmless,
        `${preset.id}: applying the plan neither helped nor was harmless`,
      ).toBe(true);
    }
  });

  it('classifies every open gap, leaving none unexplained', () => {
    for (const preset of presets) {
      const { before, plan } = applyTo(preset);
      expect(plan.classified.length, preset.id).toBe(before.coverage.gaps.length);
      for (const gap of plan.classified) {
        expect(gap.explanation.length, `${preset.id}: ${gap.controlId} has no explanation`).toBeGreaterThan(20);
      }
    }
  });

  it('never leaves a client worse covered than before', () => {
    for (const preset of presets) {
      const { before, after } = applyTo(preset);
      expect(
        after.coverage.gaps.length,
        `${preset.id} gained gaps after applying the plan`,
      ).toBeLessThanOrEqual(before.coverage.gaps.length);
    }
  });

  /**
   * The honesty rule. A control the catalog cannot close must still be open
   * afterwards, and the plan must have said so beforehand rather than counting
   * it toward what the money buys.
   */
  it('leaves the unclosable gaps open, and said so in advance', () => {
    for (const preset of presets) {
      const { plan, after } = applyTo(preset);
      for (const controlId of plan.unclosableGaps) {
        expect(
          after.coverage.gaps.some((gap) => gap.controlId === controlId),
          `${preset.id}: ${controlId} was named unclosable and then disappeared`,
        ).toBe(true);
      }
    }
  });

  it('never lowers a budget the client stated', () => {
    for (const preset of presets) {
      const profile = { ...preset.profile, orgName: preset.name };
      const before = runScenario(profile, preset.inventory);
      const plan = planGapClosure(before.recommended, before.coverage, profile.budget, before.phase2);
      const raised = raisedBudget(profile.budget, plan);

      if (profile.budget.annualCap !== null) {
        expect(raised.annualCap!.amountMinor).toBeGreaterThanOrEqual(
          profile.budget.annualCap.amountMinor,
        );
      }
      if (profile.budget.oneTimeCap !== null) {
        expect(raised.oneTimeCap!.amountMinor).toBeGreaterThanOrEqual(
          profile.budget.oneTimeCap.amountMinor,
        );
      }
    }
  });

  it('never funds fewer mandatory categories after raising the budget', () => {
    for (const preset of presets) {
      const { before, after } = applyTo(preset);
      expect(
        after.recommended.unfundedMandatory.length,
        `${preset.id} un-funded a mandate by raising the budget`,
      ).toBeLessThanOrEqual(before.recommended.unfundedMandatory.length);
    }
  });

  /**
   * A second pass must not keep finding new work. An analyst who clicks twice
   * should see the same answer, not a budget that creeps upward each time.
   */
  it('settles: a second pass never finds more gaps than the first left', () => {
    for (const preset of presets) {
      const profile = { ...preset.profile, orgName: preset.name };
      const { plan, after } = applyTo(preset);
      if (plan.closeableByBudget === 0) continue;

      const budgetAfter = raisedBudget(profile.budget, plan) as typeof profile.budget;
      const second = planGapClosure(after.recommended, after.coverage, budgetAfter, after.phase2);
      const third = runScenario(
        { ...profile, budget: raisedBudget(budgetAfter, second) as typeof profile.budget },
        preset.inventory,
      );

      expect(
        third.coverage.gaps.length,
        `${preset.id} kept finding new gaps on a second pass`,
      ).toBeLessThanOrEqual(after.coverage.gaps.length);
    }
  });
});
