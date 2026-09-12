// Smoke tests for the intake wizard's logic (PROJECT_SPEC §3: "UI gets smoke
// tests only").
//
// Everything asserted here is a rule about the domain rather than about layout:
// what a blank intake means, what survives a round trip through the database,
// what a currency change does to a figure the analyst typed, and whether the
// live readout is showing the engine's numbers or its own.

import { ClientProfile, Region } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { currencyByRegion, engineData, today } from '../src/lib/config.server';
import { summariseEstimate } from '../src/lib/estimate';
import { formatMoney, toMajorUnitsText, toMinorUnits } from '../src/lib/format';
import {
  NEW_INVENTORY,
  NEW_PROFILE,
  ScenarioDraft,
  isUnreadable,
  parseScenarioRow,
  profileFromPreset,
  withCurrency,
  withRegion,
} from '../src/lib/scenario';
import { convertMoney, runPipeline } from '@stackfit/engine';

const data = engineData();

function presetOrThrow(id: string) {
  const preset = data.presets.find((entry) => entry.id === id);
  if (preset === undefined) throw new Error(`expected the ${id} preset`);
  return preset;
}

function pipelineFor(profile: ClientProfile, inventory = NEW_INVENTORY) {
  return runPipeline({
    profile,
    inventory,
    products: data.catalog,
    frameworks: data.frameworks,
    sizingAssumptions: data.sizingAssumptions,
    categoryWeights: data.categoryWeights,
    scoringWeights: data.scoringWeights,
    portfolioAssumptions: data.portfolioAssumptions,
    coverageAssumptions: data.coverageAssumptions,
    mssp: data.mssp,
    costInputs: { ...data.costInputsWithoutDate, today: today() },
  });
}

describe('a blank intake', () => {
  it('is a valid ClientProfile, so every step really is skippable', () => {
    // §9 requires each step to be skippable with sane defaults. That is only
    // true if the defaults on their own pass the schema the engine demands.
    expect(ClientProfile.safeParse(NEW_PROFILE).success).toBe(true);
    expect(
      ScenarioDraft.safeParse({ id: 'x', profile: NEW_PROFILE, inventory: NEW_INVENTORY }).success,
    ).toBe(true);
  });

  it('runs the whole engine without an estate, and does not pretend it is free', () => {
    // An analyst who opens the tool and types nothing must still see a page.
    //
    // An empty inventory means "not asked", never "does not exist", so nothing
    // is eliminated and a stack is still proposed. Nothing is licensed, there
    // are no assets to license, but the figure is *not* zero: a self-hosted
    // tool still needs its minimum footprint, and somebody still has to run it.
    // That is the floor cost of owning these tools, and the readout labels it
    // as such rather than leaving a suspiciously cheap stack on screen.
    const blank = summariseEstimate(pipelineFor(NEW_PROFILE));

    expect(blank.sizing.monitoredAssetCount).toBe(0);
    expect(blank.recommended.totalOpsFte).toBeGreaterThan(0);
    expect(blank.recommended.annualSpend.amountMinor).toBeGreaterThan(0);

    // And it costs less than a real estate, which is the property that matters:
    // the figures move with what the analyst captures.
    const retail = data.presets.find((entry) => entry.id === 'retail-chain-40-stores');
    if (retail === undefined) throw new Error('expected the retail preset');
    const real = summariseEstimate(pipelineFor(profileFromPreset(retail), retail.inventory));

    expect(real.recommended.annualSpend.currency).toBe(blank.recommended.annualSpend.currency);
    expect(real.recommended.annualSpend.amountMinor).toBeGreaterThan(
      blank.recommended.annualSpend.amountMinor,
    );
  });
});

