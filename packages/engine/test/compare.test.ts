// Two scenarios, diffed (PROJECT_SPEC §11 phase 9).
//
// The tests that matter are the ones about not misleading: a comparison across
// two currencies must refuse to subtract, and flipping the two sides must tell
// the same story rather than an inverted one about who changed what.

import type {
  AssetInventory,
  ClientProfile,
  CurrencyCode,
  ProductCategory,
} from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { compareScenarios, runPipeline, type ComparisonSide } from '../src/index';
import {
  buildCategoryWeights,
  buildClientProfile,
  buildCostInputs,
  buildCoverageAssumptions,
  buildMsspRateCard,
  buildPortfolioAssumptions,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

function inventory(counts: Record<string, number>): AssetInventory {
  return {
    ...Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
    networkVendors: [],
  } as AssetInventory;
}

function product(id: string, category: ProductCategory, annualMinor: number) {
  const base = buildProduct({
    id,
    pricing: [
      {
        model: 'flat_tiered',
        tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(annualMinor) }],
      },
    ],
  });
  return {
    ...base,
    category,
    vendor: `${id} Inc.`,
    supports: { ...base.supports, deviceClasses: ['server' as const, 'workstation' as const] },
  };
}

const CATALOG = [
  product('edr-a', 'edr', 1_000_00),
  product('siem-a', 'siem', 2_000_00),
  product('iam-a', 'iam', 500_00),
];

