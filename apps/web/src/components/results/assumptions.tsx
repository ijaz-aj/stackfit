import type { Bundle, PipelineResult } from '@stackfit/engine';

import { Badge, Card } from '@/components/ui';

/**
 * §8.7 — the assumptions and disclaimers panel. "Always present, always
 * exported."
 *
 * This is the panel that decides whether the rest of the page is honest. Every
 * figure above it rests on a price with a provenance, a control list with a
 * grade, a labour rate that is an estimate and an FX rate with a date, and none
 * of that is visible in a total.
 */
export function AssumptionsPanel({
  result,
  bundle,
  fxAsOf,
  msspConfidence,
  msspAsOf,
  today,
}: {
  result: PipelineResult;
  bundle: Bundle;
  fxAsOf: string;
  msspConfidence: string;
  msspAsOf: string;
  today: string;
}) {
  const currencies = new Set(
    bundle.selections.map((selection) => selection.cost.currency as string),
  );
  const converted = currencies.size > 0 && !currencies.has('USD');

  return (
    <Card
      title="Assumptions and disclaimers"
      hint="Read this before any of the above reaches a client."
    >
      <section className="flex flex-col gap-1">
        <h3 className="text-muted text-[11px] font-semibold tracking-wide uppercase">
          Where each price came from
        </h3>
        {bundle.selections.length === 0 ? (
          <p className="text-faint text-[12px]">Nothing priced in this bundle.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {bundle.selections.map((selection) => (
              <li key={selection.productId} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                <span className="text-ink">{selection.productName}</span>
                <Badge
                  tone={
                    selection.cost.pricingConfidence === 'public_list' ||
                    selection.cost.pricingConfidence === 'vendor_quote'
                      ? 'good'
                      : selection.cost.pricingConfidence === 'placeholder'
                        ? 'bad'
                        : 'warn'
                  }
                >
                  {selection.cost.pricingConfidence.replace(/_/g, ' ')}
                </Badge>
                <span className="text-faint text-[11px]">{selection.cost.freshness.explanation}</span>
                {selection.cost.needsRecheck && (
                  <span className="text-warn text-[11px]">re-check before quoting</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 flex flex-col gap-1">
        <h3 className="text-muted text-[11px] font-semibold tracking-wide uppercase">
          How the stack was assembled
        </h3>
        <ul className="text-faint flex flex-col gap-1 text-[11px] leading-snug">
          {bundle.rationale.map((line) => (
            <li key={line}>— {line}</li>
          ))}
        </ul>
      </section>

      <section className="mt-4 flex flex-col gap-1">
        <h3 className="text-muted text-[11px] font-semibold tracking-wide uppercase">
          Build versus buy
        </h3>
        <ul className="text-faint flex flex-col gap-1 text-[11px] leading-snug">
          {bundle.mssp.rationale.map((line) => (
            <li key={line}>— {line}</li>
          ))}
          <li>
            — The managed rate card is an <strong>{msspConfidence.replace(/_/g, ' ')}</strong> dated{' '}
            {msspAsOf}. No provider publishes one; it is synthesised from aggregator ranges, for
            comparison and never for quoting.
          </li>
        </ul>
      </section>

      <section className="mt-4 flex flex-col gap-1">
        <h3 className="text-muted text-[11px] font-semibold tracking-wide uppercase">
          Standing disclaimers
        </h3>
        <ul className="text-faint flex flex-col gap-1 text-[11px] leading-snug">
          <li>
            — Every figure here is indicative. Nothing on this page is a quotation, and no vendor
            has been approached.
          </li>
          <li>
            — Operational FTE is costed from a regional labour rate card, which is an analyst
            estimate. It is included in year one as well as later years — a deliberate deviation
            from the spec&apos;s formula, because leaving it out understates exactly the
            open-source options the tool exists to compare honestly.
          </li>
          <li>
            — Volume discounts are assumptions about what a competent buyer achieves, not quoted
            discounts, and they are announced wherever they are applied.
          </li>
          {converted && (
            <li>
              — Figures are shown in {[...currencies].join(', ')}, converted from source prices at
              the rates dated {fxAsOf}. A three-year total quoted at a stale rate is wrong by
              however much the currency has moved since.
            </li>
          )}
          <li>
            — Coverage is measured against controls a purchase could satisfy. Controls closed by
            policy, training, physical control or cryptography are excluded from the denominator
            rather than counted against the stack.
          </li>
          <li>— Prices were aged against {today}.</li>
        </ul>
      </section>

      <section className="mt-4 flex flex-col gap-1">
        <h3 className="text-muted text-[11px] font-semibold tracking-wide uppercase">
          Products ruled out for this client
        </h3>
        {result.scores.filter((score) => score.eliminated).length === 0 ? (
          <p className="text-faint text-[11px]">Nothing in the catalog was hard-filtered.</p>
        ) : (
          <ul className="text-faint flex flex-col gap-1 text-[11px] leading-snug">
            {result.scores
              .filter((score) => score.eliminated)
              .map((score) => (
                <li key={score.productId}>
                  — <span className="text-muted">{score.productId}</span>:{' '}
                  {score.eliminationReasons.join(' ')}
                </li>
              ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
