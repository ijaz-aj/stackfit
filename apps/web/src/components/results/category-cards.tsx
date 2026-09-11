import type { Bundle, PipelineResult } from '@stackfit/engine';

import { Badge, Card } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { ASSET_LABELS, CATEGORY_LABELS } from '@/components/wizard/labels';

/**
 * §8.2 — one card per category: what was chosen, what came second, why, what it
 * costs, and what it covers *in their environment*.
 *
 * The last of those is the one that makes a recommendation concrete on a call.
 * "Covers 38 Windows servers and 40 POS terminals" is a sentence a client can
 * check; "asset coverage 82" is not.
 */
export function CategoryCards({ result, bundle }: { result: PipelineResult; bundle: Bundle }) {
  const scoreById = new Map(result.scores.map((score) => [score.productId, score]));

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {bundle.selections.map((selection) => {
        const score = scoreById.get(selection.productId);
        const runnerUp = result.candidates
          .filter(
            (candidate) =>
              candidate.category === selection.category &&
              candidate.productId !== selection.productId,
          )
          .sort((a, b) => b.valueDensity - a.valueDensity)[0];

        const cost = selection.cost;

        return (
          <Card
            key={selection.productId}
            title={`${CATEGORY_LABELS[selection.category] ?? selection.category} — ${selection.productName}`}
            hint={`${selection.vendor} · ${selection.tierId} tier`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">fit {formatNumber(selection.fitScore, 1)}/100</Badge>
              {selection.mandatory && <Badge tone="warn">compliance-mandated</Badge>}
              {selection.suiteDiscountApplied && <Badge>suite discount applied</Badge>}
              <Badge tone={cost.needsRecheck ? 'warn' : 'neutral'}>
                {cost.pricingConfidence.replace(/_/g, ' ')}
              </Badge>
            </div>

            <dl className="border-line mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-y py-2 text-[12px] sm:grid-cols-4">
              <div>
                <dt className="text-faint text-[10px] tracking-wide uppercase">Licence / yr</dt>
                <dd className="tabular text-ink">{formatMoney(cost.licenceAnnual)}</dd>
              </div>
              <div>
                <dt className="text-faint text-[10px] tracking-wide uppercase">Infra / yr</dt>
                <dd className="tabular text-ink">{formatMoney(cost.infraAnnual)}</dd>
              </div>
              <div>
                <dt className="text-faint text-[10px] tracking-wide uppercase">People / yr</dt>
                <dd className="tabular text-ink">
                  {formatMoney(cost.opsFteAnnual)}
                  <span className="text-faint ml-1 text-[10px]">
                    {formatNumber(cost.opsFte, 2)} FTE
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-faint text-[10px] tracking-wide uppercase">
                  {cost.horizonYears}-yr TCO
                </dt>
                <dd className="tabular text-ink">{formatMoney(cost.tco)}</dd>
              </div>
            </dl>

            {score !== undefined && score.coveredAssets.length > 0 && (
              <p className="text-muted mt-2 text-[12px] leading-snug">
                Covers{' '}
                {score.coveredAssets
                  .map(
                    (asset) =>
                      `${formatNumber(asset.count)} ${ASSET_LABELS[asset.assetClass] ?? asset.assetClass}`,
                  )
                  .join(', ')}
                .
                {score.missedAssets.length > 0 && (
                  <span className="text-warn">
                    {' '}
                    Does not reach{' '}
                    {score.missedAssets
                      .map(
                        (asset) =>
                          `${formatNumber(asset.count)} ${ASSET_LABELS[asset.assetClass] ?? asset.assetClass}`,
                      )
                      .join(', ')}
                    .
                  </span>
                )}
              </p>
            )}

            <ul className="text-faint mt-2 flex flex-col gap-1 text-[11px] leading-snug">
              {selection.rationale.map((line) => (
                <li key={line}>— {line}</li>
              ))}
            </ul>

            <p className="border-line text-faint mt-3 border-t pt-2 text-[11px] leading-snug">
              {runnerUp === undefined ? (
                <>No other product in this category survived scoring for this client.</>
              ) : (
                <>
                  Runner-up:{' '}
                  <span className="text-muted">
                    {result.products.find((product) => product.id === runnerUp.productId)?.name ??
                      runnerUp.productId}
                  </span>{' '}
                  — fit {formatNumber(runnerUp.fitScore, 1)}, {formatMoney(runnerUp.cost.procurementAnnual)}
                  /yr procurement, {formatNumber(runnerUp.cost.opsFte, 2)} FTE.
                </>
              )}
            </p>
          </Card>
        );
      })}

      {bundle.selections.length === 0 && (
        <Card title="Nothing selected">
          <p className="text-muted text-[12px]">
            This bundle funds no products. The shortfall and the categories that went unfunded are
            in the gap analysis below.
          </p>
        </Card>
      )}
    </div>
  );
}
