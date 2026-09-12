import { PRICING_CONFIDENCE_LABELS, type Bundle, type PipelineResult } from '@stackfit/engine';
import type { FxConfig } from '@stackfit/schema';
import { coverageOfBundle } from '@stackfit/engine';
import type { PricingConfidence } from '@stackfit/schema';
import Link from 'next/link';

import { MoneyWithRupees } from '@/components/money';
import { Badge, Card, RationaleList } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * The grading, short enough for a table column.
 *
 * `PRICING_CONFIDENCE_LABELS` is the full form and is what the assumptions
 * panel and the exports use. Here the column heading already supplies "pricing",
 * and the badge cannot wrap, so the long form was setting the table's minimum
 * width on its own.
 */
const SHORT_CONFIDENCE: Readonly<Record<PricingConfidence, string>> = {
  vendor_quote: 'quoted',
  public_list: 'list',
  analyst_estimate: 'estimate',
  placeholder: 'placeholder',
};

const CONFIDENCE_TONE: Readonly<Record<PricingConfidence, 'good' | 'warn' | 'bad'>> = {
  public_list: 'good',
  vendor_quote: 'good',
  analyst_estimate: 'warn',
  placeholder: 'bad',
};

/**
 * §8.1. The three tiers side by side: year one, annual, three-year TCO,
 * coverage and pricing confidence.
 *
 * The managed alternative is on the same table rather than a page of its own,
 * because §7.4 step 6 exists to put build and buy in front of the client
 * together. Its figure includes the residual: what the provider does not
 * operate stays the client's to buy, and a fee-only comparison would flatter
 * the managed option.
 */
