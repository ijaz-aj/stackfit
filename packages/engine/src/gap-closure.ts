// What it would take to close the gaps, as a budget rather than a wish.
//
// `coverage.ts` already answers "what is not covered" and "what would close
// each one". This turns that into the question the analyst is actually in the
// room to answer: what budget does this client need, and what will still not be
// closed when they have it.
//
// Three things this deliberately refuses to do, because each would be a lie a
// client could act on:
//
//   1. It never counts an unclosable gap as closeable. A control no product in
//      the catalog claims is named and excluded from the plan; a plan that
//      quietly dropped it would promise a coverage figure it cannot reach.
//   2. It never promises the resulting coverage. Raising a budget makes the
//      engine re-optimise, and re-optimising can pick different products. The
//      plan states the budget; the caller re-runs the pipeline and reports what
//      actually happened. Promising here and verifying nowhere is how a tool
//      ends up confidently wrong in front of a client.
//   3. It never implies compliance. Coverage is what a product *claims*, not
//      what an assessor accepts, and `coverageDisclaimer()` still applies to
//      every figure downstream of this.
//
// Pure: no fs, no clock, no randomness.

import type { CurrencyCode, Money } from '@stackfit/schema';

import type { CoverageResult, RemediationOption } from './coverage';
import { addMoney, moneyInWords, sumMoney, zeroMoney } from './money';
import type { Bundle } from './portfolio';

/**
 * Why a gap is still open, and therefore what would actually close it.
 *
 * "Something in the catalog closes this control" is not the same claim as
 * "more money closes this control", and conflating them was a real defect: a
 * plan offered to close seven gaps on the SaaS preset by raising the budget,
 * and closed none, because five of them needed a category the year-one weight
 * gate defers at any budget and two needed a different product inside a
 * category that was already funded.
 */
export type GapBlocker =
  /**
   * No category that could close this is in year one.
   *
   * Deliberately *not* split into "budget" and "scope" here, because the two
   * cannot be told apart statically: `phase2` holds everything with real weight
   * that year one did not fund, which includes both the categories the budget
   * blocked and the ones the year-one weight gate deferred. Guessing produced a
   * plan that offered to close seven gaps on the SaaS preset by raising the
   * budget and closed none of them.
   *
   * Which one it is gets settled by running it: the action raises the caps,
   * re-runs, and keeps the change only if it demonstrably helped.
   */
  | 'category_not_funded'
  /**
   * The category is funded, with a product that does not claim this control.
   * A swap inside the category closes it; more money does not.
   */
  | 'product_swap'
  /** Nothing in the catalog claims it. No budget and no swap closes it. */
  | 'unclosable';

export interface ClassifiedGap {
  readonly controlId: string;
  readonly title: string;
  readonly mandatory: boolean;
  readonly blocker: GapBlocker;
  /** The product that would close it, where one exists. */
  readonly closerProductId: string | null;
  readonly explanation: string;
}

export interface GapClosurePlan {
  readonly currency: CurrencyCode;
  /** Purchases the plan would make. The engine's own remediation list. */
  readonly purchases: readonly RemediationOption[];
  /** Every open gap, with what is actually blocking it. */
  readonly classified: readonly ClassifiedGap[];
  /**
   * Gaps whose closing category is not in year one at all.
   *
   * These are the ones a budget increase *might* close, and the only ones the
   * action offers to try. Whether budget or year-one scope is the reason
   * cannot be known statically, so the action settles it by running and keeps
   * the change only if coverage actually improved.
   */
  readonly closeableByBudget: number;
  /** Always zero; kept so the shape is stable. See `GapBlocker`. */
  readonly needDeferredCategory: number;
  /** Gaps needing a different product inside a funded category. */
  readonly needProductSwap: number;
  /** Addressable gaps with a closer somewhere in the catalog. */
  readonly closeableGapCount: number;
  /** Of those, the ones a selected framework marks mandatory. */
  readonly closeableMandatoryCount: number;
  /**
   * Controls no purchase can close, named rather than dropped.
   *
   * These are why "close every gap" is not a button this product can honestly
   * offer. Policy, process, physical custody and cryptography are closed by
   * people and paperwork, and a tool that implied otherwise would be selling
   * compliance it cannot deliver.
   */
  readonly unclosableGaps: readonly string[];
  /** Extra annual procurement over what the bundle already spends. */
  readonly additionalAnnual: Money;
  readonly additionalOneTime: Money;
  /** Extra administration effort. People are never money here. */
  readonly additionalOpsFte: number;
  /** Annual cap that would accommodate the bundle plus these purchases. */
  readonly requiredAnnualCap: Money;
  readonly requiredOneTimeCap: Money;
  /** True when the current caps already accommodate the plan. */
  readonly alreadyAffordable: boolean;
  readonly rationale: readonly string[];
}

