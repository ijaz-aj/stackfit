// @vitest-environment jsdom

// The panel that answers the page before the page starts working.
//
// Rendered rather than assumed, for the reason `client-boundary.test.ts`
// exists: typecheck, lint and 700-odd tests were once green against a results
// page that fell through to the error boundary. This panel is also the first
// thing on that page, so if it throws, nothing below it renders either.
//
// What is pinned here is the shape of the answer, not the figures: the engine
// owns those and asserting them twice would only create somewhere for them to
// disagree. The claims are that a reader who stops after this panel still
// learns what we recommend, what it costs, what needs deciding, and how to get
// the document out.

import { runPipeline } from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExecutiveSummary } from '../src/components/results/executive-summary';
import { engineData, today } from '../src/lib/config.server';
import { formatMoney } from '../src/lib/format';
import { NEW_INVENTORY, NEW_PROFILE } from '../src/lib/scenario';

const data = engineData();

const profile: ClientProfile = {
  ...NEW_PROFILE,
  orgName: 'Northgate Retail',
  industry: 'retail',
  employeeCount: 600,
  securityStaffFte: 1,
  compliance: ['pci-dss-4.0'],
};

const inventory = {
  ...NEW_INVENTORY,
  windowsEndpoints: { count: 600 },
  windowsServers: { count: 60 },
  m365Seats: { count: 600 },
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

function render(clientProfile: ClientProfile, estate: typeof NEW_INVENTORY = inventory) {
  const result = runPipeline({
    profile: clientProfile,
    inventory: estate,
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
      <ExecutiveSummary
        result={result}
        bundle={result.recommended}
        coverage={result.coverage}
        profile={clientProfile}
        scenarioId="test-scenario"
        fx={data.fx}
        pricedAsOf={today()}
      />,
    ),
  );

  return result;
}

describe('the executive summary', () => {
  it('names the client and what we recommend, as a sentence', () => {
    const result = render(profile);
    const text = container.textContent ?? '';

    expect(result.recommended.selections.length).toBeGreaterThan(0);
    expect(text).toContain('Northgate Retail');
    expect(text).toContain('we recommend');
    expect(text).toContain('security controls');
  });

  it('gives the money four ways', () => {
    render(profile);
    const text = container.textContent ?? '';

    expect(text).toContain('Year one');
    expect(text).toContain('Each year after');
    expect(text).toContain('-year total');
    expect(text).toContain('People to run it');
  });

  /**
   * The defect this pair shipped with, found by reading the served page rather
   * than by any test.
   *
   * Year one is all-in — licence, support, infrastructure, implementation,
   * training and people. It was set against `annualSpend`, which is
   * procurement only. On the SaaS preset that rendered ₹5.29 crore falling to
   * ₹7.99 lakh: a 66-fold collapse a year later, which does not happen. The
   * people did not go away; they were in one figure and not the other.
   *
   * Two figures side by side are read as comparable whatever the labels say,
   * so this asserts the measure rather than the wording.
   */
  it('sets year one against a like-for-like figure, not against procurement alone', () => {
    const result = render(profile);
    const text = container.textContent ?? '';
    const { recommended } = result;

    // The preset has to actually have people on it, or this proves nothing.
    expect(Number(recommended.annualRecurring.amountMinor)).toBeGreaterThan(
      Number(recommended.annualSpend.amountMinor),
    );

    expect(text).toContain(formatMoney(recommended.annualRecurring));
    expect(text).toContain('The same, without the one-off setup');

    // Procurement still appears, but as the stated split rather than as the
    // headline a reader compares year one against.
    expect(text).toContain(formatMoney(recommended.annualSpend));
    expect(text).toContain('the rest is people');
  });

  it('always asks for a decision, even when nothing is wrong', () => {
    render(profile);
    expect(container.textContent ?? '').toContain('What needs deciding');
  });

  /**
   * The document this product exists to produce had no link from anywhere in
   * the application and could only be reached by typing its URL.
   */
  it('offers the way out to the proposal', () => {
    render(profile);
    const link = container.querySelector('a[href="/scenarios/test-scenario/proposal"]');

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('proposal');
  });

  /**
   * A blank intake must not read as a recommendation. The engine knows, and
   * this is the first panel on the page, so it is where the reader meets it.
   */
  it('leads with the blank estate when there is nothing to protect', () => {
    const result = render(profile, NEW_INVENTORY);
    const text = container.textContent ?? '';

    expect(result.sizing.estateCaptured).toBe(false);
    expect(text).toContain('No estate has been captured');
    expect(text).toContain('rather than the cost of protecting anything');
  });

  /**
   * The client-facing half of the page must stay client-facing. These figures
   * are the reason `?view=internal` exists.
   */
  it('carries nothing internal', () => {
    render(profile);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/margin/i);
    expect(text).not.toMatch(/costs us/i);
    expect(text).not.toMatch(/charge-out/i);
  });
});