describe('the storage boundary', () => {
  const row = {
    id: 'abc',
    name: 'Acme',
    profile: JSON.stringify(NEW_PROFILE),
    inventory: JSON.stringify(NEW_INVENTORY),
    overrides: '{}',
    updatedAt: new Date('2026-09-11T10:00:00.000Z'),
  };

  it('round-trips a scenario through JSON text', () => {
    const parsed = parseScenarioRow(row);
    expect(isUnreadable(parsed)).toBe(false);
    if (isUnreadable(parsed)) return;
    expect(parsed.profile).toEqual(NEW_PROFILE);
    expect(parsed.inventory).toEqual(NEW_INVENTORY);
  });

  it('drops an unreadable override rather than losing the scenario', () => {
    // An override is a convenience layer over defaults that are always valid.
    // Losing one costs a re-type; refusing to open the scenario would cost far
    // more, so the two failures are deliberately not treated alike.
    const parsed = parseScenarioRow({ ...row, overrides: '{"peakFactor":"loud"}' });
    expect(isUnreadable(parsed)).toBe(false);
    if (isUnreadable(parsed)) return;
    expect(parsed.overrides).toEqual({ eventsPerSecond: {} });
  });

  it('reports a row it cannot read instead of throwing', () => {
    // One row written before a schema change must not take down the list of
    // every other scenario.
    const broken = parseScenarioRow({ ...row, profile: '{"orgName":' });
    expect(isUnreadable(broken)).toBe(true);

    const stale = parseScenarioRow({ ...row, profile: JSON.stringify({ orgName: 'Acme' }) });
    expect(isUnreadable(stale)).toBe(true);
    if (!isUnreadable(stale)) return;
    expect(stale.problem).toContain('does not match the current schema');
  });
});

describe('the money boundary', () => {
  it('parses what an analyst types into minor units', () => {
    expect(toMinorUnits('25000', 'USD')).toBe(2_500_000);
    expect(toMinorUnits('25,000', 'USD')).toBe(2_500_000);
    expect(toMinorUnits('1234.56', 'USD')).toBe(123_456);
    // Blank is "not stated", which is not zero.
    expect(toMinorUnits('', 'USD')).toBeNull();
    expect(toMinorUnits('-5', 'USD')).toBeNull();
    expect(toMinorUnits('abc', 'USD')).toBeNull();
  });

  it('renders minor units back without inventing precision', () => {
    expect(toMajorUnitsText({ amountMinor: 2_500_000, currency: 'USD' })).toBe('25000');
    expect(toMajorUnitsText({ amountMinor: 123_456, currency: 'USD' })).toBe('1234.56');
    expect(toMajorUnitsText(null)).toBe('');
    expect(formatMoney({ amountMinor: 2_500_000, currency: 'USD' })).toBe('$25,000');
  });

  it('re-labels the caps on a currency change and never converts them', () => {
    // Converting silently would change a figure the analyst typed, which is
    // the one thing the money rules exist to prevent.
    const priced: ClientProfile = {
      ...NEW_PROFILE,
      budget: {
        annualCap: { amountMinor: 2_500_000, currency: 'INR' },
        oneTimeCap: null,
        currency: 'INR',
        horizonYears: 3,
      },
    };
    const inUsd = withCurrency(priced, 'USD');

    expect(inUsd.budget.currency).toBe('USD');
    expect(inUsd.budget.annualCap?.currency).toBe('USD');
    expect(inUsd.budget.annualCap?.amountMinor).toBe(2_500_000);
    expect(ClientProfile.safeParse(inUsd).success).toBe(true);
  });

  it('re-labelling a preset cap changes what it is worth by two orders of magnitude', () => {
    // The reported bug, as arithmetic. The manufacturer preset arrives with a
    // real EUR 250,000 budget. Re-labelling it INR leaves the digits alone and
    // turns it into about EUR 2,750, which moves the recommendation and
    // reports a shortfall that is an artifact of the relabelling.
    //
    // This is not asserting that re-labelling is wrong. It is asserting that
    // the two readings are far enough apart that the interface cannot pick one
    // silently, which is what `StepBudget` now refuses to do.
    const preset = data.presets.find((entry) => entry.id === 'manufacturer-two-plants');
    if (preset === undefined) throw new Error('expected the manufacturer preset');

    // A preset profile has no orgName until profileFromPreset adds it.
    const profile = profileFromPreset(preset);
    const stated = profile.budget.annualCap;
    expect(stated).not.toBeNull();
    expect(stated?.currency).toBe('EUR');

    const relabelled = withCurrency(profile, 'INR').budget.annualCap;
    const converted = convertMoney(stated!, 'INR', data.fx);

    // Same digits, different money.
    expect(relabelled?.amountMinor).toBe(stated?.amountMinor);
    expect(relabelled?.currency).toBe('INR');
    expect(converted.currency).toBe('INR');
    expect(converted.amountMinor).toBeGreaterThan(relabelled!.amountMinor * 50);
  });

  it('converts both caps together, and leaves an unset one unset', () => {
    // The manufacturer states an annual cap and no one-time cap. Converting
    // must not invent the second one.
    const profile: ClientProfile = {
      ...NEW_PROFILE,
      budget: {
        annualCap: { amountMinor: 25_000_000, currency: 'EUR' },
        oneTimeCap: null,
        currency: 'EUR',
        horizonYears: 3,
      },
    };
    const annual = convertMoney(profile.budget.annualCap!, 'INR', data.fx);
    expect(annual.currency).toBe('INR');
    expect(annual.amountMinor).toBeGreaterThan(0);
    expect(profile.budget.oneTimeCap).toBeNull();
  });

  it('round-trips a conversion back to within a rounding unit', () => {
    // EUR to INR and back has to land on the figure it started from, or an
    // analyst toggling the currency twice watches the budget drift.
    const start = { amountMinor: 25_000_000, currency: 'EUR' as const };
    const there = convertMoney(start, 'INR', data.fx);
    const back = convertMoney(there, 'EUR', data.fx);
    expect(Math.abs(back.amountMinor - start.amountMinor)).toBeLessThanOrEqual(1);
  });
});