export function BundleComparison({
  result,
  selectedKind,
  scenarioId,
  fx,
}: {
  result: PipelineResult;
  selectedKind: Bundle['kind'];
  scenarioId: string;
  fx: FxConfig;
}) {
  // Operable sits next to Recommended rather than at the end: the two are read
  // against each other, and the distance between them is the point.
  const bundles: readonly Bundle[] = [
    result.essential,
    result.operable,
    result.recommended,
    result.ideal,
  ];

  const rows = bundles.map((bundle) => {
    const confidences: readonly PricingConfidence[] = bundle.selections.map(
      (selection) => selection.cost.pricingConfidence,
    );
    const worst: PricingConfidence =
      confidences.find((entry) => entry === 'placeholder') ??
      confidences.find((entry) => entry === 'analyst_estimate') ??
      confidences.find((entry) => entry === 'vendor_quote') ??
      'public_list';

    return {
      bundle,
      coverage: coverageOfBundle(result, bundle).summary,
      worstConfidence: worst,
      needsRecheck: bundle.selections.some((selection) => selection.cost.needsRecheck),
      year1: bundle.selections.reduce(
        (total, selection) => total + selection.cost.year1.amountMinor,
        0,
      ),
    };
  });

  const label = {
    essential: 'Essential',
    operable: 'Operable',
    recommended: 'Recommended',
    ideal: 'Ideal',
  } as const;
  const hint = {
    essential: 'Minimum defensible posture, plus everything compliance mandates.',
    operable: 'What this team can run unaided. Affordable and staffable.',
    recommended: 'Best value inside the stated budget.',
    ideal: 'Ignores the budget cap, to quantify the gap.',
  } as const;

  return (
    <Card
      title="Bundle comparison"
      hint="Click a tier for its detail. Operable against Recommended is the staffing gap."
    >
      <div className="overflow-x-auto">
        {/*
          The label column is capped rather than left to `w-full`'s devices. On
          a 1400px results page the browser gave the text column everything the
          numbers did not ask for, which left roughly 225px of dead space
          between a tier's name and its first figure: the eye had to travel it
          on every row to connect the two.

          A px width rather than ch: `ch` is relative to the font, so the value
          tuned against the system stack put the table 2px over its container
          the moment the typeface changed, enough to raise a scrollbar on a
          table of money, which is the last place a reader should wonder
          whether a column is cut off. 300px fits every tier hint on two lines.
        */}
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="text-faint text-left text-2xs tracking-wide uppercase">
              <th className="w-[300px] py-2 pr-3 font-medium">Tier</th>
              <th className="py-2 pr-3 text-right font-medium">Year 1</th>
              <th className="py-2 pr-3 text-right font-medium">Procurement / yr</th>
              <th className="py-2 pr-3 text-right font-medium">All-in / yr</th>
              <th className="py-2 pr-3 text-right font-medium">
                {result.recommended.selections[0]?.cost.horizonYears ?? 3}-yr TCO
              </th>
              <th className="py-2 pr-3 text-right font-medium">Ops</th>
              <th className="py-2 pr-3 text-right font-medium">Coverage</th>
              <th className="py-2 pr-3 text-right font-medium">Managed / yr</th>
              <th className="py-2 font-medium">Pricing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ bundle, coverage, worstConfidence, needsRecheck, year1 }) => (
              <tr
                key={bundle.kind}
                className={cn(
                  'border-line group border-t transition-colors',
                  // A 5% tint on a dark ground is invisible, and this row is
                  // the page's primary state. Everything below it changes
                  // with it. The left marker carries the signal; the tint only
                  // supports it.
                  bundle.kind === selectedKind ? 'bg-accent/[0.07]' : 'hover:bg-panel-raised/50',
                )}
              >
                <td
                  className={cn(
                    'py-2 pr-3 align-top border-l-2',
                    bundle.kind === selectedKind
                      ? 'border-l-accent pl-3'
                      : 'border-l-transparent pl-3',
                  )}
                >
                  <Link
                    href={`/scenarios/${scenarioId}/results?bundle=${bundle.kind}`}
                    // `after:absolute inset-0` would need a positioned row,
                    // which a <tr> cannot reliably be. The cell is the target,
                    // and the group hover above tells the pointer so.
                    className={cn(
                      'text-base font-medium transition-colors',
                      bundle.kind === selectedKind
                        ? 'text-accent'
                        : 'text-ink group-hover:text-accent',
                    )}
                    aria-current={bundle.kind === selectedKind ? 'true' : undefined}
                  >
                    {label[bundle.kind]}
                  </Link>
                  <p className="text-faint text-xs leading-snug">{hint[bundle.kind]}</p>
                  <p className="text-faint text-xs">
                    {bundle.selections.length} product
                    {bundle.selections.length === 1 ? '' : 's'}
                  </p>
                </td>
                <td className="tabular py-2 pr-3 text-right align-top">
                  {formatMoney({ amountMinor: year1, currency: bundle.currency })}
                </td>
                <td className="tabular py-2 pr-3 text-right align-top">
                  <MoneyWithRupees money={bundle.annualSpend} fx={fx} />
                  {!bundle.withinAnnualCap && (
                    <span className="text-bad block text-2xs">over cap</span>
                  )}
                </td>
                <td className="tabular py-2 pr-3 text-right align-top">
                  <MoneyWithRupees money={bundle.annualRecurring} fx={fx} />
                  <span className="text-faint block text-2xs">incl. people</span>
                </td>
                <td className="py-2 pr-3 text-right align-top">
                  <MoneyWithRupees money={bundle.tco} fx={fx} />
                </td>
                <td className="tabular py-2 pr-3 text-right align-top">
                  {formatNumber(bundle.totalOpsFte, 2)}
                  <span className="text-faint block text-2xs">FTE</span>
                </td>
                <td className="tabular py-2 pr-3 text-right align-top">
                  {coverage.coveragePercent === null ? '–' : `${coverage.coveragePercent}%`}
                  {/* A percentage that excludes the partials has to name them, or
                      "0%" reads as "this stack does nothing for you". */}
                  {coverage.partialControls > 0 && (
                    <span className="text-warn block text-2xs">
                      +{coverage.partialControls} partial
                    </span>
                  )}
                </td>
                <td className="tabular py-2 pr-3 text-right align-top">
                  {formatMoney(bundle.mssp.totalAnnual)}
                  <span className="text-faint block text-2xs">{bundle.mssp.serviceLevel}</span>
                </td>
                {/*
                  The column is sized by this badge and the badge cannot wrap,
                  so "analyst estimate" set the table's minimum width and spilled
                  past the scroller however wide the page got. Widening the page
                  only made the other columns grow to meet it again.

                  The header already says Pricing, so the word "estimate" is
                  doing the work and the qualifier is the part that can go. The
                  full grading stays on the element, for a pointer and for a
                  screen reader, and the assumptions panel spells every one of
                  them out in full.
                */}
                <td className="w-px py-2 align-top">
                  <Badge
                    tone={CONFIDENCE_TONE[worstConfidence]}
                    title={PRICING_CONFIDENCE_LABELS[worstConfidence]}
                  >
                    {SHORT_CONFIDENCE[worstConfidence]}
                  </Badge>
                  {needsRecheck && (
                    <span className="text-warn mt-1 block text-2xs">due a re-check</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RationaleList
        className="text-faint mt-3"
        lines={[
          'Procurement is licence, support and infrastructure. All-in adds the operational FTE, and so does the TCO. That is why an open-source stack is never free here.',
          'The managed figure is the fee plus the residual cost of whatever the service level does not operate. Comparing a fee against a whole stack would flatter it.',
        ]}
      />
    </Card>
  );
}
