import {
  EFFORT_CONFIDENCE_LABELS,
  PRICING_CONFIDENCE_LABELS,
  type Bundle,
  type PipelineResult,
} from '@stackfit/engine';
import type { ReactNode } from 'react';

import { Card, CardSection, Grade, RationaleList } from '@/components/ui';
import { formatNumber } from '@/lib/format';

/**
 * §8.7. The assumptions and disclaimers panel. "Always present, always
 * exported."
 *
 * This is the panel that decides whether the rest of the page is honest. Every
 * figure above it rests on a price with a provenance, a control list with a
 * grade, a labour rate that is an estimate and an FX rate with a date, and none
 * of that is visible in a total.
 *
 * It is also the panel a client reads most carefully, which is why it was
 * rebuilt. Six identically-styled sections, 1,900 pixels of one scroll, prose
 * at 190 characters a line, twenty-six consecutive amber badges and product
 * *ids* where the names should be. The content was right and it looked like a
 * debug dump. What changed, and why:
 *
 * - Provenance is a table, because it is one. Thirteen rows of name-then-badge
 *   put every badge at a different x, so nothing could be compared down a
 *   column, which is the only reason to list them together.
 * - Repetition is collapsed. Eleven prices said "well inside the 90-day
 *   allowance" in identical words, and thirteen products were ruled out for the
 *   identical reason. A reader skims that and concludes there is nothing to
 *   read. State the rule once; list the exceptions.
 * - The two long enumerations open on demand, with their counts in the summary.
 *   Defaulting them shut is not hiding them: it is the difference between a
 *   panel that can be read in a call and one that is scrolled past.
 */

/**
 * A vendor-documented or field-measured effort figure is evidence; an analyst
 * estimate is reasoning; a placeholder is nothing at all. Graded on screen the
 * same way a price is, because it moves the total the same way.
 */
const EFFORT_TONE = {
  vendor_documented: 'good',
  field_measured: 'good',
  analyst_estimate: 'warn',
  placeholder: 'bad',
} as const;

const PRICING_TONE = {
  vendor_quote: 'good',
  public_list: 'good',
  analyst_estimate: 'warn',
  placeholder: 'bad',
} as const;

/**
 * A `<details>` whose summary carries the count.
 *
 * The count is the point. "Products ruled out (20)" tells a reader what they
 * are declining to open; "Products ruled out" makes them open it to find out,
 * which is how a disclosure control becomes an obstacle.
 */