function sideOf(
  name: string,
  overrides: { profile?: Partial<ClientProfile>; inventory?: AssetInventory } = {},
): ComparisonSide {
  const profile = buildClientProfile({
    orgName: name,
    employeeCount: 200,
    securityStaffFte: 2,
    budget: { annualCap: usd(50_000_00), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
    ...overrides.profile,
  });
  const inv = overrides.inventory ?? inventory({ windowsServers: 20, windowsEndpoints: 100 });

  const result = runPipeline({
    profile,
    inventory: inv,
    products: CATALOG,
    frameworks: new Map(),
    sizingAssumptions: buildSizingAssumptions(),
    categoryWeights: buildCategoryWeights(),
    scoringWeights: buildScoringWeights(),
    portfolioAssumptions: buildPortfolioAssumptions(),
    coverageAssumptions: buildCoverageAssumptions(),
    mssp: buildMsspRateCard(),
    costInputs: buildCostInputs(),
  });

  return {
    name,
    profile,
    inventory: inv,
    sizing: result.sizing,
    bundle: result.recommended,
    coverage: result.coverage,
  };
}

describe('comparing two scenarios', () => {
  it('reports no input differences when nothing was changed', () => {
    const comparison = compareScenarios(sideOf('A'), sideOf('B'));

    // orgName is not compared: naming the copy is not a change to the client.
    expect(comparison.inputs).toEqual([]);
    expect(comparison.categories.every((change) => change.kind === 'same')).toBe(true);
    expect(comparison.summary).toContain('Both scenarios recommend exactly the same stack.');
  });

  it('lists only the fields that differ, with the difference', () => {
    // An analyst clones a scenario to change one thing. A diff that also listed
    // the forty fields they did not touch would bury it.
    const comparison = compareScenarios(
      sideOf('Before'),
      sideOf('After', { profile: { securityStaffFte: 6 } }),
    );

    expect(comparison.inputs).toHaveLength(1);
    const change = comparison.inputs[0]!;
    expect(change.label).toBe('Security staff (FTE)');
    expect(change.kind).toBe('changed');
    expect(change.delta).toEqual({ kind: 'number', value: 4, decimals: 2 });
  });

  it('spots an inventory count that moved', () => {
    const comparison = compareScenarios(
      sideOf('Before'),
      sideOf('After', {
        inventory: inventory({ windowsServers: 20, windowsEndpoints: 400 }),
      }),
    );

    const change = comparison.inputs.find((entry) => entry.label === 'windowsEndpoints');
    expect(change?.delta).toEqual({ kind: 'number', value: 300, decimals: 0 });
  });

  it('tells the same story when the two sides are swapped', () => {
    // Neither side of a comparison is the original, which is why the kinds are
    // only-left and only-right rather than added and removed. Flipping the
    // order must not invent a direction of travel.
    const left = sideOf('A');
    const right = sideOf('B', { profile: { securityStaffFte: 6 } });

    const forward = compareScenarios(left, right);
    const backward = compareScenarios(right, left);

    expect(backward.inputs.map((change) => change.label)).toEqual(
      forward.inputs.map((change) => change.label),
    );
    expect(backward.categories.map((change) => change.category)).toEqual(
      forward.categories.map((change) => change.category),
    );
    for (const [index, change] of forward.categories.entries()) {
      const mirrored = backward.categories[index]!;
      expect(mirrored.kind).toBe(
        change.kind === 'only-left'
          ? 'only-right'
          : change.kind === 'only-right'
            ? 'only-left'
            : change.kind,
      );
    }
  });

  it('marks a category only one side funds', () => {
    const rich = sideOf('Rich');
    const poor: ComparisonSide = {
      ...rich,
      name: 'Poor',
      bundle: {
        ...rich.bundle,
        selections: rich.bundle.selections.filter((selection) => selection.category !== 'siem'),
      },
    };

    const comparison = compareScenarios(rich, poor);
    const siem = comparison.categories.find((change) => change.category === 'siem');

    expect(siem?.kind).toBe('only-left');
    expect(siem?.right).toBeNull();
    expect(comparison.summary.join(' ')).toContain('Funded only in Rich');
  });

  it('surfaces an unfunded compliance obligation on either side', () => {
    const left = sideOf('A');
    const starved: ComparisonSide = {
      ...left,
      name: 'Starved',
      bundle: { ...left.bundle, unfundedMandatory: ['pam'] as readonly ProductCategory[] },
    };

    expect(compareScenarios(left, starved).summary.join(' ')).toContain(
      'Starved leaves a compliance obligation unfunded',
    );
  });
});

describe('two currencies', () => {
  /** The same scenario, relabelled into another currency without converting. */
  function inCurrency(name: string, currency: CurrencyCode): ComparisonSide {
    const side = sideOf(name);
    const relabel = <T extends { amountMinor: number }>(money: T) => ({ ...money, currency });
    return {
      ...side,
      bundle: {
        ...side.bundle,
        currency,
        annualSpend: relabel(side.bundle.annualSpend),
        annualRecurring: relabel(side.bundle.annualRecurring),
        oneTime: relabel(side.bundle.oneTime),
        tco: relabel(side.bundle.tco),
      },
    };
  }

  it('refuses to subtract one currency from another', () => {
    // The failure this prevents is quiet: a number appears in the difference
    // column, it looks like an answer, and it is rupees minus dollars.
    const comparison = compareScenarios(inCurrency('US', 'USD'), inCurrency('India', 'INR'));

    expect(comparison.currencyMismatch).toEqual({ left: 'USD', right: 'INR' });
    for (const change of comparison.headlines) {
      const isMoney = change.left?.kind === 'money';
      if (isMoney)
        expect(change.delta, `${change.label} was subtracted across currencies`).toBeNull();
    }
  });

  it('says so at the top of the summary, not in a footnote', () => {
    const comparison = compareScenarios(inCurrency('US', 'USD'), inCurrency('India', 'INR'));
    expect(comparison.summary[0]).toContain('different currencies');
  });

  it('still compares everything that is not money', () => {
    // FTE, asset counts and coverage percentages are currency-free and remain
    // the most useful half of the comparison.
    const comparison = compareScenarios(inCurrency('US', 'USD'), inCurrency('India', 'INR'));
    const assets = comparison.headlines.find((change) => change.label === 'Monitored assets');
    expect(assets).toBeDefined();
    expect(assets?.kind).toBe('same');
  });
});

describe('determinism', () => {
  it('produces the same comparison twice', () => {
    const left = sideOf('A');
    const right = sideOf('B', { profile: { securityStaffFte: 6 } });
    expect(JSON.stringify(compareScenarios(left, right))).toBe(
      JSON.stringify(compareScenarios(left, right)),
    );
  });
});

describe('the budget caps', () => {
  // Both caps bind, and they bind independently. Only the annual one was
  // compared, so the demo pair built to show the point — one client, one
  // larger implementation budget — reported "no differences" in its inputs
  // while every output moved.
  it('spots a one-time cap that moved', () => {
    const comparison = compareScenarios(
      sideOf('Before', {
        profile: {
          budget: {
            annualCap: usd(50_000_00),
            oneTimeCap: usd(20_000_00),
            currency: 'USD',
            horizonYears: 3,
          },
        },
      }),
      sideOf('After', {
        profile: {
          budget: {
            annualCap: usd(50_000_00),
            oneTimeCap: usd(30_000_00),
            currency: 'USD',
            horizonYears: 3,
          },
        },
      }),
    );

    const change = comparison.inputs.find((entry) => entry.label === 'One-time budget cap');
    expect(change?.kind).toBe('changed');
    expect(change?.delta).toEqual({ kind: 'money', value: usd(10_000_00) });
  });

  it('still reports the annual cap, and only the cap that moved', () => {
    const comparison = compareScenarios(
      sideOf('Before'),
      sideOf('After', {
        profile: {
          budget: {
            annualCap: usd(90_000_00),
            oneTimeCap: null,
            currency: 'USD',
            horizonYears: 3,
          },
        },
      }),
    );

    expect(comparison.inputs.map((entry) => entry.label)).toEqual(['Annual budget cap']);
  });
});
