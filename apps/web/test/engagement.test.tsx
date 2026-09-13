// @vitest-environment jsdom

// The internal panel on the results page, rendered rather than assumed.
//
// `engagement.tsx` is a server component, so unlike the charts it does reach
// server HTML and an HTTP check would see it. It gets a render test anyway,
// for the reason `client-boundary.test.ts` exists: typecheck, lint and the
// whole engine suite were once green against a results page that fell through
// to the error boundary. A figure this panel shows is one an analyst quotes
// internally, and "it compiles" has already proven not to be the same claim as
// "it renders".
//
// The engine owns every number here (hard rule 4). What is checked is that the
// two halves of our run cost are both on the screen, that the margin carries
// its rate, and that none of it escapes into the half of the card an analyst
// turns toward the client.

import { runPipeline } from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Engagement } from '../src/components/results/engagement';
import { engineData, today } from '../src/lib/config.server';
import { NEW_INVENTORY, NEW_PROFILE } from '../src/lib/scenario';

const data = engineData();

/** A managed engagement with an estate big enough to consume a real rota. */
const profile: ClientProfile = {
  ...NEW_PROFILE,
  orgName: 'Rendered Hospital',
  employeeCount: 900,
  securityStaffFte: 2,
  deliveryModel: 'mssp_managed',
  serviceLevel: 'mdr',
};

const inventory = {
  ...NEW_INVENTORY,
  windowsEndpoints: { count: 900 },
  windowsServers: { count: 120 },
  m365Seats: { count: 900 },
  privilegedAccounts: { count: 30 },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(clientProfile: ClientProfile, showInternal = true) {
  const result = runPipeline({
    profile: clientProfile,
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
  act(() =>
    root.render(
      <Engagement
        bundle={result.recommended}
        profile={clientProfile}
        scenarioId="test-scenario"
        showInternal={showInternal}
      />,
    ),
  );
  return result.recommended.attribution;
}

describe('the engagement panel', () => {
  it('renders a managed engagement without throwing', () => {
    const attribution = render(profile);

    expect(container.textContent).toContain('What the client pays');
    expect(attribution.bySelection.length).toBeGreaterThan(0);
  });

  /**
   * The two halves of the run cost, on screen and labelled. Showing only the
   * total is how administration and the rota come to be read as one quantity,
   * which is the order-of-magnitude conflation `staffing.ts` exists to stop.
   */
  it('shows the rota and the administration separately, under the total', () => {
    const attribution = render(profile);
    const text = container.textContent ?? '';

    expect(attribution.providerMonitoringFte).toBeGreaterThan(0);
    expect(text).toContain('tool administration');
    expect(text).toContain('24/7 rota');
    expect(text).toContain('Costs us to run, per year');
  });

  /** The rate is the figure that makes the problem legible, not the amount. */
  it('puts the margin rate next to the margin, and states why it is not profit', () => {
    const attribution = render(profile);
    const text = container.textContent ?? '';

    expect(attribution.providerMarginRate).not.toBeNull();
    expect(text).toMatch(/\d+% of the fee/);
    expect(text).toContain('two rate cards that were not written about the same market');
  });

  /**
   * The leak guard, at the surface rather than in the engine. A client-operated
   * engagement has no internal panel at all, so nothing internal can be on the
   * screen an analyst turns around.
   */
  it('shows no internal figures at all when we operate nothing', () => {
    const attribution = render({
      ...profile,
      deliveryModel: 'client_operated',
      serviceLevel: null,
    });
    const text = container.textContent ?? '';

    expect(attribution.providerMonitoringFte).toBe(0);
    expect(text).not.toContain('Margin');
    expect(text).not.toContain('24/7 rota');
    expect(text).not.toContain('Internal view');
  });

  /**
   * The stronger guarantee, and the reason this stopped being a `<details>`.
   *
   * This is the screen an analyst turns toward the client. Collapsed-but-present
   * relies on nobody clicking a disclosure triangle during a screen-share, and
   * on the committed presets that triangle hides a margin above 90%. Off the
   * URL, the figures must not be in the document at all — not hidden in it.
   */
  it('keeps our fee, cost and margin out of the DOM unless the internal view is asked for', () => {
    const attribution = render(profile, false);
    const text = container.textContent ?? '';

    // The engagement itself is unchanged: this is a rendering decision.
    expect(attribution.providerMarginRate).not.toBeNull();

    expect(text).not.toContain('Margin');
    expect(text).not.toContain('Costs us to run');
    // "Our fee" stays: what the client pays us is the client's business, and
    // it is the headline of the visible half of this panel. What must not be
    // here is what that fee costs us and what is left of it.
    expect(text).toContain('Our fee');
    expect(text).not.toContain('tool administration');
    expect(text).not.toContain('of the fee');
    expect(text).not.toContain('two rate cards that were not written about the same market');

    // Still reachable, deliberately, by an act with a visible URL change.
    expect(text).toContain('Show what this engagement costs us');
  });
});
