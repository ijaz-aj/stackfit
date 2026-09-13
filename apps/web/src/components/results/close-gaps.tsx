'use client';

import type { GapClosurePlan } from '@stackfit/engine';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge, Button, Card, RationaleList } from '@/components/ui';
import { applyGapClosure, type GapClosureResult } from '@/lib/actions';
import { formatMoney, formatNumber } from '@/lib/format';

const BLOCKER_LABEL = {
  category_not_funded: 'category not in year one',
  product_swap: 'product swap',
  unclosable: 'not buyable',
} as const;

const BLOCKER_TONE = {
  category_not_funded: 'warn',
  product_swap: 'accent',
  unclosable: 'neutral',
} as const;

/**
 * What it would take to close the gaps, and a button that does it.
 *
 * The button raises the scenario's budget caps and re-runs the recommendation,
 * and it offers that *only* for the gaps budget actually blocks. A gap needing
 * a category year one deferred on weight, or a different product inside a
 * category already funded, does not move for money: offering to fix those was
 * a real defect, caught by a test that applied the plan to the SaaS preset and
 * found it closed none of the seven gaps it claimed.
 *
 * It never promises a coverage figure either. Raising a cap re-runs the whole
 * selection and the engine can reach a different stack at the larger budget, so
 * the result is read back off that run and reported as before/after.
 *
 * Three things it refuses to imply, each of which would be a lie a client could
 * act on:
 *
 *   - that every gap closes. Controls no product claims are excluded from the
 *     plan, counted separately, and still listed after it runs.
 *   - that the budget is ours to lower. The action only ever raises a cap; the
 *     client's stated budget is their statement, not the tool's.
 *   - that coverage is compliance. The disclaimer above the number still holds
 *     and is not softened by anything on this card.
 */
export function CloseGaps({ scenarioId, plan }: { scenarioId: string; plan: GapClosurePlan }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GapClosureResult | null>(null);

  // The button may only offer what money actually fixes.
  const nothingToDo = plan.closeableByBudget === 0;

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await applyGapClosure({ id: scenarioId });
      setResult(outcome);
      if (outcome.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className="min-w-0"
      title="Closing the gaps"
      hint={
        nothingToDo
          ? 'Nothing here moves for money. Every open control is in a funded category or is not buyable.'
          : `${plan.closeableByBudget} of the open controls need a category year one does not fund.`
      }
    >
      {!nothingToDo && (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Figure label="Extra, per year" value={formatMoney(plan.additionalAnnual)} />
            <Figure label="Extra, to stand up" value={formatMoney(plan.additionalOneTime)} />
            <Figure
              label="Extra admin effort"
              value={`${formatNumber(plan.additionalOpsFte, 2)} FTE`}
            />
          </dl>

          <div className="border-line mt-3 border-t pt-3">
            <h4 className="text-faint text-2xs mb-1.5 font-medium tracking-wide uppercase">
              What it would buy
            </h4>
            <ul className="flex flex-col gap-1">
              {plan.purchases.map((option) => (
                <li
                  key={`${option.productId}::${option.tierId}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
                >
                  <span className="text-muted min-w-0">
                    {option.productName}
                    <span className="text-faint"> · {option.tierName}</span>
                  </span>
                  <span className="tabular text-ink shrink-0">
                    {formatMoney(option.annualSpend)}/yr
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/*
        Every open control, grouped by what is actually stopping it. This is
        the part the reader came for: "9 gaps" is not something an analyst can
        take to a client, and "5 of them need a category you deferred" is.
      */}
      {plan.classified.length > 0 && (
        <div className="border-line mt-3 border-t pt-3">
          <h4 className="text-faint text-2xs mb-1.5 font-medium tracking-wide uppercase">
            What is blocking each one
          </h4>
          <ul className="flex flex-col gap-2">
            {plan.classified.map((gap) => (
              <li key={gap.controlId} className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="tabular text-ink text-xs">{gap.controlId}</span>
                  <Badge tone={BLOCKER_TONE[gap.blocker]}>{BLOCKER_LABEL[gap.blocker]}</Badge>
                  {gap.mandatory && <span className="text-bad text-2xs">obligation</span>}
                </div>
                <p className="text-faint mt-0.5 text-xs leading-snug">
                  {gap.title}. {gap.explanation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.unclosableGaps.length > 0 && (
        <div className="border-line mt-3 border-t pt-3">
          <h4 className="text-warn text-2xs mb-1.5 font-medium tracking-wide uppercase">
            {plan.unclosableGaps.length} of these no purchase closes, at any budget
          </h4>
          <ul className="flex flex-wrap gap-1">
            {plan.unclosableGaps.map((controlId) => (
              <li
                key={controlId}
                className="border-line bg-panel-raised text-muted tabular min-w-0 rounded border px-2 py-0.5 text-xs"
              >
                {controlId}
              </li>
            ))}
          </ul>
          <p className="text-faint mt-1.5 text-xs leading-snug">
            These are closed by policy, process, evidence or an assessor. The button below does not
            touch them and the figures above exclude them.
          </p>
        </div>
      )}

      <div className="border-line mt-3 border-t pt-3">
        <RationaleList lines={plan.rationale} />
      </div>

      {!nothingToDo && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={run} disabled={busy}>
            {busy ? 'Applying…' : 'Raise the budget and re-run'}
          </Button>
          <span className="text-faint text-xs leading-snug">
            Tries {formatMoney(plan.requiredAnnualCap)}/yr and {formatMoney(plan.requiredOneTimeCap)}{' '}
            one-time, re-runs, and keeps the change only if it actually closed something.
          </span>
        </div>
      )}

      {result !== null && (
        <div className="border-line mt-3 border-t pt-3">
          {result.ok ? (
            <>
              {/*
                Before and after, from two real pipeline runs. Not a prediction:
                the larger budget re-runs the selection and can choose
                differently, which is exactly why this is measured rather than
                promised.
              */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">
                  {result.before?.coveragePercent ?? '–'}% → {result.after?.coveragePercent ?? '–'}%
                  covered
                </Badge>
                <Badge tone={(result.after?.gaps ?? 0) < (result.before?.gaps ?? 0) ? 'good' : 'warn'}>
                  {result.before?.gaps} → {result.after?.gaps} gaps
                </Badge>
              </div>
              <p className="text-muted mt-2 text-xs leading-snug">
                Budget now {result.appliedAnnualCap}/yr and {result.appliedOneTimeCap} one-time.
                {(result.stillOpen?.length ?? 0) > 0 && (
                  <>
                    {' '}
                    {result.stillOpen?.length} control
                    {result.stillOpen?.length === 1 ? '' : 's'} remain open because no purchase
                    closes {result.stillOpen?.length === 1 ? 'it' : 'them'}.
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="text-warn text-xs leading-snug">{result.problem}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint text-2xs tracking-wide uppercase">{label}</dt>
      <dd className="tabular text-ink mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
