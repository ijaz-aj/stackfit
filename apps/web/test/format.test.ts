// The money render boundary (CONTRIBUTING.md hard rule 1).
//
// These exist because a chart axis showed "$2M" at three different heights.
// Compact notation was being given `maximumFractionDigits: 0`, which collapses
// every value inside a magnitude bucket onto one label, and nothing in the
// suite would have caught it: the charts are client-rendered, so the
// server-side HTML checks that had been standing in for a browser could never
// see an axis label at all.

import { describe, expect, it } from 'vitest';

import { formatMoney } from '../src/lib/format';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

/**
 * A nice-numbered tick set over a zero-based domain, which is the shape a
 * Recharts bar chart produces: the step is rounded up to 1, 2, 2.5 or 5 times
 * a power of ten, and the ticks run from zero.
 */
function niceTicks(maxMinor: number, count: number): number[] {
  const raw = maxMinor / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step =
    (normalised <= 1
      ? 1
      : normalised <= 2
        ? 2
        : normalised <= 2.5
          ? 2.5
          : normalised <= 5
            ? 5
            : 10) * magnitude;
  return Array.from({ length: count }, (_, index) => index * step);
}

describe('formatMoney', () => {
  it('formats whole money at the render boundary', () => {
    expect(formatMoney(usd(2_500_000))).toBe('$25,000');
    expect(formatMoney(usd(0))).toBe('$0');
    expect(formatMoney(usd(123_456), { decimals: 2 })).toBe('$1,234.56');
  });

  it('keeps distinct compact values distinct', () => {
    // The exact defect, as observed: three different figures, one label.
    // 1.5M and 2.4M both used to render as "$2M".
    expect(formatMoney(usd(150_000_000), { compact: true })).toBe('$1.5M');
    expect(formatMoney(usd(200_000_000), { compact: true })).toBe('$2M');
    expect(formatMoney(usd(240_000_000), { compact: true })).toBe('$2.4M');

    const labels = [150_000_000, 200_000_000, 240_000_000].map((minor) =>
      formatMoney(usd(minor), { compact: true }),
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('does not pad a round compact value with a pointless decimal', () => {
    // "$2.0M" would be noise on an axis; "$2M" is what a reader expects.
    expect(formatMoney(usd(200_000_000), { compact: true })).toBe('$2M');
    expect(formatMoney(usd(50_000_000), { compact: true })).toBe('$500K');
    expect(formatMoney(usd(0), { compact: true })).toBe('$0');
  });

  it('never renders two ticks of a nice-numbered axis with the same label', () => {
    // The property that matters, asserted rather than reasoned about. A bar
    // chart's y domain starts at zero, so this sweeps the tick sets Recharts
    // can actually produce across four decades of magnitude.
    const collisions: string[] = [];

    for (
      let maxMinor = 100_000;
      maxMinor <= 500_000_000_000;
      maxMinor = Math.ceil(maxMinor * 1.07)
    ) {
      for (const count of [4, 5, 6, 7]) {
        const labels = niceTicks(maxMinor, count).map((minor) =>
          formatMoney(usd(minor), { compact: true }),
        );
        if (new Set(labels).size !== labels.length) {
          collisions.push(`max ${maxMinor}, ${count} ticks: ${labels.join(' ')}`);
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it('compacts every supported currency without losing precision', () => {
    // en-US compact units (K/M/B) are used for all three currencies, which is a
    // deliberate consequence of formatting in one locale. What must not vary is
    // that distinct amounts stay distinct.
    for (const currency of ['USD', 'EUR', 'INR'] as const) {
      const labels = [150_000_000, 200_000_000, 240_000_000].map((amountMinor) =>
        formatMoney({ amountMinor, currency }, { compact: true }),
      );
      expect(new Set(labels).size, `${currency} collapsed distinct amounts`).toBe(3);
    }
  });
});

describe('each currency in its own reading convention', () => {
  // India is this tool's primary region, and rupees were being grouped the
  // Western way: ₹20,389,840 for a figure an Indian reader parses as
  // ₹2,03,89,840. The common case was rendered in the foreign convention.
  it('groups rupees in lakh and crore', () => {
    // 2,038,984,000 minor = ₹20,389,840, which an Indian reader writes
    // ₹2,03,89,840, two crore, three lakh, eighty-nine thousand.
    expect(formatMoney({ amountMinor: 2_038_984_000, currency: 'INR' })).toBe('₹2,03,89,840');
    expect(formatMoney({ amountMinor: 203_898_400, currency: 'INR' })).toBe('₹20,38,984');
  });

  it('expresses rupee magnitudes in crore, not millions', () => {
    // ₹164M is not a quantity anyone in India states out loud.
    expect(formatMoney({ amountMinor: 16_40_00_000_00, currency: 'INR' }, { compact: true })).toBe(
      '₹16.4Cr',
    );
  });

  it('leaves the other currencies in theirs', () => {
    expect(formatMoney({ amountMinor: 1_642_766_00, currency: 'USD' })).toBe('$1,642,766');
    expect(formatMoney({ amountMinor: 1_642_766_00, currency: 'USD' }, { compact: true })).toBe(
      '$1.6M',
    );
  });

  it('keys off the currency, never the reader', () => {
    // A figure is a fact about the client's money, not about who is looking.
    // Two analysts opening one proposal must see identical numbers.
    const once = formatMoney({ amountMinor: 20_38_984_00, currency: 'INR' });
    expect(formatMoney({ amountMinor: 20_38_984_00, currency: 'INR' })).toBe(once);
  });
});
