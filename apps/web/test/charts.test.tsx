// @vitest-environment jsdom

// The two Recharts figures in §8.3, which had never been observed working.
//
// They are client components: `curl` on the results page returns the container
// div and zero `<svg>` elements, so five sessions of "verified over HTTP"
// proved nothing at all about them. Browser automation has been unavailable
// throughout. This is the substitute — render them into a DOM and read the axis
// back out.
//
// What it does and does not prove. It proves the charts render without
// throwing, that the money axis labels are the ones intended and are distinct,
// and — since the category chart became horizontal — that every category sits
// on its own row far enough from its neighbours to be unable to overlap.
//
// That last one used to be outside reach. jsdom measures no text, so whether
// thirteen *angled* labels collided was unanswerable here, and they did
// collide; it took opening the page to find out. Rows removed the question
// rather than answering it: with horizontal labels the only collision
// constraint is row spacing, which is a number, and a number is testable.

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { categoryChartHeight } from '../src/components/results/chart-geometry';
import { CashflowChart, CostByCategoryChart } from '../src/components/results/cost-charts';

/** What the page passes both charts. Only the row-count maths below cares. */
const CHART_HEIGHT = 420;

// Recharts measures its container; jsdom reports zero for everything, so the
// ResponsiveContainer needs an observer that tells it a real size once.
class StubResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ target, contentRect: { width: 900, height: 320 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // React only treats act() as configured when this is set, and without it
  // every render logs a warning that drowns the actual failure.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 900, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 320, configurable: true });
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: React.ReactElement): string {
  act(() => root.render(element));
  return container.innerHTML;
}

/**
 * Every string Recharts painted.
 *
 * Both element shapes, because it uses both: axis ticks are wrapped in a
 * `<tspan>`, and a `<LabelList>` above a bar is bare text inside `<text>`.
 * Matching only tspans finds the axis and silently misses every bar label —
 * which is exactly where the rounding defect was most misleading.
 */
