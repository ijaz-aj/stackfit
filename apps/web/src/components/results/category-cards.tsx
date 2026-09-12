import type { Bundle, PipelineResult, ProductScore } from '@stackfit/engine';

import { Badge, Card } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { ASSET_LABELS, CATEGORY_LABELS, DIMENSION_LABELS } from '@/components/wizard/labels';

/**
 * §8.2 — one card per category: what was chosen, what came second, why, what it
 * costs, and what it covers *in their environment*.
 *
 * The last of those is the one that makes a recommendation concrete on a call.
 * "Covers 38 Windows servers and 40 POS terminals" is a sentence a client can
 * check; "asset coverage 82" is not.
 */
/**
 * The working behind the fit badge.
 *
 * §9: "if you cannot render a rationale for a number, do not render the
 * number." The badge above is a number, and every dimension behind it has had a
 * sentence attached since Phase 4 — this is the first thing that shows them.
 * Folded away by default because the card is read on a call and seven rows of
 * reasoning is not the first thing anyone needs.
 *
 * The weight shown is the one actually used, after any procurement-bias
 * adjustment, so a client whose bias raised the operability weight can see that
 * it did.
 */
function FitBreakdown({ score }: { score: ProductScore }) {
  return (
    <details className="border-line mt-3 border-t pt-2">
      <summary className="text-faint cursor-pointer text-[11px] select-none">
        Why this scored {formatNumber(score.score, 1)}
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {score.dimensions.map((dimension) => (
          <li key={dimension.dimension} className="text-[11px] leading-snug">
            <div className="flex items-baseline gap-2">
              <span className="text-muted w-32 shrink-0">
                {DIMENSION_LABELS[dimension.dimension] ?? dimension.dimension}
              </span>
              <span className="tabular text-ink w-10 shrink-0 text-right">
                {formatNumber(dimension.score, 0)}
              </span>
              <span className="tabular text-faint w-24 shrink-0">
                x {formatNumber(dimension.weight, 0)}% = {formatNumber(dimension.contribution, 1)}
              </span>
            </div>
            <p className="text-faint mt-0.5 pl-2">{dimension.rationale}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function CategoryCards({ result, bundle }: { result: PipelineResult; bundle: Bundle }) {
  // Keyed on the SKU: scoring produces one row per tier, and looking up by
  // product id alone would show the entry tier's working under the tier the
  // bundle actually chose.
  const scoreBySku = new Map(
    result.scores.map((score) => [`${score.productId}::${score.tierId}`, score]),
  );

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {bundle.selections.map((selection) => {
        const score = scoreBySku.get(`${selection.productId}::${selection.tierId}`);
        // A different product, deliberately. "Why this tier and not the one next
        // to it" is answered in the selection's own rationale; this slot
        // answers "what else did you look at", and spending it on the same
        // product's other SKU would stop it doing that.
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
            hint={`${selection.vendor} · ${selection.tierName}`}
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

            {score !== undefined && <FitBreakdown score={score} />}

            <p className="border-line text-faint mt-3 border-t pt-2 text-[11px] leading-snug">
              {runnerUp === undefined ? (
                <>No other product in this category survived scoring for this client.</>
              ) : (
                <>
                  Runner-up:{' '}
                  <span className="text-muted">
                    {result.products.find((product) => product.id === runnerUp.productId)?.name ??
                      runnerUp.productId}
                    <span className="text-faint"> — {runnerUp.tierName}</span>
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
