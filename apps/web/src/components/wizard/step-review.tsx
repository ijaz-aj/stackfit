'use client';

import type { SizingResult } from '@stackfit/engine';

import { Badge, Card } from '@/components/ui';
import type { BundleSummary, EstimateSummary } from '@/lib/estimate';
import { formatMoney, formatNumber } from '@/lib/format';

import { CATEGORY_LABELS } from './labels';
import { useWizard } from './store';

function BundleColumn({ bundle, label, hint }: { bundle: BundleSummary; label: string; hint: string }) {
  return (
    <div className="border-line flex flex-col gap-2 rounded border p-3">
      <header>
        <h3 className="text-ink text-[13px] font-semibold">{label}</h3>
        <p className="text-faint text-[11px] leading-snug">{hint}</p>
      </header>

      <dl className="flex flex-col gap-1 text-[12px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Procurement / yr</dt>
          <dd className="tabular text-ink">{formatMoney(bundle.annualSpend)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">All-in / yr</dt>
          <dd className="tabular text-ink">{formatMoney(bundle.annualRecurring)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">One-time</dt>
          <dd className="tabular text-ink">{formatMoney(bundle.oneTime)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">TCO</dt>
          <dd className="tabular text-ink">{formatMoney(bundle.tco)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Ops effort</dt>
          <dd className="tabular text-ink">{formatNumber(bundle.totalOpsFte, 2)} FTE</dd>
        </div>
      </dl>

      <ul className="flex flex-col gap-1">
        {bundle.selections.map((selection) => (
          <li key={selection.productId} className="text-muted flex items-baseline gap-1.5 text-[11px]">
            <span className="text-faint w-24 shrink-0 truncate">
              {CATEGORY_LABELS[selection.category] ?? selection.category}
            </span>
            <span className="text-ink truncate">{selection.productName}</span>
            {selection.mandatory && <Badge tone="warn">required</Badge>}
          </li>
        ))}
        {bundle.selections.length === 0 && (
          <li className="text-faint text-[11px]">Nothing selected.</li>
        )}
      </ul>

      <div className="flex flex-wrap gap-1.5">
        {bundle.coveragePercent !== null && (
          <Badge tone="accent">{bundle.coveragePercent}% of in-scope controls</Badge>
        )}
        <Badge tone={bundle.withinAnnualCap ? 'good' : 'bad'}>
          {bundle.withinAnnualCap ? 'within cap' : 'over cap'}
        </Badge>
      </div>
    </div>
  );
}

/**
 * The last step: what the intake produced, before the results dashboard exists.
 *
 * Deliberately a summary and not a proposal — §8's dashboard is Phase 6. What
 * matters here is that the analyst can see the intake was understood, and that
 * anything needing a second look is on screen rather than in a report.
 */
export function StepReview({
  sizing,
  estimate,
}: {
  sizing: SizingResult | null;
  estimate: EstimateSummary | null;
}) {
  const profile = useWizard((state) => state.profile);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Sizing worksheet" hint="Every downstream number starts here.">
        {sizing === null ? (
          <p className="text-faint text-[12px]">Nothing captured yet.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="text-[12px]">
                <span className="text-muted">Ingest</span>
                <p className="tabular text-ink">
                  {formatNumber(sizing.epsTotal)} EPS · {formatNumber(sizing.gbPerDay, 1)} GB/day
                </p>
              </div>
              <div className="text-[12px]">
                <span className="text-muted">Storage</span>
                <p className="tabular text-ink">
                  {formatNumber(sizing.storageTb, 2)} TB at {sizing.retentionDays}d
                </p>
              </div>
              <div className="text-[12px]">
                <span className="text-muted">Scale</span>
                <p className="tabular text-ink">
                  {sizing.scaleClass} · {formatNumber(sizing.monitoredAssetCount)} monitored
                </p>
              </div>
            </div>

            <ul className="text-faint mt-3 flex flex-col gap-1 text-[11px] leading-snug">
              {sizing.rationale.map((line) => (
                <li key={line}>— {line}</li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {estimate !== null && (
        <>
          <Card
            title="Indicative bundles"
            hint="Essential is the minimum defensible posture plus anything compliance mandates. Ideal ignores the budget, to quantify the gap."
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <BundleColumn
                bundle={estimate.essential}
                label="Essential"
                hint="Minimum defensible posture."
              />
              <BundleColumn
                bundle={estimate.recommended}
                label="Recommended"
                hint="Best value inside the stated budget."
              />
              <BundleColumn
                bundle={estimate.ideal}
                label="Ideal"
                hint="Ignores the cap on purpose."
              />
            </div>
          </Card>

          {(estimate.scopeQuestions.length > 0 || estimate.ruledOutCategories.length > 0) && (
            <Card title="Scope questions">
              {estimate.scopeQuestions.length > 0 && (
                <p className="text-warn mb-2 text-[12px] leading-snug">
                  {profile.compliance.join(', ')} expects{' '}
                  {estimate.scopeQuestions
                    .map((category) => CATEGORY_LABELS[category] ?? category)
                    .join(', ')}
                  , but the estate as captured has nothing for it to protect. Worth asking before the
                  proposal goes out.
                </p>
              )}
              {estimate.ruledOutCategories.length > 0 && (
                <p className="text-faint text-[11px] leading-snug">
                  Ruled out for this estate:{' '}
                  {estimate.ruledOutCategories
                    .map((category) => CATEGORY_LABELS[category] ?? category)
                    .join(', ')}
                  . Nothing in the inventory those categories act on.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      <Card title="Next">
        <p className="text-muted text-[12px] leading-snug">
          The intake is saved as you type. <strong>Results</strong> opens the full dashboard —
          per-category cards, cost breakdown, coverage matrix, gap analysis, the sizing worksheet
          and the assumptions panel — off the same engine run as the figures above.
        </p>
      </Card>
    </div>
  );
}
