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
} from '@stackfit/data';

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
    excludedProducts: [],
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
        "cisco-duo/essentials | licence/yr 2,160 | ops FTE 0.05 | year1 20,317 | 3yr TCO 42,880 | USD",
        "backblaze-business-backup/business | licence/yr 4,455 | ops FTE 0.06 | year1 18,350 | 3yr TCO 46,529 | USD",
        "cisco-duo/advantage | licence/yr 4,320 | ops FTE 0.05 | year1 22,477 | 3yr TCO 49,690 | USD",
        "cisco-duo/premier | licence/yr 6,480 | ops FTE 0.05 | year1 24,637 | 3yr TCO 56,499 | USD",
        "azure-backup/protected-instance | licence/yr 840 | ops FTE 0.11 | year1 30,085 | 3yr TCO 67,383 | USD",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 1,440 | ops FTE 0.11 | year1 30,685 | 3yr TCO 69,275 | USD",
        "crowdstrike-falcon-go/go | licence/yr 2,700 | ops FTE 0.11 | year1 28,190 | 3yr TCO 71,180 | USD",
        "proofpoint-essentials/business | licence/yr 2,830 | ops FTE 0.11 | year1 32,075 | 3yr TCO 73,655 | USD",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 3,600 | ops FTE 0.11 | year1 32,845 | 3yr TCO 76,084 | USD",
        "proofpoint-essentials/advanced | licence/yr 3,866 | ops FTE 0.11 | year1 33,111 | 3yr TCO 76,924 | USD",
        "proofpoint-essentials/professional | licence/yr 5,861 | ops FTE 0.11 | year1 35,106 | 3yr TCO 83,211 | USD",
        "microsoft-entra-id/p1 | licence/yr 5,040 | ops FTE 0.15 | year1 49,635 | 3yr TCO 112,874 | USD",
        "jumpcloud/device-management | licence/yr 6,480 | ops FTE 0.16 | year1 51,582 | 3yr TCO 118,934 | USD",
        "microsoft-entra-id/p2 | licence/yr 7,200 | ops FTE 0.15 | year1 51,795 | 3yr TCO 119,683 | USD",
        "jumpcloud/sso | licence/yr 7,920 | ops FTE 0.16 | year1 53,022 | 3yr TCO 123,474 | USD",
        "jumpcloud/device-identity-management | licence/yr 9,360 | ops FTE 0.16 | year1 54,462 | 3yr TCO 128,013 | USD",
        "tenable-nessus-professional/professional | licence/yr 4,790 | ops FTE 0.23 | year1 52,434 | 3yr TCO 144,232 | USD",
        "veeam-data-platform/foundation | licence/yr 1,750 | ops FTE 0.21 | year1 67,559 | 3yr TCO 147,744 | USD",
        "veeam-data-platform/advanced | licence/yr 2,450 | ops FTE 0.21 | year1 68,259 | 3yr TCO 149,951 | USD",
        "veeam-data-platform/premium | licence/yr 3,150 | ops FTE 0.21 | year1 68,959 | 3yr TCO 152,157 | USD",
        "okta-workforce-identity/starter | licence/yr 4,320 | ops FTE 0.21 | year1 73,972 | 3yr TCO 153,575 | USD",
        "proxmox-mail-gateway/no-subscription | licence/yr 0 | ops FTE 0.26 | year1 64,214 | 3yr TCO 155,842 | USD",
        "proxmox-mail-gateway/community | licence/yr 221 | ops FTE 0.26 | year1 64,435 | 3yr TCO 156,538 | USD",
        "proxmox-mail-gateway/basic | licence/yr 628 | ops FTE 0.26 | year1 64,842 | 3yr TCO 157,821 | USD",
        "proxmox-mail-gateway/standard | licence/yr 1,465 | ops FTE 0.26 | year1 65,679 | 3yr TCO 160,459 | USD",
        "proxmox-backup-server/no-subscription | licence/yr 0 | ops FTE 0.27 | year1 65,904 | 3yr TCO 160,912 | USD",
        "proxmox-backup-server/community | licence/yr 651 | ops FTE 0.27 | year1 66,555 | 3yr TCO 162,964 | USD",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 2,160 | ops FTE 0.27 | year1 69,945 | 3yr TCO 164,164 | USD",
        "proxmox-backup-server/basic | licence/yr 1,302 | ops FTE 0.27 | year1 67,206 | 3yr TCO 165,016 | USD",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.29 | year1 64,684 | 3yr TCO 166,452 | USD",
        "proxmox-backup-server/standard | licence/yr 2,604 | ops FTE 0.27 | year1 68,508 | 3yr TCO 169,120 | USD",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 3,744 | ops FTE 0.27 | year1 71,529 | 3yr TCO 169,158 | USD",
        "okta-workforce-identity/core-essentials | licence/yr 10,080 | ops FTE 0.21 | year1 79,732 | 3yr TCO 171,733 | USD",
        "greenbone-openvas/basic | licence/yr 2,934 | ops FTE 0.29 | year1 67,618 | 3yr TCO 175,701 | USD",
        "okta-workforce-identity/essentials | licence/yr 12,240 | ops FTE 0.21 | year1 81,892 | 3yr TCO 178,543 | USD",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 72,664 | 3yr TCO 181,192 | USD",
        "rspamd/open | licence/yr 0 | ops FTE 0.35 | year1 90,314 | 3yr TCO 215,742 | USD",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 92,099 | 3yr TCO 239,497 | USD",
        "keycloak/open | licence/yr 0 | ops FTE 0.41 | year1 106,509 | 3yr TCO 250,527 | USD",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 102,144 | 3yr TCO 251,232 | USD",
        "microsoft-sentinel/pay-as-you-go | licence/yr 17,833 | ops FTE 0.32 | year1 106,413 | 3yr TCO 252,957 | USD",
        "bareos/community | licence/yr 0 | ops FTE 0.42 | year1 108,199 | 3yr TCO 255,597 | USD",
        "bareos/subscription | licence/yr 5,580 | ops FTE 0.42 | year1 113,779 | 3yr TCO 273,187 | USD",
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
        "azure-backup/protected-instance | licence/yr 79,668 | ops FTE 0.11 | year1 422,143 | 3yr TCO 876,079 | INR",
        "cisco-duo/essentials | licence/yr 204,861 | ops FTE 0.05 | year1 437,146 | 3yr TCO 1,020,680 | INR",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 136,574 | ops FTE 0.11 | year1 479,049 | 3yr TCO 1,055,475 | INR",
        "crowdstrike-falcon-go/go | licence/yr 256,034 | ops FTE 0.11 | year1 524,734 | 3yr TCO 1,371,747 | INR",
        "proofpoint-essentials/business | licence/yr 268,368 | ops FTE 0.11 | year1 610,843 | 3yr TCO 1,470,956 | INR",
        "backblaze-business-backup/business | licence/yr 422,526 | ops FTE 0.06 | year1 577,001 | 3yr TCO 1,634,439 | INR",
        "cisco-duo/advantage | licence/yr 409,722 | ops FTE 0.05 | year1 642,007 | 3yr TCO 1,666,505 | INR",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 341,435 | ops FTE 0.11 | year1 683,910 | 3yr TCO 1,701,300 | INR",
        "proofpoint-essentials/advanced | licence/yr 366,702 | ops FTE 0.11 | year1 709,177 | 3yr TCO 1,780,952 | INR",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 204,861 | ops FTE 0.27 | year1 963,786 | 3yr TCO 2,117,600 | INR",
        "proxmox-mail-gateway/no-subscription | licence/yr 0 | ops FTE 0.26 | year1 922,850 | 3yr TCO 2,124,549 | INR",
        "proxmox-backup-server/no-subscription | licence/yr 0 | ops FTE 0.27 | year1 936,300 | 3yr TCO 2,164,899 | INR",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.29 | year1 882,700 | 3yr TCO 2,165,099 | INR",
        "proxmox-mail-gateway/community | licence/yr 20,947 | ops FTE 0.26 | year1 943,797 | 3yr TCO 2,190,585 | INR",
        "proxmox-mail-gateway/basic | licence/yr 59,533 | ops FTE 0.26 | year1 982,383 | 3yr TCO 2,312,228 | INR",
        "cisco-duo/premier | licence/yr 614,584 | ops FTE 0.05 | year1 846,869 | 3yr TCO 2,312,330 | INR",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 990,100 | 3yr TCO 2,326,299 | INR",
        "proxmox-backup-server/community | licence/yr 61,738 | ops FTE 0.27 | year1 998,038 | 3yr TCO 2,359,529 | INR",
        "proofpoint-essentials/professional | licence/yr 555,857 | ops FTE 0.11 | year1 898,332 | 3yr TCO 2,377,264 | INR",
        "microsoft-entra-id/p1 | licence/yr 478,010 | ops FTE 0.15 | year1 1,008,485 | 3yr TCO 2,454,350 | INR",
        "proxmox-backup-server/basic | licence/yr 123,477 | ops FTE 0.27 | year1 1,059,776 | 3yr TCO 2,554,159 | INR",
        "proxmox-mail-gateway/standard | licence/yr 138,911 | ops FTE 0.26 | year1 1,061,761 | 3yr TCO 2,562,467 | INR",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 355,093 | ops FTE 0.27 | year1 1,114,018 | 3yr TCO 2,591,205 | INR",
        "veeam-data-platform/foundation | licence/yr 165,976 | ops FTE 0.21 | year1 1,189,300 | 3yr TCO 2,627,212 | INR",
        "rspamd/open | licence/yr 0 | ops FTE 0.35 | year1 1,218,350 | 3yr TCO 2,689,049 | INR",
        "okta-workforce-identity/starter | licence/yr 409,722 | ops FTE 0.21 | year1 1,293,232 | 3yr TCO 2,734,680 | INR",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 1,144,775 | 3yr TCO 2,790,324 | INR",
        "veeam-data-platform/advanced | licence/yr 232,366 | ops FTE 0.21 | year1 1,255,691 | 3yr TCO 2,836,507 | INR",
        "jumpcloud/device-management | licence/yr 614,584 | ops FTE 0.16 | year1 1,149,094 | 3yr TCO 2,897,005 | INR",
        "proxmox-backup-server/standard | licence/yr 246,953 | ops FTE 0.27 | year1 1,183,253 | 3yr TCO 2,943,419 | INR",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 1,312,500 | 3yr TCO 2,971,499 | INR",
        "keycloak/open | licence/yr 0 | ops FTE 0.41 | year1 1,413,075 | 3yr TCO 3,031,724 | INR",
        "greenbone-openvas/basic | licence/yr 278,263 | ops FTE 0.29 | year1 1,160,963 | 3yr TCO 3,042,325 | INR",
        "veeam-data-platform/premium | licence/yr 298,756 | ops FTE 0.21 | year1 1,322,081 | 3yr TCO 3,045,803 | INR",
        "bareos/community | licence/yr 0 | ops FTE 0.42 | year1 1,426,525 | 3yr TCO 3,072,074 | INR",
        "microsoft-entra-id/p2 | licence/yr 682,871 | ops FTE 0.15 | year1 1,213,346 | 3yr TCO 3,100,175 | INR",
        "tenable-nessus-professional/professional | licence/yr 454,299 | ops FTE 0.23 | year1 1,135,549 | 3yr TCO 3,234,426 | INR",
        "jumpcloud/sso | licence/yr 751,158 | ops FTE 0.16 | year1 1,285,668 | 3yr TCO 3,327,555 | INR",
        "wazuh/open | licence/yr 0 | ops FTE 0.53 | year1 1,775,725 | 3yr TCO 3,717,174 | INR",
        "jumpcloud/device-identity-management | licence/yr 887,732 | ops FTE 0.16 | year1 1,422,242 | 3yr TCO 3,758,105 | INR",
        "okta-workforce-identity/core-essentials | licence/yr 956,019 | ops FTE 0.21 | year1 1,839,529 | 3yr TCO 4,456,880 | INR",
        "bareos/subscription | licence/yr 529,186 | ops FTE 0.42 | year1 1,955,710 | 3yr TCO 4,740,332 | INR",
        "okta-workforce-identity/essentials | licence/yr 1,160,880 | ops FTE 0.21 | year1 2,044,390 | 3yr TCO 5,102,705 | INR",
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