/**
 * Turn a coverage result into a budget.
 *
 * `budget` is the client's stated caps. A null cap is "not stated", not
 * "unlimited", and the required figure is reported the same way either way:
 * what the stack plus the fixes actually costs.
 */
export function planGapClosure(
  bundle: Bundle,
  coverage: CoverageResult,
  budget: { readonly annualCap: Money | null; readonly oneTimeCap: Money | null },
  /**
   * What year one deliberately left for later.
   *
   * Needed to tell "this category is unfunded because the money ran out" from
   * "this category is deferred by the year-one weight gate and no budget
   * changes that". Optional so existing callers keep working, and absent it
   * every non-funded category reads as a budget problem, which is the
   * behaviour this argument exists to correct.
   */
  phase2?: Bundle,
): GapClosurePlan {
  const currency = bundle.currency;

  const additionalAnnual = coverage.remediationAnnualSpend;
  const additionalOneTime = coverage.remediationOneTime;
  const requiredAnnualCap = addMoney(bundle.annualSpend, additionalAnnual);
  const requiredOneTimeCap = addMoney(bundle.oneTime, additionalOneTime);

  /*
   * Counted from the gap list rather than from the remediation list, because
   * one purchase closes several gaps and the two are not interchangeable. A
   * gap is closeable when something in the catalog actually claims its control.
   */
  const unclosable = new Set(coverage.unclosableGaps);
  const closeable = coverage.gaps.filter((gap) => !unclosable.has(gap.controlId));
  const closeableMandatory = closeable.filter((gap) => gap.mandatory && gap.inScope);

  const funded = new Set(bundle.selections.map((selection) => selection.category));
  const deferred = new Set((phase2?.selections ?? []).map((selection) => selection.category));

  /*
   * Why each gap is open, which is a different question from whether anything
   * in the catalog closes it. Four answers, and only one of them is money.
   */
  const classified: ClassifiedGap[] = coverage.gaps.map((gap) => {
    if (unclosable.has(gap.controlId) || gap.cheapestCloser === null) {
      return {
        controlId: gap.controlId,
        title: gap.title,
        mandatory: gap.mandatory && gap.inScope,
        blocker: 'unclosable' as const,
        closerProductId: null,
        explanation:
          'No product in the catalog claims this control. It is closed by policy, process, ' +
          'evidence or an assessor, and no budget reaches it.',
      };
    }

    const closer = gap.cheapestCloser;
    const satisfiable = gap.satisfiedBy;
    const someCategoryFunded = satisfiable.some((category) => funded.has(category));

    if (someCategoryFunded) {
      return {
        controlId: gap.controlId,
        title: gap.title,
        mandatory: gap.mandatory && gap.inScope,
        blocker: 'product_swap' as const,
        closerProductId: closer.productId,
        explanation:
          `The bundle already funds a category that could close this, with a product that does ` +
          `not claim the control. ${closer.productName} does. This is a swap inside the ` +
          'category, not more money.',
      };
    }

    return {
      controlId: gap.controlId,
      title: gap.title,
      mandatory: gap.mandatory && gap.inScope,
      blocker: 'category_not_funded' as const,
      closerProductId: closer.productId,
      explanation:
        `Closed by ${satisfiable.join(' or ')}, and year one funds none of them. ` +
        `${closer.productName} would close it. Whether that is the budget or the year-one ` +
        `scope is settled by trying it${deferred.size > 0 ? '; Phase 2 already prices the category' : ''}.`,
    };
  });

  const countOf = (blocker: GapBlocker) =>
    classified.filter((entry) => entry.blocker === blocker).length;
  const closeableByBudget = countOf('category_not_funded');
  const needDeferredCategory = 0;
  const needProductSwap = countOf('product_swap');

  const withinCap = (needed: Money, cap: Money | null): boolean =>
    cap === null || needed.amountMinor <= cap.amountMinor;
  const alreadyAffordable =
    withinCap(requiredAnnualCap, budget.annualCap) &&
    withinCap(requiredOneTimeCap, budget.oneTimeCap);

  const rationale: string[] = [];

  if (coverage.gaps.length === 0) {
    rationale.push('Nothing to close: every control a purchase could satisfy is already covered.');
  } else if (closeable.length === 0) {
    rationale.push(
      `None of the ${coverage.gaps.length} remaining ${coverage.gaps.length === 1 ? 'gap' : 'gaps'} ` +
        'can be closed by a purchase. No budget changes this, and the catalog is not the ' +
        'constraint: these controls are closed by policy, process, evidence or an assessor.',
    );
  } else {
    /*
     * Split by blocker, because "seven gaps have a fix in the catalog" is not
     * the same claim as "seven gaps close if you spend more", and offering the
     * second when only the first is true is a button that does nothing.
     */
    if (closeableByBudget > 0) {
      rationale.push(
        `${closeableByBudget} of ${coverage.gaps.length} remaining ` +
          `${coverage.gaps.length === 1 ? 'gap' : 'gaps'} close by funding a category the budget ` +
          `is currently stopping, for ${moneyInWords(additionalAnnual)} a year and ` +
          `${moneyInWords(additionalOneTime)} to stand up. That takes the annual figure to ` +
          `${moneyInWords(requiredAnnualCap)} and the one-time to ` +
          `${moneyInWords(requiredOneTimeCap)}.`,
      );
    }

    if (needProductSwap > 0) {
      rationale.push(
        `${needProductSwap} ${needProductSwap === 1 ? 'gap is' : 'gaps are'} in a category the ` +
          'bundle already funds, with a product that does not claim the control. A swap inside ' +
          'the category closes them and more money does not.',
      );
    }

    if (closeableMandatory.length > 0) {
      rationale.push(
        `${closeableMandatory.length} of them ${closeableMandatory.length === 1 ? 'is' : 'are'} ` +
          'a control a selected framework marks mandatory, which is the part of this that is ' +
          'not a judgement call.',
      );
    }

    if (coverage.remediationOpsFte > 0) {
      rationale.push(
        `It also adds ${coverage.remediationOpsFte.toFixed(2)} FTE of administration effort. ` +
          'That is people, not money, and it is not in the figures above.',
      );
    }
  }

  if (unclosable.size > 0) {
    rationale.push(
      `⚠ ${unclosable.size} ${unclosable.size === 1 ? 'control' : 'controls'} cannot be closed by ` +
        'any purchase and will remain open at any budget: ' +
        `${coverage.unclosableGaps.slice(0, 6).join(', ')}` +
        `${unclosable.size > 6 ? ', and others' : ''}. Closing those is policy, process and ` +
        'evidence, and no line in this plan buys them.',
    );
  }

  if (closeableByBudget > 0) {
    rationale.push(
      alreadyAffordable
        ? 'The stated budget already accommodates this. The gaps are open because the ' +
            'recommendation optimised within the budget rather than for coverage, so applying ' +
            'this plan changes what is bought and not what it costs.'
        : 'The stated budget does not accommodate this, so applying the plan raises the caps to ' +
            'the figures above.',
    );
    /*
     * Stated every time, because the alternative is a number that reads as a
     * promise. Raising a cap re-runs the whole selection and the engine may
     * reach the same coverage by a different route, or a slightly different
     * one. The caller verifies; nothing here is entitled to claim a result.
     */
    rationale.push(
      'These figures are what the fixes cost on top of the current stack. Applying them re-runs ' +
        'the recommendation, which can choose differently at the larger budget, so the coverage ' +
        'that results is reported from that run rather than predicted here.',
    );
  }

  return {
    currency,
    purchases: coverage.remediation,
    classified,
    closeableByBudget,
    needDeferredCategory,
    needProductSwap,
    closeableGapCount: closeable.length,
    closeableMandatoryCount: closeableMandatory.length,
    unclosableGaps: coverage.unclosableGaps,
    additionalAnnual,
    additionalOneTime,
    additionalOpsFte: coverage.remediationOpsFte,
    requiredAnnualCap,
    requiredOneTimeCap,
    alreadyAffordable,
    rationale,
  };
}

/** Totals for a set of remediation options, for callers assembling a subset. */
export function totalOf(
  options: readonly RemediationOption[],
  currency: CurrencyCode,
): { annual: Money; oneTime: Money } {
  return {
    annual:
      options.length === 0
        ? zeroMoney(currency)
        : sumMoney(
            currency,
            options.map((option) => option.annualSpend),
          ),
    oneTime:
      options.length === 0
        ? zeroMoney(currency)
        : sumMoney(
            currency,
            options.map((option) => option.oneTime),
          ),
  };
}