describe('changing the region', () => {
  const rates = currencyByRegion();

  it('takes its currency mapping from the labour rate card, for every region', () => {
    // The rate card holds each region's pay in the currency that region is
    // actually paid in, which makes it the one place this mapping exists. If a
    // region is ever added without a rate, this fails rather than silently
    // leaving that client priced in whatever was there before.
    for (const region of Region.options) {
      expect(rates[region], `${region} has no currency`).toBeDefined();
    }
    expect(rates.in).toBe('INR');
    expect(rates.us).toBe('USD');
    expect(rates.eu).toBe('EUR');
    // GBP is not a supported scenario currency yet; the rate card says so too.
    expect(rates.uk).toBe('USD');
  });

  it('converts the caps rather than re-labelling them', () => {
    // The opposite of a currency change, and deliberately so. "This client is
    // in the United States" is a statement about the client; the budget they
    // stated is the same money either way.
    const profile: ClientProfile = {
      ...NEW_PROFILE,
      region: 'in',
      budget: {
        annualCap: { amountMinor: 600_000_000, currency: 'INR' },
        oneTimeCap: { amountMinor: 100_000_000, currency: 'INR' },
        currency: 'INR',
        horizonYears: 3,
      },
    };

    const moved = withRegion(profile, 'us', rates, data.fx);

    expect(moved.region).toBe('us');
    expect(moved.budget.currency).toBe('USD');
    expect(moved.budget.annualCap?.currency).toBe('USD');
    expect(moved.budget.oneTimeCap?.currency).toBe('USD');
    // INR 6,000,000 is a low five-figure dollar sum, not six million dollars.
    expect(moved.budget.annualCap?.amountMinor).toBe(
      convertMoney(profile.budget.annualCap!, 'USD', data.fx).amountMinor,
    );
    expect(moved.budget.annualCap!.amountMinor).toBeLessThan(
      profile.budget.annualCap!.amountMinor / 50,
    );
  });

  it('leaves an unset cap unset', () => {
    const moved = withRegion(NEW_PROFILE, 'us', rates, data.fx);
    expect(moved.budget.currency).toBe('USD');
    expect(moved.budget.annualCap).toBeNull();
    expect(moved.budget.oneTimeCap).toBeNull();
  });

  it('touches nothing when the region shares the current currency', () => {
    // apac and us are both USD. Moving between them must not run a conversion,
    // which at a 1:1 rate would still be a needless rewrite of the figure.
    const inUs: ClientProfile = {
      ...NEW_PROFILE,
      region: 'us',
      budget: {
        annualCap: { amountMinor: 12_000_000, currency: 'USD' },
        oneTimeCap: null,
        currency: 'USD',
        horizonYears: 3,
      },
    };
    const moved = withRegion(inUs, 'apac', rates, data.fx);
    expect(moved.region).toBe('apac');
    expect(moved.budget).toEqual(inUs.budget);
  });

  it('still produces a valid profile', () => {
    const moved = withRegion(
      profileFromPreset(presetOrThrow('retail-chain-40-stores')),
      'eu',
      rates,
      data.fx,
    );
    expect(ClientProfile.safeParse(moved).success).toBe(true);
    expect(moved.budget.currency).toBe('EUR');
  });

  it('round-trips a region change back to within a rupee', () => {
    // in -> us -> in does not land exactly on the figure it started from, and
    // cannot: INR 6,000,000 is USD 63,263.05-and-then-some, the cent is the
    // smallest unit a dollar figure has, and half a cent is about half a rupee
    // on the way back. Measured drift here is 14 paise on a 60 lakh budget.
    //
    // Asserting equality would be asserting something arithmetic does not do.
    // What is worth pinning is that the error stays inside one unit of the
    // currency it passed through, so an analyst correcting a mis-click sees the
    // same budget rather than a slowly moving one.
    const start: ClientProfile = {
      ...NEW_PROFILE,
      region: 'in',
      budget: {
        annualCap: { amountMinor: 600_000_000, currency: 'INR' },
        oneTimeCap: null,
        currency: 'INR',
        horizonYears: 3,
      },
    };
    const back = withRegion(withRegion(start, 'us', rates, data.fx), 'in', rates, data.fx);
    expect(back.budget.currency).toBe('INR');
    const drift = Math.abs(
      back.budget.annualCap!.amountMinor - start.budget.annualCap!.amountMinor,
    );
    // One cent, expressed in paise, is the ceiling the intermediate rounding
    // can produce. Under a rupee on a figure of sixty lakh.
    expect(drift).toBeLessThan(100);
  });
});

