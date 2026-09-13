import type { Bundle } from '@stackfit/engine';
import type { FxConfig } from '@stackfit/schema';

import { MoneyWithRupees } from '@/components/money';
import { Card } from '@/components/ui';
import { CATEGORY_LABELS } from '@/components/wizard/labels';
import { formatMoney } from '@/lib/format';

// Not from './cost-charts'. That module is `'use client'`, and a server
// component cannot call a function it exports. See chart-geometry.ts.
import { categoryChartHeight } from './chart-geometry';
import { CashflowChart, CostByCategoryChart } from './cost-charts';

/**
 * §8.3. The cost breakdown, as two charts and the table behind them.
 *
 * The table is not decoration: a tooltip must never be the only way to read a
 * value. It is also the thing an analyst copies into a spreadsheet, which is
 * what usually happens next.
 */
export function CostBreakdown({ bundle, fx }: { bundle: Bundle; fx: FxConfig }) {
  const currency = bundle.currency;

  const byCategory = bundle.selections.map((selection) => ({
    label: CATEGORY_LABELS[selection.category] ?? selection.category,
    licence: selection.cost.licenceAnnual.amountMinor,
    support: selection.cost.supportAnnual.amountMinor,
    infra: selection.cost.infraAnnual.amountMinor,
    people: selection.cost.opsFteAnnual.amountMinor,
  }));

  // Year 1 carries implementation and training; later years carry the uplift.
  const horizon = bundle.selections[0]?.cost.cashflowByYear.length ?? 0;
  const cashflow = Array.from({ length: horizon }, (_, year) => ({
    label: `Year ${year + 1}`,
    amount: bundle.selections.reduce(
      (total, selection) => total + (selection.cost.cashflowByYear[year]?.amountMinor ?? 0),
      0,
    ),
  }));

  if (bundle.selections.length === 0) {
    return (
      <Card title="Cost breakdown">
        <p className="text-muted text-sm">
          Nothing is funded in this option, so there is nothing to break down.
        </p>
      </Card>
    );
  }

  // Two thirds against one, not halves. The category chart is thirteen rows
  // tall; the cash flow is three bars. Equal width left the cash flow adrift in
  // a panel it could not fill, which reads as a chart that failed to load
  // rather than one with three data points. Width follows how much there is to
  // show.
  //
  // `lg`, not `xl`. A 1280px breakpoint sounds like a laptop and is not one:
  // the browser here reports 1254 CSS pixels on a 1568px panel, because the
  // display scales at 1.25. Every figure in Tailwind's scale is a CSS pixel, so
  // `xl:` on a results page is a rule that fires for almost nobody. The layout
  // above was written, shipped and never once seen.
  //
  // Both charts are given the same height so the row does not leave a band of
  // empty panel under the shorter card.
  const chartHeight = categoryChartHeight(byCategory.length);

  // `min-w-0` on every card is load bearing below `lg:`, where this grid is a
  // single column. A grid item's default `min-width: auto` refuses to shrink
  // below its content's min-content width, and the table below carries
  // `min-w-[560px]`, so the track was forced to 560 and both charts stretched to
  // match it: 245px of the results page hung off the side of a 390px phone. The
  // table's `overflow-x-auto` wrapper cannot help until something lets it be
  // narrower than the table it wraps.
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        className="min-w-0 lg:col-span-2"
        title="Annual cost by category"
        hint="Licence, support, infrastructure and people: the four lines that make up a year."
      >
        <CostByCategoryChart data={byCategory} currency={currency} height={chartHeight} />
      </Card>

      <Card
        className="min-w-0"
        title="Cash flow over the horizon"
        hint="Year one carries implementation and training. Later years carry the subscription uplift."
      >
        <CashflowChart data={cashflow} currency={currency} height={chartHeight} />
      </Card>

      <Card title="The same figures, as a table" className="min-w-0 lg:col-span-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-faint text-left text-2xs tracking-wide uppercase">
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 text-right font-medium">Licence</th>
                <th className="py-2 pr-3 text-right font-medium">Support</th>
                <th className="py-2 pr-3 text-right font-medium">Infrastructure</th>
                <th className="py-2 pr-3 text-right font-medium">People</th>
                <th className="py-2 text-right font-medium">Annual</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((row) => (
                <tr key={row.label} className="border-line border-t">
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="tabular py-2 pr-3 text-right">
                    {formatMoney({ amountMinor: row.licence, currency })}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {formatMoney({ amountMinor: row.support, currency })}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {formatMoney({ amountMinor: row.infra, currency })}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {formatMoney({ amountMinor: row.people, currency })}
                  </td>
                  <td className="tabular py-2 text-right">
                    {formatMoney({
                      amountMinor: row.licence + row.support + row.infra + row.people,
                      currency,
                    })}
                  </td>
                </tr>
              ))}
              {/*
                The rupee equivalent on the total, and deliberately not on the
                thirteen rows above it.

                This tool's primary region is India and a scenario priced in USD
                or EUR gives an Indian reader nothing to judge the size of a
                number against. But `MoneyWithRupees` renders a second line, and
                thirteen of those would double the height of the table to
                restate, thirteen times, something the reader only needs once:
                the order of magnitude. The total is where scale is actually
                read, so the total is where it goes.
              */}
              <tr className="border-line text-ink border-t-2">
                <td className="py-2 pr-3 font-medium">Total</td>
                <td colSpan={4} />
                <td className="py-2 text-right font-medium">
                  <MoneyWithRupees money={bundle.annualRecurring} fx={fx} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
