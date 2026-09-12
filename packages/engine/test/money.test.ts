import type { FxConfig } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import {
  addMoney,
  convertMoney,
  moneyInWords,
  scaleMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '../src/index';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });
const inr = (amountMinor: number) => ({ amountMinor, currency: 'INR' as const });

const fx: FxConfig = {
  base: 'USD',
  asOf: '2026-09-09',
  rates: [
    { currency: 'USD', rateMicros: 1_000_000 },
    { currency: 'INR', rateMicros: 94_843_169 },
    { currency: 'EUR', rateMicros: 860_279 },
  ],
  sources: [{ url: 'https://example.com/fx', asOf: '2026-09-09' }],
};

describe('money arithmetic', () => {
  it('adds within a currency', () => {
    expect(addMoney(usd(1000), usd(250))).toEqual(usd(1250));
  });

  it('refuses to add across currencies rather than guessing a rate', () => {
    expect(() => addMoney(usd(1000), inr(1000))).toThrow(/convert first/);
  });

  it('sums an empty list to zero in the stated currency', () => {
    expect(sumMoney('EUR', [])).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('subtracts', () => {
    expect(subtractMoney(usd(1000), usd(150))).toEqual(usd(850));
  });

  it('scales by a fractional factor and rounds to whole minor units', () => {
    // 59.99 × 3 endpoints = 179.97
    expect(scaleMoney(usd(5999), 3)).toEqual(usd(17997));
    // A third of a cent is not invoiceable.
    expect(scaleMoney(usd(100), 0.333)).toEqual(usd(33));
  });

  it('rounds half away from zero, not toward positive infinity', () => {
    expect(scaleMoney(usd(1), 0.5)).toEqual(usd(1));
    expect(scaleMoney(usd(-1), 0.5)).toEqual(usd(-1));
  });

  it('rejects a non-finite scale factor rather than producing NaN money', () => {
    expect(() => scaleMoney(usd(100), Number.NaN)).toThrow();
    expect(() => scaleMoney(usd(100), Number.POSITIVE_INFINITY)).toThrow();
  });

  it('zero is zero in every currency', () => {
    expect(zeroMoney('INR')).toEqual(inr(0));
  });
});

describe('currency conversion', () => {
  it('is the identity within one currency', () => {
    expect(convertMoney(usd(12345), 'USD', fx)).toEqual(usd(12345));
  });

  it('converts USD to INR at the configured rate', () => {
    // USD 100.00 × 94.843169 = INR 9,484.32
    expect(convertMoney(usd(10_000), 'INR', fx)).toEqual(inr(948_432));
  });

  it('converts back within a minor unit', () => {
    const there = convertMoney(usd(10_000), 'INR', fx);
    const back = convertMoney(there, 'USD', fx);
    expect(Math.abs(back.amountMinor - 10_000)).toBeLessThanOrEqual(1);
  });

  it('stays exact on amounts far beyond 2^53 when multiplied by a rate', () => {
    // INR 100,000,000.00 is 10^10 minor units. Multiplied by a rate in
    // millionths that is ~10^16. Past the point where a JS number stops being
    // exact. BigInt keeps it correct.
    const large = inr(10_000_000_000);
    const converted = convertMoney(large, 'USD', fx);
    expect(Number.isSafeInteger(converted.amountMinor)).toBe(true);
    // 10^10 × 10^6 / 94,843,169 = 105,437,219.4 → 105,437,219
    expect(converted.amountMinor).toBe(105_437_219);
  });

  it('throws for a currency missing from the rate table', () => {
    const incomplete: FxConfig = { ...fx, rates: fx.rates.slice(0, 1) };
    expect(() => convertMoney(usd(100), 'INR', incomplete)).toThrow(/no FX rate for INR/);
  });

  it('is deterministic: the same conversion twice gives the same minor units', () => {
    const first = convertMoney(inr(123_456_789), 'EUR', fx);
    const second = convertMoney(inr(123_456_789), 'EUR', fx);
    expect(second).toEqual(first);
  });
});

describe('money in a rationale sentence', () => {
  // These strings land next to figures the interface rendered itself. When the
  // two disagree about notation, a reader has to work out whether "USD 2,604"
  // and "$411,903" are the same money: in a document about budgets.
  it('writes money the way the interface does', () => {
    expect(moneyInWords({ amountMinor: 411_903_00, currency: 'USD' })).toBe('$411,903');
    // Lakh grouping, not Western. India is this tool's primary region, so
    // ₹20,389,840 was the common case rendered in the foreign convention.
    expect(moneyInWords({ amountMinor: 2_038_984_00, currency: 'INR' })).toBe('₹20,38,984');
    expect(moneyInWords({ amountMinor: 85_222_00, currency: 'EUR' })).toBe('€85,222');
  });

  it('never writes a bare currency code before a figure', () => {
    // The shape that caused the confusion.
    for (const currency of ['USD', 'INR', 'EUR'] as const) {
      expect(moneyInWords({ amountMinor: 1_234_00, currency })).not.toMatch(/^[A-Z]{3} /);
    }
  });

  it('rounds to whole units, because a rationale is not an invoice', () => {
    expect(moneyInWords({ amountMinor: 2_604_49, currency: 'USD' })).toBe('$2,604');
    expect(moneyInWords({ amountMinor: 2_604_50, currency: 'USD' })).toBe('$2,605');
  });

  it('does not vary with the reader, so one scenario reads the same to everyone', () => {
    expect(moneyInWords({ amountMinor: 1_000_000_00, currency: 'USD' })).toBe(
      moneyInWords({ amountMinor: 1_000_000_00, currency: 'USD' }),
    );
  });
});
