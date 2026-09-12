'use client';

import type { SizingResult, UnfundedCategory } from '@stackfit/engine';

import { Badge, RationaleList, Stat } from '@/components/ui';
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
 * What to call the ingest block, given that its two figures can have different
 * provenance.
 *
 * The mixed case is the common one, not an edge: a client reads GB/day off a
 * SIEM invoice far more readily than events per second off a collector. Calling
 * that block "measured" would extend the client's authority to a figure this
 * tool guessed, and calling it "estimated" would discard a figure the client
 * actually knows. It is neither, so it says so.
 */
function ingestHeading(sizing: SizingResult | null): string {
  if (sizing === null) return 'Ingest, estimated';
  const measured =
    Number(sizing.epsSource === 'measured') + Number(sizing.gbPerDaySource === 'measured');
  if (measured === 2) return 'Ingest, measured';
  if (measured === 1) return 'Ingest, part measured';
  return 'Ingest, estimated';
}

/**
 * Volume has three provenances, not two. Stated by the client; computed from an
 * event rate the client stated, which is a coefficient applied to a measurement;
 * or computed from asset counts, which is a coefficient applied to a
 * coefficient. The middle one is worth more than the last and the label is the
 * only place that shows.
 */
function gbPerDayHint(sizing: SizingResult): string {
  if (sizing.gbPerDaySource === 'measured') return 'as measured';
  return sizing.epsSource === 'measured' ? 'from measured events' : 'estimate';
}

/**
 * The live readout (PROJECT_SPEC §9): "estimated ingest / estimated budget,
 * updating as they type. Instant feedback is the selling point."
 *
 * Two different clocks on purpose. Ingest is computed in the browser from the
 * sizing coefficients, so it moves on the keystroke. The budget needs the
 * catalog, eleven config files and the framework library, so it comes back from
 * a server action a moment later and says so while it is in flight. Nothing
 * here calculates anything. Both numbers are the engine's (hard rule 4).
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
        <h2 className="text-ink text-base font-semibold tracking-tight">Live estimate</h2>
        {estimating && <span className="text-faint text-2xs">updating…</span>}
      </header>

      <section className="flex flex-col gap-3">
        {/*
          "Estimated", not "Ingest", and the difference is not decoration.
          
          These figures come from a per-asset events-per-second coefficient, and
          the published values for one device class disagree by more than an
          order of magnitude: a Windows workstation is quoted at 1, 2, 5 and 10
          to 50 EPS by four different sources, because what a machine emits is
          decided by its audit policy and not by what it is. Rendering 2,786 to
          four significant figures claims a precision nothing here has.
          
          The number is still worth showing: it is the right order of magnitude
          and it is what every vendor sizing calculator does. It is the word
          above it that has to be honest, and the label flips the moment the
          client supplies a real one. Per figure, because the client can supply
          one of the two and usually does.
        */}
        <h3 className="text-faint text-2xs tracking-wide uppercase">{ingestHeading(sizing)}</h3>
        {sizing === null ? (
          <p className="text-faint text-xs">Enter an estate to size it.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Events/sec"
              value={formatNumber(sizing.epsTotal)}
              tone="accent"
              hint={sizing.epsSource === 'measured' ? 'as measured' : 'from asset counts'}
            />
            <Stat
              label="GB/day"
              value={formatNumber(sizing.gbPerDay, 1)}
              hint={gbPerDayHint(sizing)}
            />
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
        <h3 className="text-faint text-2xs tracking-wide uppercase">Recommended spend</h3>
        {sizing !== null && sizing.monitoredAssetCount === 0 && (
          <p className="text-warn text-xs leading-snug">
            No estate captured, so the figures below are the floor cost of owning these tools, not a
            quote.
          </p>
        )}
        {estimate === null ? (
          <p className="text-faint text-xs">
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
                    className="text-muted flex items-baseline justify-between gap-2 text-xs"
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
              <p className="text-warn text-xs leading-snug">
                Shortfall of {formatMoney(estimate.recommended.annualShortfall)}/yr against the cap.
                {estimate.recommended.minimumViableAnnual !== null && (
                  <> Minimum viable: {formatMoney(estimate.recommended.minimumViableAnnual)}/yr.</>
                )}
              </p>
            )}

            {estimate.recommended.oneTimeShortfall !== null && (
              <p className="text-warn text-xs leading-snug">
                Setup shortfall of {formatMoney(estimate.recommended.oneTimeShortfall)} against the
                one-time cap. Implementation is a separate budget.
              </p>
            )}

            {estimate.recommended.unfundedMandatory.length > 0 && (
              <p className="text-bad text-xs leading-snug">
                Unfunded mandatory: {estimate.recommended.unfundedMandatory.join(', ')}
                {blockedByOneTimeCap(estimate.recommended.unfundedReasons) && (
                  <>. Stopped by the one-time budget, not the annual one.</>
                )}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
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
        <section className="border-line flex flex-col gap-2 border-t pt-4">
          <h3 className="text-warn text-2xs tracking-wide uppercase">Before this ships</h3>
          <RationaleList lines={estimate.warnings} />
        </section>
      )}
    </aside>
  );
}