function labels(markup: string): string[] {
  return [...markup.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((match) => match[1]!.replace(/<[^>]+>/g, '').trim())
    .filter((label) => label.length > 0);
}

/** A full bundle: thirteen categories, which is what broke the category axis. */
const CATEGORIES = [
  'SIEM',
  'EDR',
  'Network detection',
  'Privileged access',
  'Identity',
  'Vulnerability management',
  'Email security',
  'Automation',
  'Backup and recovery',
  'Firewall / NGFW',
  'Asset discovery',
  'Deception',
  'Managed detection',
];

const byCategory = CATEGORIES.map((label, index) => ({
  label,
  licence: index === 12 ? 17_010_000 : 0,
  support: 0,
  infra: index < 2 ? 631_900 : 108_000,
  people: 3_000_000 + index * 1_100_000,
}));

describe('the cost-by-category chart', () => {
  it('renders an SVG with every category on the axis', () => {
    // interval={0} is deliberate: dropping a label would hide a category the
    // client is paying for. Thirteen of them is the case that broke it.
    const markup = render(
      <CostByCategoryChart data={byCategory} currency="USD" height={CHART_HEIGHT} />,
    );

    expect(markup).toContain('<svg');
    const painted = labels(markup);
    for (const category of CATEGORIES) {
      expect(painted, `"${category}" is missing from the axis`).toContain(category);
    }
  });

  it('gives every y-axis tick a distinct label', () => {
    // The reported defect: $1.5M, $2.0M and $2.4M all rendered as "$2M", so the
    // same label appeared at three different heights. Checked here through
    // Recharts' own tick generation rather than against a tick set this test
    // made up.
    const markup = render(
      <CostByCategoryChart data={byCategory} currency="USD" height={CHART_HEIGHT} />,
    );
    const money = labels(markup).filter((label) => label.startsWith('$'));

    expect(money.length).toBeGreaterThan(2);
    expect(new Set(money).size, `duplicate axis labels: ${money.join(' ')}`).toBe(money.length);
  });

  it('lays the category labels out flat, one per row, with no rotation', () => {
    // This asserted `rotate(-35)` and passed for weeks. Opening the page in a
    // browser showed the angled labels overlapping anyway: a 130px label turned
    // 35° still projects about 106px along an axis whose bands are roughly
    // 44px, so "Vulnerability management", "Asset discovery", "Firewall / NGFW"
    // and "Email security" ran into each other. The test pinned the workaround
    // rather than the property the workaround was for.
    const markup = render(
      <CostByCategoryChart data={byCategory} currency="USD" height={CHART_HEIGHT} />,
    );
    expect(markup).not.toMatch(/rotate\(/);
  });

  it('gives every category its own row, far enough apart not to collide', () => {
    // The property the rotation was reaching for, and now checkable without a
    // browser: horizontal rows mean a label's *height* is the only collision
    // constraint, and height is a number jsdom reports even though it measures
    // no text. Thirteen distinct y positions, each at least a line-height
    // apart, cannot overlap however long the words are.
    const markup = render(
      <CostByCategoryChart data={byCategory} currency="USD" height={CHART_HEIGHT} />,
    );

    const ys = [...markup.matchAll(/<text[^>]*\sy="([\d.]+)"[^>]*text-anchor="end"/g)].map(
      (match) => Number(match[1]),
    );
    const rows = [...new Set(ys)].sort((a, b) => a - b);

    expect(rows).toHaveLength(CATEGORIES.length);
    for (let index = 1; index < rows.length; index += 1) {
      const gap = rows[index]! - rows[index - 1]!;
      expect(gap, `rows ${index - 1} and ${index} are ${gap}px apart`).toBeGreaterThanOrEqual(14);
    }
  });
});

/** Three years, with implementation dropping out after year one. */
const cashflow = [
  { label: 'Year 1', amount: 194_100_000 },
  { label: 'Year 2', amount: 164_276_600 },
  { label: 'Year 3', amount: 166_000_000 },
];

describe('the cash-flow chart', () => {
  it('renders an SVG with a bar label and an axis for each year', () => {
    const markup = render(<CashflowChart data={cashflow} currency="USD" height={CHART_HEIGHT} />);

    expect(markup).toContain('<svg');
    const painted = labels(markup);
    for (const year of ['Year 1', 'Year 2', 'Year 3']) {
      expect(painted).toContain(year);
    }
  });

  it('gives every y-axis tick a distinct label, on three near-identical years', () => {
    // Years 2 and 3 are within 1% of each other here, which is the shape a real
    // cash flow has once implementation drops out of year one. Before the fix
    // the ticks either side of them collapsed onto the same label.
    const markup = render(<CashflowChart data={cashflow} currency="USD" height={CHART_HEIGHT} />);
    const money = labels(markup).filter((label) => label.startsWith('$'));

    expect(money.length).toBeGreaterThan(2);
    expect(new Set(money).size, `duplicate axis labels: ${money.join(' ')}`).toBe(money.length);
  });

  it.skip('labels each bar with its own figure — NOT VERIFIABLE HEADLESSLY', () => {
    // ⚠ Left skipped deliberately rather than deleted, so the gap stays
    // visible. Recharts' <LabelList> paints nothing under jsdom: the only text
    // this chart produces here is the two axes, because a bar label needs the
    // bar's computed geometry and jsdom measures nothing.
    //
    // The content is not unchecked — the labels go through the same
    // formatMoney(..., { compact: true }) that format.test.ts sweeps for
    // collisions — but that they appear at all, above the right bars, is still
    // something only a browser can confirm.
    const markup = render(<CashflowChart data={cashflow} currency="USD" height={CHART_HEIGHT} />);
    const money = labels(markup).filter((label) => label.startsWith('$'));
    expect(money).toContain('$1.9M');
  });

  it('renders without a legend, because one series needs no key', () => {
    const markup = render(<CashflowChart data={cashflow} currency="USD" height={CHART_HEIGHT} />);
    expect(markup).not.toContain('recharts-legend');
  });
});

describe('both charts', () => {
  it('survive an empty bundle without throwing', () => {
    // A shortfall scenario funds nothing. The dashboard guards this upstream,
    // but a chart that throws on empty data takes the whole page with it.
    expect(() =>
      render(<CostByCategoryChart data={[]} currency="USD" height={CHART_HEIGHT} />),
    ).not.toThrow();
    expect(() =>
      render(<CashflowChart data={[]} currency="USD" height={CHART_HEIGHT} />),
    ).not.toThrow();
  });

  it('render in every supported currency', () => {
    for (const currency of ['USD', 'EUR', 'INR'] as const) {
      const markup = render(
        <CostByCategoryChart data={byCategory} currency={currency} height={CHART_HEIGHT} />,
      );
      expect(markup, `${currency} produced no chart`).toContain('<svg');
    }
  });

  it('take their height from the caller, so the two cards in a row agree', () => {
    // The charts sit in one grid row and the cards stretch to the taller of
    // them. When the cash flow sized itself at a fixed 300px and the category
    // chart grew with its row count, the difference was painted as a band of
    // empty panel under a three-bar chart — which reads as a chart that failed
    // to load rather than one with three data points.
    const height = categoryChartHeight(byCategory.length);
    const category = render(
      <CostByCategoryChart data={byCategory} currency="USD" height={height} />,
    );
    const cash = render(<CashflowChart data={cashflow} currency="USD" height={height} />);

    for (const markup of [category, cash]) {
      expect(markup).toMatch(new RegExp(`height="${height}"`));
    }
  });
});

describe('categoryChartHeight', () => {
  it('gives every category a row', () => {
    // Thirteen is a full bundle. The figure matters because it is also the
    // cash-flow chart's height, so a change here resizes a card it does not
    // name.
    expect(categoryChartHeight(13)).toBe(13 * 26 + 64);
    expect(categoryChartHeight(13)).toBeGreaterThan(categoryChartHeight(9));
  });

  it('keeps a floor, so a one-category bundle is still a chart', () => {
    // Without it a four-product Operable bundle would be 168px of axis and
    // legend with four hairlines in the middle.
    expect(categoryChartHeight(0)).toBe(220);
    expect(categoryChartHeight(4)).toBe(220);
  });
});
