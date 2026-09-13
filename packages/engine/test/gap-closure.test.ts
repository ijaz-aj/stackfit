import { describe, expect, it } from 'vitest';
import type { Money } from '@stackfit/schema';

import type { CoverageResult, RemediationOption } from '../src/coverage';
import { planGapClosure } from '../src/gap-closure';
import type { Bundle } from '../src/portfolio';

const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' as const });

function remediation(productId: string, annual: number, oneTime: number): RemediationOption {
  return {
    productId,
    productName: productId,
    vendor: 'v',
    category: 'edr',
    tierId: 't',
    tierName: 'T',
    upgradeFromTierId: null,
    upgradeFromTierName: null,
    annualSpend: usd(annual),
    oneTime: usd(oneTime),
    tco: usd(annual * 3 + oneTime),
    closesControls: [],
    opsFte: 0,
    rationale: [],
  } as unknown as RemediationOption;
}

/**
 * `closer: false` is a control nothing in the catalog claims, which is the
 * shape `unclosableGaps` describes. The default has a closer, so it reaches the
 * classification paths rather than short-circuiting as unclosable.
 */
function gap(controlId: string, mandatory: boolean, closer = true) {
  return {
    controlId,
    title: controlId,
    mandatory,
    inScope: true,
    residualRisk: 'high',
    satisfiedBy: ['edr'],
    cheapestCloser: closer
      ? { productId: 'closer-product', productName: 'Closer', closesFully: true }
      : null,
    remediationProductId: closer ? 'closer-product' : null,
    rationale: [],
  } as unknown as CoverageResult['gaps'][number];
}

function coverageOf(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    gaps: [],
    remediation: [],
    remediationAnnualSpend: usd(0),
    remediationOneTime: usd(0),
    remediationOpsFte: 0,
    unclosableGaps: [],
    ...overrides,
  } as unknown as CoverageResult;
}

const bundle = {
  currency: 'USD' as const,
  annualSpend: usd(100_000),
  oneTime: usd(50_000),
  // No category funded, so a gap with a closer classifies as
  // `category_not_funded` rather than `product_swap`.
  selections: [],
} as unknown as Bundle;

const noBudget = { annualCap: null, oneTimeCap: null };

