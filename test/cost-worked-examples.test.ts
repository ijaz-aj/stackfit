// Phase 3 definition of done: every pricing model covered, and an
// open-source-vs-commercial TCO comparison proving FTE cost is included.
//
// These run the *committed* catalog and the *committed* rate cards, so the
// snapshots below are real indicative budgets for real products. They are a
// review surface first and a regression test second: if a rate card or a
// catalog price moves, the numbers here move with it, in the diff.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeProductCosts, computeSizing, type ProductCost } from '@stackfit/engine';
import type { AssetInventory, ClientProfile, CurrencyCode } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import {
  loadCatalog,
  loadCostAssumptions,
  loadFreshnessPolicy,
  loadFxConfig,
  loadLabourRates,
  loadSizingAssumptions,
} from '../scripts/lib/load-config.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const sizingAssumptions = loadSizingAssumptions(DATA_DIR);
const catalog = loadCatalog(DATA_DIR);
// Pinned rather than read from the clock, so these snapshots stay stable as
// the committed prices age. The staleness of the real catalog is asserted
// separately, in test/staleness.test.ts.
const AS_AT = '2026-09-15';

const costInputs = {
  labourRates: loadLabourRates(DATA_DIR),
  costAssumptions: loadCostAssumptions(DATA_DIR),
  fx: loadFxConfig(DATA_DIR),
  freshnessPolicy: loadFreshnessPolicy(DATA_DIR),
  today: AS_AT,
};

