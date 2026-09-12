import {
  justifyBundle,
  type AlternativeVerdict,
  type Bundle,
  type CategoryJustification,
  type PipelineResult,
  type ProductScore,
} from '@stackfit/engine';

import { Badge, Card, RationaleList } from '@/components/ui';
import { cn } from '@/lib/cn';
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
      <summary className="text-faint cursor-pointer text-xs select-none">
        Why this scored {formatNumber(score.score, 1)}
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {score.dimensions.map((dimension) => (
          <li key={dimension.dimension} className="text-xs leading-snug">
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
            <p className="text-faint mt-1 pl-2">{dimension.rationale}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A shortlisted product that did not win, and the one reason it did not. */
function AlternativeRow({ alternative }: { alternative: AlternativeVerdict }) {
  const ruledOut = alternative.kind === 'eliminated';

  return (
    <li className="border-line border-t pt-2 text-xs leading-snug">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className={ruledOut ? 'text-faint' : 'text-muted'}>
          {alternative.productName}
          <span className="text-faint"> — {alternative.tierName}</span>
        </span>
        <span className="tabular text-faint shrink-0">
          {ruledOut ? (
            'ruled out'
          ) : (
            <>
              fit {formatNumber(alternative.fitScore, 1)}
              {alternative.annualSpend !== null && (
                <> · {formatMoney(alternative.annualSpend)}/yr</>
              )}
              {' · '}
              {formatNumber(alternative.opsFte, 2)} FTE
            </>
          )}
        </span>
      </div>
      <p className="text-faint mt-1">{alternative.verdict}</p>
    </li>
  );
}

/**
 * Every product weighed in this category, and why each one lost.
 *
 * This used to be a single runner-up rendered as three bare numbers, which hid
 * three of the five candidates and left the analyst to justify the choice out
 * loud. A recommendation that needs a verbal footnote has not finished the job.
 *
 * Open by default, unlike the fit breakdown above it: "what else did you look
 * at" is the first question a client asks, not the last.
 */
function WhyNotTheOthers({ justification }: { justification: CategoryJustification }) {
  if (justification.alternatives.length === 0) {
    return (
      <p className="border-line text-faint mt-3 border-t pt-2 text-xs leading-snug">
        {justification.headline}
      </p>
    );
  }

  return (
    <details open className="border-line mt-3 border-t pt-2">
      <summary className="text-faint cursor-pointer text-xs select-none">
        Why not the other {justification.alternatives.length}
      </summary>
      <p className="text-faint mt-2 text-xs leading-snug">{justification.headline}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {justification.alternatives.map((alternative) => (
          <AlternativeRow
            key={`${alternative.productId}::${alternative.tierId}`}
            alternative={alternative}
          />
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

  // The comparison is the engine's, not this component's (hard rule 4). All
  // this does is lay it out.
  const justificationByCategory = new Map(
    justifyBundle(bundle, {
      scores: result.scores,
      candidates: result.candidates,
      productNames: new Map(
        result.products.map((product) => [
          product.id,
          { name: product.name, vendor: product.vendor },
        ]),
      ),
    }).map((entry) => [entry.category, entry]),
  );

  return (
    // `lg`, not `xl`. Tailwind's breakpoints are CSS pixels and a scaled
    // display reports fewer of them than its panel has — 1254 on a 1568px
    // screen at 125%. `xl:` (1280) therefore never fired on the machine this
    // was designed on, and these cards had only ever been seen one-up.
    <div className="grid gap-4 lg:grid-cols-2">
      {bundle.selections.map((selection) => {
        const score = scoreBySku.get(`${selection.productId}::${selection.tierId}`);
        const justification = justificationByCategory.get(selection.category);

        const cost = selection.cost;

        return (
          <Card key={selection.productId} className="flex flex-col">
            {/*
              The category and the product were one em-dashed string, which made
              them the same kind of thing. They are not: the category is the
              question this card answers and the product is the answer. The
              category becomes a quiet eyebrow, and the product name gets the
              weight — it is what an analyst says out loud.
            */}
            <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-faint text-2xs font-medium uppercase">
                  {CATEGORY_LABELS[selection.category] ?? selection.category}
                </p>
                <h3 className="text-ink mt-1 text-lg font-semibold">{selection.productName}</h3>
                <p className="text-faint mt-1 text-xs">
                  {selection.vendor} · {selection.tierName}
                </p>
              </div>

              {/*
                Three different kinds of fact used to share one treatment. The
                fit score is a measurement, the mandate is a constraint, the
                pricing grade is a caveat — so the score reads as a figure and
                only the things that qualify it stay as badges.
              */}
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="tabular text-accent text-xl leading-none font-medium">
                  {formatNumber(selection.fitScore, 1)}
                  <span className="text-faint ml-1 text-2xs">/100 fit</span>
                </span>
                <div className="flex flex-wrap justify-end gap-2">
                  {selection.mandatory && <Badge tone="warn">compliance-mandated</Badge>}
                  {selection.suiteDiscountApplied && <Badge>suite discount</Badge>}
                  <Badge tone={cost.needsRecheck ? 'warn' : 'neutral'}>
                    {cost.pricingConfidence.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            </header>

            {/*
              The figures the card exists to show. They were the same size as
              their own labels, on a two-pixel row, which is not a hierarchy.
              Each now sits in its own cell with the label above it in the
              quiet weight, and the TCO — the one people quote — is accented.
            */}
            <dl className="border-line mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-control) border sm:grid-cols-4">
              {[
                { label: 'Licence / yr', value: formatMoney(cost.licenceAnnual) },
                { label: 'Infra / yr', value: formatMoney(cost.infraAnnual) },
                {
                  label: 'People / yr',
                  value: formatMoney(cost.opsFteAnnual),
                  note: `${formatNumber(cost.opsFte, 2)} FTE`,
                },
                {
                  label: `${cost.horizonYears}-yr TCO`,
                  value: formatMoney(cost.tco),
                  accent: true,
                },
              ].map((stat) => (
                <div key={stat.label} className="bg-panel-raised/40 px-3 py-3">
                  <dt className="text-faint text-2xs font-medium uppercase">{stat.label}</dt>
                  <dd
                    className={cn(
                      'tabular mt-1 text-base',
                      stat.accent === true ? 'text-accent' : 'text-ink',
                    )}
                  >
                    {stat.value}
                    {stat.note !== undefined && (
                      <span className="text-faint ml-1.5 text-2xs">{stat.note}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            {score !== undefined && score.coveredAssets.length > 0 && (
              <p className="text-muted mt-2 text-sm leading-snug">
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

            <RationaleList lines={selection.rationale} className="text-faint mt-2" />

            {score !== undefined && <FitBreakdown score={score} />}

            {justification !== undefined && <WhyNotTheOthers justification={justification} />}
          </Card>
        );
      })}

      {bundle.selections.length === 0 && (
        <Card title="Nothing selected">
          <p className="text-muted text-sm">
            This bundle funds no products. The shortfall and the categories that went unfunded are
            in the gap analysis below.
          </p>
        </Card>
      )}
    </div>
  );
}
