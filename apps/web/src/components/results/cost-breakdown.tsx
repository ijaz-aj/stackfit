import type { Bundle } from '@stackfit/engine';

import { Card } from '@/components/ui';
import { CATEGORY_LABELS } from '@/components/wizard/labels';
import { formatMoney } from '@/lib/format';

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
        <p className="text-muted text-[12px]">Nothing is funded in this bundle, so there is nothing to break down.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card
        title="Annual cost by category"
        hint="Licence, support, infrastructure and people — the four lines that make up a year."
      >
        <CostByCategoryChart data={byCategory} currency={currency} />
      </Card>

      <Card
        title="Cash flow over the horizon"
        hint="Year one carries implementation and training. Later years carry the subscription uplift."
      >
        <CashflowChart data={cashflow} currency={currency} />
      </Card>

      <Card title="The same figures, as a table" className="xl:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr className="text-faint text-left text-[10px] tracking-wide uppercase">
                <th className="py-1.5 pr-3 font-medium">Category</th>
                <th className="py-1.5 pr-3 text-right font-medium">Licence</th>
                <th className="py-1.5 pr-3 text-right font-medium">Support</th>
                <th className="py-1.5 pr-3 text-right font-medium">Infrastructure</th>
                <th className="py-1.5 pr-3 text-right font-medium">People</th>
                <th className="py-1.5 text-right font-medium">Annual</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((row) => (
                <tr key={row.label} className="border-line border-t">
                  <td className="py-1.5 pr-3">{row.label}</td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {formatMoney({ amountMinor: row.licence, currency })}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {formatMoney({ amountMinor: row.support, currency })}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {formatMoney({ amountMinor: row.infra, currency })}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {formatMoney({ amountMinor: row.people, currency })}
                  </td>
                  <td className="tabular py-1.5 text-right">
                    {formatMoney({
                      amountMinor: row.licence + row.support + row.infra + row.people,
                      currency,
                    })}
                  </td>
                </tr>
              ))}
              <tr className="border-line text-ink border-t-2">
                <td className="py-1.5 pr-3 font-medium">Total</td>
                <td colSpan={4} />
                <td className="tabular py-1.5 text-right font-medium">
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
