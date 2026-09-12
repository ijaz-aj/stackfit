import type { Bundle } from '@stackfit/engine';

import { Card } from '@/components/ui';
import { CATEGORY_LABELS } from '@/components/wizard/labels';
import { formatMoney } from '@/lib/format';

// Not from './cost-charts' — that module is `'use client'`, and a server
// component cannot call a function it exports. See chart-geometry.ts.
import { categoryChartHeight } from './chart-geometry';
import { CashflowChart, CostByCategoryChart } from './cost-charts';

/**
 * §8.3 — the cost breakdown, as two charts and the table behind them.
 *
 * The table is not decoration: a tooltip must never be the only way to read a
 * value. It is also the thing an analyst copies into a spreadsheet, which is
 * what usually happens next.
 */
export function CostBreakdown({ bundle }: { bundle: Bundle }) {
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
          Nothing is funded in this bundle, so there is nothing to break down.
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
  // `xl:` on a results page is a rule that fires for almost nobody — the layout
  // above was written, shipped and never once seen.
  //
  // Both charts are given the same height so the row does not leave a band of
  // empty panel under the shorter card.
  const chartHeight = categoryChartHeight(byCategory.length);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        className="lg:col-span-2"
        title="Annual cost by category"
        hint="Licence, support, infrastructure and people — the four lines that make up a year."
      >
        <CostByCategoryChart data={byCategory} currency={currency} height={chartHeight} />
      </Card>

      <Card
        title="Cash flow over the horizon"
        hint="Year one carries implementation and training. Later years carry the subscription uplift."
      >
        <CashflowChart data={cashflow} currency={currency} height={chartHeight} />
      </Card>

      <Card title="The same figures, as a table" className="lg:col-span-3">
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
              <tr className="border-line text-ink border-t-2">
                <td className="py-2 pr-3 font-medium">Total</td>
                <td colSpan={4} />
                <td className="tabular py-2 text-right font-medium">
                  {formatMoney(bundle.annualRecurring)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