describe('the live estimate', () => {
  const preset = data.presets.find((entry) => entry.id === 'retail-chain-40-stores');
  if (preset === undefined) throw new Error('expected the retail preset');
  const result = pipelineFor(profileFromPreset(preset), preset.inventory);
  const summary = summariseEstimate(result);

  it('shows the engine’s numbers rather than its own', () => {
    // Hard rule 4: the summary is a projection, not a second calculation. If
    // these ever diverge, a figure on screen and a figure in the proposal are
    // disagreeing about the same stack.
    expect(summary.recommended.annualSpend).toEqual(result.recommended.annualSpend);
    expect(summary.recommended.tco).toEqual(result.recommended.tco);
    expect(summary.recommended.totalOpsFte).toBe(result.recommended.totalOpsFte);
    expect(summary.sizing.epsTotal).toBe(result.sizing.epsTotal);
    expect(summary.essential.selections.length).toBe(result.essential.selections.length);
  });

  it('reports the three bundles in the scenario currency', () => {
    expect(summary.currency).toBe('INR');
    for (const bundle of [summary.essential, summary.recommended, summary.ideal]) {
      expect(bundle.annualSpend.currency).toBe('INR');
      expect(bundle.tco.currency).toBe('INR');
    }
  });

  it('surfaces what must not reach a client unchecked', () => {
    // PCI DSS is graded secondary_sources in the committed library, and the
    // readout has to say so rather than showing a clean coverage figure.
    expect(summary.warnings.join(' ')).toContain('Payment Card Industry');
    expect(summary.warnings.join(' ')).toContain('secondary sources');
  });

  it('keeps people out of the procurement figure', () => {
    // The same split the budget knapsack makes. If these were equal, salary
    // would be being charged to a purchase order.
    expect(summary.recommended.annualRecurring.amountMinor).toBeGreaterThan(
      summary.recommended.annualSpend.amountMinor,
    );
    expect(summary.recommended.totalOpsFte).toBeGreaterThan(0);
  });
});
