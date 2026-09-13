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
 * §8.3, where the money goes, and when.
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

/*
 * These three must track `globals.css`. They cannot be tokens: Recharts writes
 * `fill` and `stroke` as SVG presentation attributes, which take a colour, not
 * a class. They went stale once already. The palette moved to neutral and
 * these kept the old blue-grey, so the gap between stacked segments was painted
 * in a panel colour the panel no longer used.
 */
/** `--color-panel`. Painted between stacked segments as a 2px gap, not a border. */
const SURFACE = '#ffffff';
/** `--color-line`. */
const GRID = '#dfddd6';
/** `--color-faint`: 4.50:1, which an 11px axis tick needs. */
const TEXT = '#756f7b';

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
    <div className="border-line bg-panel-raised rounded border px-3 py-2 text-xs shadow-lg">
      <p className="text-ink mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-muted flex items-center gap-2">
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
  height,
}: {
  data: readonly CategoryCost[];
  currency: CurrencyCode;
  height: number;
}) {
  return (
    // Horizontal bars, one row per category.
    //
    // This axis was angled at -35°, on the reasoning that the collision
    // constraint becomes the label's *height* against the band width. Looking
    // at it in a browser, that reasoning was wrong: a 130px label rotated 35°
    // still projects about 106px along the axis, against a band of roughly
    // 44px, so "Vulnerability management", "Asset discovery", "Firewall / NGFW"
    // and "Email security" all ran into each other.
    //
    // Turning the chart on its side removes the constraint rather than
    // negotiating with it. Every category gets a full row, the labels are
    // horizontal and left-aligned so they are read rather than deciphered, and
    // the bars all start from a common baseline on the left, which is the
    // comparison the card exists to support. 26px per row keeps thirteen
    // categories inside roughly the height the angled version needed.
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={[...data]}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
      >
        <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
        <XAxis
          type="number"
          tick={{ fill: TEXT, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          tickFormatter={(value: number) =>
            formatMoney({ amountMinor: value, currency }, { compact: true })
          }
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fill: TEXT, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          // Every category, always: dropping one silently would be a category
          // the analyst is paying for and cannot see.
          interval={0}
          // Fits "Vulnerability management", the longest label in the catalog,
          // without truncation.
          width={132}
        />
        <Tooltip
          cursor={{ fill: '#1c242c0d' }}
          content={<MoneyTooltip currency={currency} />}
          // The hit area is the whole row band, not the 14px mark.
          shared
        />
        {/*
          The label is neutral; the swatch carries the colour.

          Recharts writes each legend entry's text in its own series colour and
          that inline style beats `wrapperStyle`, so the four labels rendered in
          the four series colours at 11px. Measured against white: 3.07 to 3.88,
          all under AA, and the palette cannot be darkened to fix it without
          changing marks that are already validated. A `formatter` is the only
          hook that reaches the text, and colouring a label as well as its
          swatch was redundant anyway.
        */}
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          iconType="square"
          iconSize={8}
          formatter={(value: string) => <span style={{ color: TEXT }}>{value}</span>}
        />
        {SERIES.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label}
            stackId="cost"
            fill={series.colour}
            maxBarSize={14}
            // The 2px separation between segments is the surface colour showing
            // through, not a border drawn around the mark.
            stroke={SURFACE}
            strokeWidth={2}
            {...(index === SERIES.length - 1
              ? { radius: [0, 3, 3, 0] as [number, number, number, number] }
              : {})}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({
  data,
  currency,
  height,
}: {
  data: readonly CashflowYear[];
  currency: CurrencyCode;
  height: number;
}) {
  return (
    // Height comes from the category chart next to it, and the bars are capped
    // rather than left to divide the width between them: three bars sharing a
    // third of the row would each be 90px of solid colour, which reads as a
    // block diagram rather than a comparison of three numbers.
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={[...data]} margin={{ top: 24, right: 8, bottom: 4, left: 8 }}>
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
        <Tooltip cursor={{ fill: '#1c242c0d' }} content={<MoneyTooltip currency={currency} />} />
        {/* One series, so no legend: the card's title already says what this is. */}
        <Bar
          dataKey="amount"
          name="Total cost"
          fill="#3987e5"
          maxBarSize={72}
          radius={[4, 4, 0, 0]}
        >
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