/** Renders minor units as a readable major-unit figure for the snapshots. */
function major(amountMinor: number): string {
  return (amountMinor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function summarise(cost: ProductCost): string {
  return [
    `${cost.productId}/${cost.tierId}`,
    `licence/yr ${major(cost.licenceAnnual.amountMinor)}`,
    `ops FTE ${cost.opsFte.toFixed(2)}`,
    `year1 ${major(cost.year1.amountMinor)}`,
    `3yr TCO ${major(cost.tco.amountMinor)}`,
    cost.currency,
  ].join(' | ');
}

/** The §12.1 small-retail environment. */
const retailInventory: AssetInventory = {
  windowsEndpoints: { count: 45 },
  iotCctvPosDevices: { count: 40, criticality: 'crown_jewel' },
  windowsServers: { count: 5 },
  windowsDomainControllers: { count: 1 },
  linuxServers: { count: 1 },
  firewalls: { count: 2, internetFacing: true },
  switches: { count: 6 },
  networkVendors: ['cisco'],
};

function retailProfile(currency: CurrencyCode, region: ClientProfile['region']): ClientProfile {
  return {
    orgName: 'Retail Co',
    industry: 'retail',
    region,
    employeeCount: 60,
    itStaffCount: 2,
    securityStaffFte: 0,
    hasSoc: 'none',
    riskTolerance: 'medium',
    dataSensitivity: 'regulated',
    compliance: ['pci-dss-4.0'],
    budget: { annualCap: null, oneTimeCap: null, currency, horizonYears: 3 },
    deploymentPreference: 'hybrid',
    procurementBias: 'no_preference',
    retainedTools: [],
  };
}

function costEveryProduct(profile: ClientProfile): ProductCost[] {
  const sizing = computeSizing(retailInventory, profile, sizingAssumptions);
  return [...catalog.values()]
    .flatMap((product) => computeProductCosts(product, sizing, profile, costInputs))
    .sort((a, b) => a.tco.amountMinor - b.tco.amountMinor);
}

describe('Costing the real catalog for a 60-staff PCI DSS retailer (US, USD)', () => {
  const costs = costEveryProduct(retailProfile('USD', 'us'));

  it('produces an indicative 3-year TCO for every catalogued tier', () => {
    expect(costs.map(summarise)).toMatchInlineSnapshot(`
      [
        "crowdstrike-falcon-go/go | licence/yr 2,700 | ops FTE 0.11 | year1 28,190 | 3yr TCO 71,180 | USD",
        "tenable-nessus-professional/professional | licence/yr 4,790 | ops FTE 0.23 | year1 52,434 | 3yr TCO 144,232 | USD",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 2,160 | ops FTE 0.27 | year1 69,945 | 3yr TCO 164,164 | USD",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.29 | year1 64,684 | 3yr TCO 166,452 | USD",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 3,744 | ops FTE 0.27 | year1 71,529 | 3yr TCO 169,158 | USD",
        "greenbone-openvas/basic | licence/yr 2,934 | ops FTE 0.29 | year1 67,618 | 3yr TCO 175,701 | USD",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 92,099 | 3yr TCO 239,497 | USD",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 102,144 | 3yr TCO 251,232 | USD",
        "microsoft-sentinel/pay-as-you-go | licence/yr 17,833 | ops FTE 0.32 | year1 106,413 | 3yr TCO 252,957 | USD",
        "wazuh/open | licence/yr 0 | ops FTE 0.53 | year1 138,289 | 3yr TCO 322,867 | USD",
      ]
    `);
  });

  it('never returns a zero TCO, not even for the open-source products', () => {
    // Hard rule 8. Wazuh, Graylog, Velociraptor and OpenVAS all have a zero
    // licence line and none of them is free.
    for (const cost of costs) {
      expect(cost.tco.amountMinor).toBeGreaterThan(0);
    }
  });

  it('shows the zero-licence products costing real money in people and infrastructure', () => {
    const wazuh = costs.find((cost) => cost.productId === 'wazuh');
    expect(wazuh?.licenceAnnual.amountMinor).toBe(0);
    expect(wazuh?.opsFteAnnual.amountMinor).toBeGreaterThan(0);
    expect(wazuh?.infraAnnual.amountMinor).toBeGreaterThan(0);
  });

  it('carries no placeholder pricing through to a cost', () => {
    expect(costs.filter((cost) => cost.hasPlaceholderPricing)).toEqual([]);
  });
});

describe('The same retailer priced in India (INR)', () => {
  const costs = costEveryProduct(retailProfile('INR', 'in'));

  it('produces the same shortlist at Indian labour rates', () => {
    expect(costs.map(summarise)).toMatchInlineSnapshot(`
      [
        "crowdstrike-falcon-go/go | licence/yr 256,034 | ops FTE 0.11 | year1 524,734 | 3yr TCO 1,371,747 | INR",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 204,861 | ops FTE 0.27 | year1 963,786 | 3yr TCO 2,117,600 | INR",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.29 | year1 882,700 | 3yr TCO 2,165,099 | INR",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 355,093 | ops FTE 0.27 | year1 1,114,018 | 3yr TCO 2,591,205 | INR",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 1,144,775 | 3yr TCO 2,790,324 | INR",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 1,312,500 | 3yr TCO 2,971,499 | INR",
        "greenbone-openvas/basic | licence/yr 278,263 | ops FTE 0.29 | year1 1,160,963 | 3yr TCO 3,042,325 | INR",
        "tenable-nessus-professional/professional | licence/yr 454,299 | ops FTE 0.23 | year1 1,135,549 | 3yr TCO 3,234,426 | INR",
        "wazuh/open | licence/yr 0 | ops FTE 0.53 | year1 1,775,725 | 3yr TCO 3,717,174 | INR",
        "microsoft-sentinel/pay-as-you-go | licence/yr 1,691,306 | ops FTE 0.32 | year1 2,725,456 | 3yr TCO 7,226,792 | INR",
      ]
    `);
  });

  it('reorders the shortlist, because cheaper people change the answer', () => {
    // The whole point of regional labour rates: a self-hosted stack that loses
    // on TCO in the US can win in India, and the tool has to reflect that
    // rather than presenting one global ranking.
    const usOrder = costEveryProduct(retailProfile('USD', 'us')).map((cost) => cost.productId);
    const inOrder = costs.map((cost) => cost.productId);
    expect(inOrder).not.toEqual(usOrder);
  });
});