describe('planGapClosure', () => {
  it('says there is nothing to do when nothing is open', () => {
    const plan = planGapClosure(bundle, coverageOf(), noBudget);

    expect(plan.closeableGapCount).toBe(0);
    expect(plan.rationale.join(' ')).toMatch(/Nothing to close/);
  });

  it('adds the fixes on top of what the bundle already spends', () => {
    const plan = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('a', false), gap('b', false)],
        remediation: [remediation('p', 30_000, 20_000)],
        remediationAnnualSpend: usd(30_000),
        remediationOneTime: usd(20_000),
      }),
      noBudget,
    );

    expect(plan.additionalAnnual).toEqual(usd(30_000));
    expect(plan.requiredAnnualCap).toEqual(usd(130_000));
    expect(plan.requiredOneTimeCap).toEqual(usd(70_000));
  });

  /**
   * The rule that matters most. A control nothing in the catalog closes must
   * never be counted as closeable, or the plan promises a coverage figure no
   * budget can reach.
   */
  it('never counts a gap no purchase can close', () => {
    const plan = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('buyable', false), gap('policy-only', false, false)],
        unclosableGaps: ['policy-only'],
        remediation: [remediation('p', 10_000, 5_000)],
        remediationAnnualSpend: usd(10_000),
        remediationOneTime: usd(5_000),
      }),
      noBudget,
    );

    expect(plan.closeableGapCount).toBe(1);
    expect(plan.closeableByBudget).toBe(1);
    expect(plan.unclosableGaps).toEqual(['policy-only']);
    expect(plan.rationale.join(' ')).toMatch(/cannot be closed by any purchase/);
    expect(plan.rationale.join(' ')).toMatch(/remain open at any budget/);
  });

  it('says so plainly when no budget closes anything', () => {
    const plan = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('policy-a', false, false), gap('policy-b', false, false)],
        unclosableGaps: ['policy-a', 'policy-b'],
      }),
      noBudget,
    );

    expect(plan.closeableGapCount).toBe(0);
    expect(plan.rationale.join(' ')).toMatch(/No budget changes this/);
  });

  it('counts the mandatory subset separately, because it is not a judgement call', () => {
    const plan = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('m1', true), gap('m2', true), gap('optional', false)],
        remediation: [remediation('p', 10_000, 5_000)],
        remediationAnnualSpend: usd(10_000),
        remediationOneTime: usd(5_000),
      }),
      noBudget,
    );

    expect(plan.closeableGapCount).toBe(3);
    expect(plan.closeableMandatoryCount).toBe(2);
    expect(plan.rationale.join(' ')).toMatch(/not a judgement call/);
  });

  it('reports added effort as people, never folded into the money', () => {
    const plan = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('a', false)],
        remediation: [remediation('p', 10_000, 5_000)],
        remediationAnnualSpend: usd(10_000),
        remediationOneTime: usd(5_000),
        remediationOpsFte: 0.42,
      }),
      noBudget,
    );

    expect(plan.additionalOpsFte).toBe(0.42);
    expect(plan.additionalAnnual).toEqual(usd(10_000));
    expect(plan.rationale.join(' ')).toMatch(/people, not money/);
  });

  it('knows when the stated budget already covers the plan', () => {
    const affordable = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('a', false)],
        remediation: [remediation('p', 10_000, 5_000)],
        remediationAnnualSpend: usd(10_000),
        remediationOneTime: usd(5_000),
      }),
      { annualCap: usd(500_000), oneTimeCap: usd(500_000) },
    );
    const not = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('a', false)],
        remediation: [remediation('p', 10_000, 5_000)],
        remediationAnnualSpend: usd(10_000),
        remediationOneTime: usd(5_000),
      }),
      { annualCap: usd(105_000), oneTimeCap: usd(50_000) },
    );

    expect(affordable.alreadyAffordable).toBe(true);
    expect(affordable.rationale.join(' ')).toMatch(/already accommodates this/);
    expect(not.alreadyAffordable).toBe(false);
    expect(not.rationale.join(' ')).toMatch(/raises the caps/);
  });

  /**
   * The defect this classification exists for. A gap inside a category the
   * bundle already funds does not move for money: the bundle bought something
   * there, and it does not claim the control. Offering to fix that by raising
   * the budget produced a button that ran, reported success, and changed
   * nothing on the SaaS preset.
   */
  it('does not call a funded category a budget problem', () => {
    const funded = {
      ...bundle,
      selections: [{ category: 'edr', productId: 'something-else' }],
    } as unknown as Bundle;

    const plan = planGapClosure(
      funded,
      coverageOf({
        gaps: [gap('a', false)],
        remediation: [remediation('p', 10_000, 5_000)],
        remediationAnnualSpend: usd(10_000),
        remediationOneTime: usd(5_000),
      }),
      noBudget,
    );

    expect(plan.classified[0]?.blocker).toBe('product_swap');
    expect(plan.closeableByBudget).toBe(0);
    expect(plan.needProductSwap).toBe(1);
    expect(plan.rationale.join(' ')).toMatch(/swap inside the category/);
    expect(plan.rationale.join(' ')).toMatch(/more money does not/);
  });

  it('explains every open gap, leaving none unaccounted for', () => {
    const plan = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('a', false), gap('b', true), gap('c', false, false)],
        unclosableGaps: ['c'],
      }),
      noBudget,
    );

    expect(plan.classified).toHaveLength(3);
    for (const entry of plan.classified) {
      expect(entry.explanation.length).toBeGreaterThan(20);
      expect(['category_not_funded', 'product_swap', 'unclosable']).toContain(entry.blocker);
    }
  });

  /**
   * The plan must never read as a promise. Raising a cap re-runs the whole
   * selection, which can choose differently, so the coverage that results is
   * reported from that run and not predicted here.
   */
  it('refuses to predict the coverage it would produce', () => {
    const plan = planGapClosure(
      bundle,
      coverageOf({
        gaps: [gap('a', false)],
        remediation: [remediation('p', 10_000, 5_000)],
        remediationAnnualSpend: usd(10_000),
        remediationOneTime: usd(5_000),
      }),
      noBudget,
    );
    const prose = plan.rationale.join(' ');

    expect(prose).toMatch(/re-runs the recommendation/);
    expect(prose).toMatch(/reported from that run rather than predicted/);
    expect(prose).not.toMatch(/100% covered/);
  });
});
