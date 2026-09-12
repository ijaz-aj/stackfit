'use client';

import type { CurrencyCode } from '@stackfit/schema';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMoney } from '@/lib/format';

/**
 * §8.3 — where the money goes, and when.
 *
 * Both charts are plotted in **minor units**, like everything else in this repo,
 * and only `formatMoney` turns a number into a string with a decimal point in
 * it. Recharts does not care about the magnitude, and it means no float in
 * major units ever exists to be rounded twice.
 *
 * Colours are categorical slots 1–4 of the validated dark palette, in fixed
 * order. They passed the lightness band, chroma floor, CVD separation,
 * normal-vision floor and 3:1 contrast against this app's own panel surface.
 */
const SERIES = [
  { key: 'licence', label: 'Licence', colour: '#3987e5' },
  { key: 'support', label: 'Support', colour: '#d95926' },
  { key: 'infra', label: 'Infrastructure', colour: '#199e70' },
  { key: 'people', label: 'People', colour: '#c98500' },
] as const;

/** The panel colour. Painted between stacked segments as a 2px gap, not a border. */
const SURFACE = '#111820';
const GRID = '#22303f';
const TEXT = '#93a4b8';

export interface CategoryCost {
  readonly label: string;
  readonly licence: number;
  readonly support: number;
  readonly infra: number;
  readonly people: number;
}

export interface CashflowYear {
  readonly label: string;
  readonly amount: number;
}

function MoneyTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: readonly { name?: string; value?: number; color?: string }[];
  label?: string;
  currency: CurrencyCode;
}) {
  if (active !== true || payload === undefined || payload.length === 0) return null;

  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0);

  return (
    <div className="border-line bg-panel-raised rounded border px-2.5 py-2 text-xs shadow-lg">
      <p className="text-ink mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-muted flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-[1px]"
            style={{ background: entry.color }}
          />
          <span className="flex-1">{entry.name}</span>
          <span className="tabular text-ink">
            {formatMoney({ amountMinor: entry.value ?? 0, currency })}
          </span>
        </p>
      ))}
      {payload.length > 1 && (
        <p className="border-line text-muted mt-1 flex justify-between gap-3 border-t pt-1">
          <span>Total</span>
          <span className="tabular text-ink">{formatMoney({ amountMinor: total, currency })}</span>
        </p>
      )}
    </div>
  );
}

export function CostByCategoryChart({
  data,
  currency,
}: {
  data: readonly CategoryCost[];
  currency: CurrencyCode;
}) {
  return (
    // Taller than the cash-flow chart because the category axis is angled, and
    // the angled labels need roughly 90px of their own before the plot area
    // starts.
    <ResponsiveContainer width="100%" height={352}>
      <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tick={{ fill: TEXT, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          // Every category, always: dropping one silently would be a category
          // the analyst is paying for and cannot see.
          interval={0}
          // A full bundle is now thirteen categories in a half-width card —
          // about 44px per band — and the longest label ("Vulnerability
          // management") is nearer 130px. Horizontal labels overlapped into
          // mush the moment the catalog grew past four categories. Angled, the
          // collision constraint is the label's height against the band width
          // rather than its length, which 44px clears comfortably.
          angle={-35}
          textAnchor="end"
          height={92}
        />
        <YAxis
          tick={{ fill: TEXT, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={62}
          tickFormatter={(value: number) =>
            formatMoney({ amountMinor: value, currency }, { compact: true })
          }
        />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
          content={<MoneyTooltip currency={currency} />}
          // The hit area is the whole column band, not the 24px mark.
          shared
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: TEXT, paddingTop: 4 }}
          iconType="square"
          iconSize={8}
        />
        {SERIES.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stackId="cost"
            fill={series.colour}
            maxBarSize={24}
            // The 2px separation between segments is the surface colour showing
            // through, not a border drawn around the mark.
            stroke={SURFACE}
            strokeWidth={2}
            {...(index === SERIES.length - 1 ? { radius: [4, 4, 0, 0] as [number, number, number, number] } : {})}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({
  data,
  currency,
}: {
  data: readonly CashflowYear[];
  currency: CurrencyCode;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={[...data]} margin={{ top: 20, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
        <XAxis
          dataKey="label"
          tick={{ fill: TEXT, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
        />
        <YAxis
          tick={{ fill: TEXT, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={62}
          tickFormatter={(value: number) =>
            formatMoney({ amountMinor: value, currency }, { compact: true })
          }
        />
        <Tooltip cursor={{ fill: '#ffffff08' }} content={<MoneyTooltip currency={currency} />} />
        {/* One series, so no legend: the card's title already says what this is. */}
        <Bar dataKey="amount" name="Total cost" fill="#3987e5" maxBarSize={24} radius={[4, 4, 0, 0]}>
          <LabelList
            dataKey="amount"
            position="top"
            fill={TEXT}
            fontSize={11}
            formatter={(value: unknown) =>
              typeof value === 'number'
                ? formatMoney({ amountMinor: value, currency }, { compact: true })
                : ''
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