function Expandable({
  summary,
  count,
  children,
}: {
  summary: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <details className="group">
      {/*
        The native marker is removed and redrawn, because the default one is a
        platform triangle that sits outside the text box and cannot be given a
        colour that survives this palette. On screen it read as absent, and a
        disclosure control nobody can see is content nobody finds. This chevron
        rotates on open, which also says which way the control is pointing.
      */}
      <summary className="text-muted hover:text-ink border-line-strong hover:border-line-control inline-flex cursor-pointer list-none items-center gap-2 rounded-(--radius-control) border px-2.5 py-1.5 text-xs transition-colors [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="text-faint h-3 w-3 shrink-0 transition-transform duration-(--duration-quick) group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 3L7.5 6L4.5 9" />
        </svg>
        {summary}
        <span className="tabular text-faint">{count}</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/** One row of a provenance table: what it is, how well it is known, the detail. */
function ProvenanceRow({
  name,
  grade,
  tone,
  detail,
  flag,
}: {
  name: string;
  grade: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  detail: string;
  flag?: string | undefined;
}) {
  return (
    <tr className="border-line border-t align-baseline">
      <td className="text-ink py-1.5 pr-4 text-sm">{name}</td>
      <td className="py-1.5 pr-4">
        <Grade tone={tone}>{grade}</Grade>
      </td>
      <td className="text-faint py-1.5 text-xs leading-relaxed">
        {detail}
        {flag !== undefined && <span className="text-warn ml-2">{flag}</span>}
      </td>
    </tr>
  );
}

/**
 * The elimination reasons, grouped by the reason itself.
 *
 * Thirteen of twenty products were ruled out with the byte-identical sentence
 * "A large environment is above this product's mid ceiling. It would not carry
 * this estate." Printed once per product that is a wall; printed once with its
 * thirteen products named, it is a finding.
 */
function groupByReason(
  scores: PipelineResult['scores'],
  nameById: ReadonlyMap<string, string>,
): { reason: string; products: string[] }[] {
  const byReason = new Map<string, string[]>();

  for (const score of scores) {
    if (!score.eliminated) continue;
    const reason = score.eliminationReasons.join(' ');
    const name = nameById.get(score.productId) ?? score.productId;
    const existing = byReason.get(reason);
    if (existing === undefined) byReason.set(reason, [name]);
    else if (!existing.includes(name)) existing.push(name);
  }

  // Most-common reason first: the biggest group is the one that explains the
  // shape of the catalog for this client.
  return [...byReason.entries()]
    .map(([reason, products]) => ({ reason, products }))
    .sort((a, b) => b.products.length - a.products.length || a.reason.localeCompare(b.reason));
}

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

  const nameById = new Map(result.products.map((product) => [product.id, product.name]));
  const ruledOut = groupByReason(result.scores, nameById);
  const ruledOutCount = new Set(
    result.scores.filter((score) => score.eliminated).map((score) => score.productId),
  ).size;

  // Every price whose grade or freshness is anything other than "fine". These
  // are the rows worth a reader's attention, and they were previously
  // indistinguishable from the eleven that were not.
  const pricesNeedingAttention = bundle.selections.filter(
    (selection) =>
      selection.cost.needsRecheck ||
      selection.cost.pricingConfidence === 'placeholder' ||
      selection.cost.pricingConfidence === 'analyst_estimate',
  );

  return (
    <Card
      title="Assumptions and disclaimers"
      hint="Read this before any of the above reaches a client. Every figure on this page rests on something here."
    >
      <div className="flex flex-col gap-5">
        <CardSection
          title="Where each price came from"
          hint="A price is only as good as its source and its age. Both are graded; neither is inferred."
        >
          {bundle.selections.length === 0 ? (
            <p className="text-faint text-sm">Nothing priced in this bundle.</p>
          ) : (
            <>
              {pricesNeedingAttention.length === 0 ? (
                <p className="text-muted measure text-sm leading-relaxed">
                  Every price in this bundle is a vendor quote or a published list price, and all of
                  them are inside their re-check window. Nothing here needs qualifying to a client.
                </p>
              ) : (
                <p className="text-muted measure text-sm leading-relaxed">
                  {/* The verb agrees with the count. "1 of 13 prices need a
                      word" is the sentence a template writes. */}
                  {pricesNeedingAttention.length} of {bundle.selections.length}{' '}
                  {pricesNeedingAttention.length === 1 ? 'prices needs' : 'prices need'} a word
                  before it reaches a client:{' '}
                  <span className="text-ink">
                    {pricesNeedingAttention.map((selection) => selection.productName).join(', ')}
                  </span>
                  . The rest are published list prices inside their re-check window.
                </p>
              )}
              <Expandable
                summary="All prices, with source and age"
                count={bundle.selections.length}
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="text-faint text-2xs tracking-wide uppercase">
                        <th className="pb-2 pr-4 font-medium">Product</th>
                        <th className="pb-2 pr-4 font-medium">Basis</th>
                        <th className="pb-2 font-medium">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.selections.map((selection) => (
                        <ProvenanceRow
                          key={selection.productId}
                          name={selection.productName}
                          grade={PRICING_CONFIDENCE_LABELS[selection.cost.pricingConfidence]}
                          tone={PRICING_TONE[selection.cost.pricingConfidence]}
                          detail={selection.cost.freshness.explanation}
                          flag={selection.cost.needsRecheck ? 're-check before quoting' : undefined}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Expandable>
            </>
          )}
        </CardSection>

        <CardSection
          title="Where each effort figure came from"
          hint="Staffing and implementation decide whether a zero-licence tool is cheap or expensive, which makes them the most load-bearing numbers here after the prices. On this catalog they are almost all analyst estimates."
        >
          {bundle.selections.length === 0 ? (
            <p className="text-faint text-sm">Nothing costed in this bundle.</p>
          ) : (
            <Expandable summary="Effort, per product" count={bundle.selections.length}>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-faint text-2xs tracking-wide uppercase">
                      <th className="pb-2 pr-4 font-medium">Product</th>
                      <th className="pb-2 pr-4 text-right font-medium">Ops FTE</th>
                      <th className="pb-2 pr-4 font-medium">Ops basis</th>
                      <th className="pb-2 font-medium">Implementation basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.selections.map((selection) => (
                      <tr key={selection.productId} className="border-line border-t align-baseline">
                        <td className="text-ink py-1.5 pr-4 text-sm">{selection.productName}</td>
                        <td className="tabular text-ink py-1.5 pr-4 text-right text-sm">
                          {formatNumber(selection.cost.opsFte, 2)}
                        </td>
                        <td className="py-1.5 pr-4">
                          <Grade tone={EFFORT_TONE[selection.cost.opsBurdenConfidence]}>
                            {EFFORT_CONFIDENCE_LABELS[selection.cost.opsBurdenConfidence] ??
                              selection.cost.opsBurdenConfidence}
                          </Grade>
                        </td>
                        <td className="py-1.5">
                          <Grade tone={EFFORT_TONE[selection.cost.implementationConfidence]}>
                            {EFFORT_CONFIDENCE_LABELS[selection.cost.implementationConfidence] ??
                              selection.cost.implementationConfidence}
                          </Grade>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Expandable>
          )}
        </CardSection>

        <CardSection title="How the stack was assembled">
          <RationaleList lines={bundle.rationale} />
        </CardSection>

        <CardSection title="Build versus buy">
          <RationaleList
            lines={[
              ...bundle.mssp.rationale,
              // The engine's last line already says the rate card is an
              // analyst estimate and that no provider publishes one. Repeating
              // both and then adding the date made two bullets out of one
              // fact; this adds only what the engine does not know.
              `That rate card is dated ${msspAsOf} and graded ` +
                `${msspConfidence.replace(/_/g, ' ')}, synthesised from aggregator ranges, for ` +
                'comparison and never for quoting.',
            ]}
          />
        </CardSection>

        <CardSection title="Standing disclaimers">
          <RationaleList
            lines={[
              'Every figure here is indicative. Nothing on this page is a quotation, and no vendor has been approached.',
              'Operational FTE is costed from a regional labour rate card, which is an analyst estimate. It is included in year one as well as later years. That is a deliberate departure from the conventional formula, which leaves it out and so understates exactly the open-source options this tool exists to compare honestly.',
              'Volume discounts are assumptions about what a competent buyer achieves, not quoted discounts, and they are announced wherever they are applied.',
              ...(converted
                ? [
                    `Figures are shown in ${[...currencies].join(', ')}, converted from source prices at the rates dated ${fxAsOf}. A three-year total quoted at a stale rate is wrong by however much the currency has moved since.`,
                  ]
                : []),
              'Coverage is measured against controls a purchase could satisfy. Controls closed by policy, training, physical control or cryptography are excluded from the denominator rather than counted against the stack.',
              `Prices were aged against ${today}.`,
            ]}
          />
        </CardSection>

        <CardSection
          title="Products ruled out for this client"
          hint="Grouped by reason. A catalog entry that loses on price is not here. These were removed before scoring, by a hard filter or a tier limit."
        >
          {ruledOutCount === 0 ? (
            <p className="text-faint text-xs">Nothing in the catalog was hard-filtered.</p>
          ) : (
            <Expandable summary="Ruled out before scoring" count={ruledOutCount}>
              <ul className="flex flex-col gap-4">
                {ruledOut.map((group) => (
                  <li key={group.reason} className="flex flex-col gap-1">
                    <p className="text-ink measure text-sm leading-relaxed">{group.reason}</p>
                    {/* A tier-limit reason names its own product ("Cisco Duo
                        Free is capped at 10 users"); a generic one does not.
                        Printing the name under a sentence that already opens
                        with it reads as a stutter. */}
                    {!(
                      group.products.length === 1 && group.reason.startsWith(group.products[0]!)
                    ) && (
                      <p className="text-faint measure text-xs leading-relaxed">
                        {group.products.join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Expandable>
          )}
        </CardSection>
      </div>
    </Card>
  );
}
