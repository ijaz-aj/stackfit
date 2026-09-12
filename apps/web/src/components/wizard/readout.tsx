'use client';

import type { SizingResult, UnfundedCategory } from '@stackfit/engine';

import { Badge, Stat } from '@/components/ui';
import type { EstimateSummary } from '@/lib/estimate';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * Whether the implementation budget, rather than the annual one, is what left a
 * mandatory category out. Worth a clause of its own in the sidebar: it is the
 * difference between asking the client for more money and asking them for a
 * different kind of money.
 */
function blockedByOneTimeCap(reasons: readonly UnfundedCategory[]): boolean {
  return reasons.some((entry) => entry.reason === 'one_time_cap');
}

/**
 * The live readout (PROJECT_SPEC §9): "estimated ingest / estimated budget,
 * updating as they type. Instant feedback is the selling point."
 *
 * Two different clocks on purpose. Ingest is computed in the browser from the
 * sizing coefficients, so it moves on the keystroke. The budget needs the
 * catalog, eleven config files and the framework library, so it comes back from
 * a server action a moment later and says so while it is in flight. Nothing
 * here calculates anything — both numbers are the engine's (hard rule 4).
 */
export function LiveReadout({
  sizing,
  estimate,
  estimating,
}: {
  sizing: SizingResult | null;
  estimate: EstimateSummary | null;
  estimating: boolean;
}) {
  return (
    <aside className="border-line bg-panel flex flex-col gap-4 rounded border p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-ink text-[13px] font-semibold tracking-tight">Live estimate</h2>
        {estimating && <span className="text-faint text-[10px]">updating…</span>}
      </header>

      <section className="flex flex-col gap-3">
        <h3 className="text-faint text-[10px] tracking-wide uppercase">Ingest</h3>
        {sizing === null ? (
          <p className="text-faint text-[11px]">Enter an estate to size it.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Events/sec" value={formatNumber(sizing.epsTotal)} tone="accent" />
            <Stat label="GB/day" value={formatNumber(sizing.gbPerDay, 1)} />
            <Stat
              label="Licensed GB/day"
              value={formatNumber(sizing.licensedGbPerDay, 1)}
              hint="peak-adjusted"
            />
            <Stat
              label="Storage"
              value={formatNumber(sizing.storageTb, 2)}
              unit="TB"
              hint={`${sizing.retentionDays}d retention`}
            />
            <Stat label="Monitored assets" value={formatNumber(sizing.monitoredAssetCount)} />
            <Stat label="Scale class" value={sizing.scaleClass} />
          </div>
        )}
      </section>

      <section className="border-line flex flex-col gap-3 border-t pt-4">
        <h3 className="text-faint text-[10px] tracking-wide uppercase">
          Indicative spend — recommended
        </h3>
        {sizing !== null && sizing.monitoredAssetCount === 0 && (
          <p className="text-warn text-[11px] leading-snug">
            No estate captured yet. Nothing is licensed, so the figures below are the floor cost of
            owning these tools — minimum infrastructure and the people to run them — not a quote.
          </p>
        )}
        {estimate === null ? (
          <p className="text-faint text-[11px]">
            {estimating ? 'Running the engine…' : 'No estimate yet.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Procurement/yr"
                value={formatMoney(estimate.recommended.annualSpend)}
                tone={estimate.recommended.withinAnnualCap ? 'accent' : 'warn'}
              />
              <Stat
                label={`${estimate.recommended.selections.length}-product stack`}
                value={formatMoney(estimate.recommended.tco, { compact: true })}
                hint="TCO incl. people"
              />
              <Stat
                label="Ops effort"
                value={formatNumber(estimate.recommended.totalOpsFte, 2)}
                unit="FTE"
              />
              <Stat
                label="Managed alternative"
                value={formatMoney(estimate.recommended.msspTotalAnnual, { compact: true })}
                hint={`${estimate.recommended.msspServiceLevel}/yr`}
              />
            </div>

            {estimate.recommended.selections.length > 0 && (
              <ul className="flex flex-col gap-1">
                {estimate.recommended.selections.map((selection) => (
                  <li
                    key={selection.productId}
                    className="text-muted flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <span className="truncate">{selection.productName}</span>
                    <span className="tabular text-faint shrink-0">
                      {formatMoney(selection.annualSpend)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Not gated on withinAnnualCap. A shortfall is the case where the
                bundle *underspends* because it could not buy compliance, so the
                cap is comfortably met and the warning never appeared. */}
            {estimate.recommended.annualShortfall !== null && (
              <p className="text-warn text-[11px] leading-snug">
                Shortfall of {formatMoney(estimate.recommended.annualShortfall)}/yr against the cap.
                {estimate.recommended.minimumViableAnnual !== null && (
                  <> Minimum viable: {formatMoney(estimate.recommended.minimumViableAnnual)}/yr.</>
                )}
              </p>
            )}

            {estimate.recommended.oneTimeShortfall !== null && (
              <p className="text-warn text-[11px] leading-snug">
                Setup shortfall of {formatMoney(estimate.recommended.oneTimeShortfall)} against the
                one-time cap. Implementation is a separate budget.
              </p>
            )}

            {estimate.recommended.unfundedMandatory.length > 0 && (
              <p className="text-bad text-[11px] leading-snug">
                Unfunded mandatory: {estimate.recommended.unfundedMandatory.join(', ')}
                {blockedByOneTimeCap(estimate.recommended.unfundedReasons) && (
                  <> — stopped by the one-time budget, not the annual one.</>
                )}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {estimate.recommended.coveragePercent !== null && (
                <Badge tone="accent">{estimate.recommended.coveragePercent}% covered</Badge>
              )}
              {estimate.gapCount > 0 && <Badge tone="warn">{estimate.gapCount} gaps</Badge>}
              {estimate.criticalGaps.length > 0 && (
                <Badge tone="bad">{estimate.criticalGaps.length} critical</Badge>
              )}
            </div>
          </>
        )}
      </section>

      {estimate !== null && estimate.warnings.length > 0 && (
        <section className="border-line flex flex-col gap-1.5 border-t pt-4">
          <h3 className="text-warn text-[10px] tracking-wide uppercase">Before this ships</h3>
          <ul className="text-muted flex flex-col gap-1 text-[11px] leading-snug">
            {estimate.warnings.map((warning) => (
              <li key={warning}>— {warning}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
