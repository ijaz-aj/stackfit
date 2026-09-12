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
        "cisco-duo/free | licence/yr 0 | ops FTE 0.05 | year1 18,157 | 3yr TCO 36,071 | USD",
        "cisco-duo/essentials | licence/yr 2,160 | ops FTE 0.05 | year1 20,317 | 3yr TCO 42,880 | USD",
        "backblaze-business-backup/business | licence/yr 4,455 | ops FTE 0.06 | year1 18,350 | 3yr TCO 46,529 | USD",
        "cisco-duo/advantage | licence/yr 4,320 | ops FTE 0.05 | year1 22,477 | 3yr TCO 49,690 | USD",
        "cisco-duo/premier | licence/yr 6,480 | ops FTE 0.05 | year1 24,637 | 3yr TCO 56,499 | USD",
        "azure-backup/protected-instance | licence/yr 840 | ops FTE 0.11 | year1 30,085 | 3yr TCO 67,383 | USD",
        "runzero/community | licence/yr 0 | ops FTE 0.11 | year1 27,364 | 3yr TCO 68,292 | USD",
        "huntress/managed-itdr | licence/yr 2,592 | ops FTE 0.11 | year1 27,237 | 3yr TCO 68,306 | USD",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 1,440 | ops FTE 0.11 | year1 30,685 | 3yr TCO 69,275 | USD",
        "crowdstrike-falcon-go/go | licence/yr 2,700 | ops FTE 0.11 | year1 28,190 | 3yr TCO 71,180 | USD",
        "proofpoint-essentials/business | licence/yr 2,830 | ops FTE 0.11 | year1 32,075 | 3yr TCO 73,655 | USD",
        "huntress/managed-edr | licence/yr 4,315 | ops FTE 0.11 | year1 28,960 | 3yr TCO 73,737 | USD",
        "azure-firewall/basic | licence/yr 3,460 | ops FTE 0.11 | year1 32,705 | 3yr TCO 75,643 | USD",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 3,600 | ops FTE 0.11 | year1 32,845 | 3yr TCO 76,084 | USD",
        "proofpoint-essentials/advanced | licence/yr 3,866 | ops FTE 0.11 | year1 33,111 | 3yr TCO 76,924 | USD",
        "snipe-it/self-hosted | licence/yr 0 | ops FTE 0.11 | year1 35,109 | 3yr TCO 77,727 | USD",
        "snipe-it/hosted-basic | licence/yr 400 | ops FTE 0.11 | year1 35,509 | 3yr TCO 78,988 | USD",
        "proofpoint-essentials/professional | licence/yr 5,861 | ops FTE 0.11 | year1 35,106 | 3yr TCO 83,211 | USD",
        "sophos-mdr/essentials | licence/yr 8,100 | ops FTE 0.10 | year1 37,007 | 3yr TCO 89,256 | USD",
        "tines/free | licence/yr 0 | ops FTE 0.15 | year1 37,695 | 3yr TCO 90,085 | USD",
        "nmap/open | licence/yr 0 | ops FTE 0.16 | year1 36,659 | 3yr TCO 96,177 | USD",
        "microsoft-entra-id/free | licence/yr 0 | ops FTE 0.15 | year1 44,595 | 3yr TCO 96,985 | USD",
        "azure-firewall/standard | licence/yr 10,950 | ops FTE 0.11 | year1 40,195 | 3yr TCO 99,255 | USD",
        "passbolt/community | licence/yr 0 | ops FTE 0.15 | year1 42,714 | 3yr TCO 100,542 | USD",
        "passbolt/pro | licence/yr 588 | ops FTE 0.15 | year1 43,302 | 3yr TCO 102,396 | USD",
        "aws-network-firewall/standard | licence/yr 3,460 | ops FTE 0.15 | year1 43,455 | 3yr TCO 103,293 | USD",
        "sophos-mdr/complete | licence/yr 13,500 | ops FTE 0.10 | year1 42,407 | 3yr TCO 106,280 | USD",
        "fortinet-fortigate/utp | licence/yr 536 | ops FTE 0.16 | year1 48,357 | 3yr TCO 108,353 | USD",
        "microsoft-entra-id/p1 | licence/yr 5,040 | ops FTE 0.15 | year1 49,635 | 3yr TCO 112,874 | USD",
        "azure-firewall/premium | licence/yr 15,330 | ops FTE 0.11 | year1 44,575 | 3yr TCO 113,063 | USD",
        "devolutions-pam/remote-access-management | licence/yr 1,200 | ops FTE 0.16 | year1 53,621 | 3yr TCO 115,046 | USD",
        "devolutions-pam/rdm-it-operations | licence/yr 1,800 | ops FTE 0.16 | year1 54,221 | 3yr TCO 116,937 | USD",
        "blumira/detect | licence/yr 8,640 | ops FTE 0.15 | year1 46,335 | 3yr TCO 117,323 | USD",
        "jumpcloud/device-management | licence/yr 6,480 | ops FTE 0.16 | year1 51,582 | 3yr TCO 118,934 | USD",
        "sentinelone-singularity/complete | licence/yr 8,100 | ops FTE 0.16 | year1 46,978 | 3yr TCO 119,168 | USD",
        "microsoft-entra-id/p2 | licence/yr 7,200 | ops FTE 0.15 | year1 51,795 | 3yr TCO 119,683 | USD",
        "devolutions-pam/pam | licence/yr 3,000 | ops FTE 0.16 | year1 55,421 | 3yr TCO 120,720 | USD",
        "crowdstrike-falcon-complete/complete | licence/yr 18,900 | ops FTE 0.10 | year1 47,638 | 3yr TCO 122,796 | USD",
        "jumpcloud/sso | licence/yr 7,920 | ops FTE 0.16 | year1 53,022 | 3yr TCO 123,474 | USD",
        "n8n/community-self-hosted | licence/yr 0 | ops FTE 0.21 | year1 51,164 | 3yr TCO 125,892 | USD",
        "ntopng/community | licence/yr 0 | ops FTE 0.21 | year1 49,709 | 3yr TCO 126,127 | USD",
        "sentinelone-singularity/commercial | licence/yr 10,350 | ops FTE 0.16 | year1 49,228 | 3yr TCO 126,261 | USD",
        "blumira/respond | licence/yr 11,520 | ops FTE 0.15 | year1 49,215 | 3yr TCO 126,402 | USD",
        "n8n/cloud-starter | licence/yr 279 | ops FTE 0.21 | year1 51,443 | 3yr TCO 126,771 | USD",
        "jumpcloud/device-identity-management | licence/yr 9,360 | ops FTE 0.16 | year1 54,462 | 3yr TCO 128,013 | USD",
        "n8n/cloud-pro | licence/yr 697 | ops FTE 0.21 | year1 51,861 | 3yr TCO 128,091 | USD",
        "thehive/community | licence/yr 0 | ops FTE 0.21 | year1 55,764 | 3yr TCO 130,492 | USD",
        "apache-guacamole/open | licence/yr 0 | ops FTE 0.21 | year1 56,609 | 3yr TCO 133,027 | USD",
        "opnsense/community | licence/yr 0 | ops FTE 0.21 | year1 61,209 | 3yr TCO 137,627 | USD",
        "pfsense/ce | licence/yr 0 | ops FTE 0.21 | year1 61,209 | 3yr TCO 137,627 | USD",
        "blumira/automate | licence/yr 15,120 | ops FTE 0.15 | year1 52,815 | 3yr TCO 137,751 | USD",
        "pfsense/plus-software | licence/yr 129 | ops FTE 0.21 | year1 61,338 | 3yr TCO 138,034 | USD",
        "opnsense/business | licence/yr 173 | ops FTE 0.21 | year1 61,382 | 3yr TCO 138,173 | USD",
        "arctic-wolf/mdr | licence/yr 14,400 | ops FTE 0.15 | year1 58,657 | 3yr TCO 141,367 | USD",
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
        "glpi/community | licence/yr 0 | ops FTE 0.26 | year1 74,597 | 3yr TCO 168,591 | USD",
        "proxmox-backup-server/standard | licence/yr 2,604 | ops FTE 0.27 | year1 68,508 | 3yr TCO 169,120 | USD",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 3,744 | ops FTE 0.27 | year1 71,529 | 3yr TCO 169,158 | USD",
        "okta-workforce-identity/core-essentials | licence/yr 10,080 | ops FTE 0.21 | year1 79,732 | 3yr TCO 171,733 | USD",
        "netbox/community | licence/yr 0 | ops FTE 0.26 | year1 81,159 | 3yr TCO 174,477 | USD",
        "greenbone-openvas/basic | licence/yr 2,934 | ops FTE 0.29 | year1 67,618 | 3yr TCO 175,701 | USD",
        "okta-workforce-identity/essentials | licence/yr 12,240 | ops FTE 0.21 | year1 81,892 | 3yr TCO 178,543 | USD",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 72,664 | 3yr TCO 181,192 | USD",
        "shuffle/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 77,264 | 3yr TCO 185,792 | USD",
        "rspamd/open | licence/yr 0 | ops FTE 0.35 | year1 90,314 | 3yr TCO 215,742 | USD",
        "suricata/open | licence/yr 0 | ops FTE 0.37 | year1 88,249 | 3yr TCO 218,747 | USD",
        "teleport-community/community | licence/yr 0 | ops FTE 0.36 | year1 98,904 | 3yr TCO 227,712 | USD",
        "manageengine-pam360/subscription | licence/yr 7,995 | ops FTE 0.31 | year1 109,104 | 3yr TCO 236,531 | USD",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 92,099 | 3yr TCO 239,497 | USD",
        "stackstorm/open | licence/yr 0 | ops FTE 0.41 | year1 105,664 | 3yr TCO 247,992 | USD",
        "arkime/open | licence/yr 0 | ops FTE 0.42 | year1 101,299 | 3yr TCO 248,697 | USD",
        "keycloak/open | licence/yr 0 | ops FTE 0.41 | year1 106,509 | 3yr TCO 250,527 | USD",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 102,144 | 3yr TCO 251,232 | USD",
        "microsoft-sentinel/pay-as-you-go | licence/yr 17,833 | ops FTE 0.32 | year1 106,413 | 3yr TCO 252,957 | USD",
        "bareos/community | licence/yr 0 | ops FTE 0.42 | year1 108,199 | 3yr TCO 255,597 | USD",
        "bareos/subscription | licence/yr 5,580 | ops FTE 0.42 | year1 113,779 | 3yr TCO 273,187 | USD",
        "zeek/open | licence/yr 0 | ops FTE 0.53 | year1 125,944 | 3yr TCO 308,832 | USD",
        "security-onion/free | licence/yr 0 | ops FTE 0.53 | year1 126,789 | 3yr TCO 311,367 | USD",
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
        "cisco-duo/free | licence/yr 0 | ops FTE 0.05 | year1 232,285 | 3yr TCO 374,855 | INR",
        "tines/free | licence/yr 0 | ops FTE 0.15 | year1 409,725 | 3yr TCO 826,675 | INR",
        "azure-backup/protected-instance | licence/yr 79,668 | ops FTE 0.11 | year1 422,143 | 3yr TCO 876,079 | INR",
        "microsoft-entra-id/free | licence/yr 0 | ops FTE 0.15 | year1 530,475 | 3yr TCO 947,425 | INR",
        "cisco-duo/essentials | licence/yr 204,861 | ops FTE 0.05 | year1 437,146 | 3yr TCO 1,020,680 | INR",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 136,574 | ops FTE 0.11 | year1 479,049 | 3yr TCO 1,055,475 | INR",
        "runzero/community | licence/yr 0 | ops FTE 0.11 | year1 519,850 | 3yr TCO 1,318,049 | INR",
        "huntress/managed-itdr | licence/yr 245,833 | ops FTE 0.11 | year1 507,808 | 3yr TCO 1,319,415 | INR",
        "crowdstrike-falcon-go/go | licence/yr 256,034 | ops FTE 0.11 | year1 524,734 | 3yr TCO 1,371,747 | INR",
        "snipe-it/self-hosted | licence/yr 0 | ops FTE 0.11 | year1 647,325 | 3yr TCO 1,458,974 | INR",
        "proofpoint-essentials/business | licence/yr 268,368 | ops FTE 0.11 | year1 610,843 | 3yr TCO 1,470,956 | INR",
        "nmap/open | licence/yr 0 | ops FTE 0.16 | year1 593,825 | 3yr TCO 1,539,974 | INR",
        "snipe-it/hosted-basic | licence/yr 37,936 | ops FTE 0.11 | year1 685,261 | 3yr TCO 1,578,569 | INR",
        "backblaze-business-backup/business | licence/yr 422,526 | ops FTE 0.06 | year1 577,001 | 3yr TCO 1,634,439 | INR",
        "passbolt/community | licence/yr 0 | ops FTE 0.15 | year1 707,850 | 3yr TCO 1,640,549 | INR",
        "azure-firewall/basic | licence/yr 328,176 | ops FTE 0.11 | year1 670,651 | 3yr TCO 1,659,501 | INR",
        "cisco-duo/advantage | licence/yr 409,722 | ops FTE 0.05 | year1 642,007 | 3yr TCO 1,666,505 | INR",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 341,435 | ops FTE 0.11 | year1 683,910 | 3yr TCO 1,701,300 | INR",
        "proofpoint-essentials/advanced | licence/yr 366,702 | ops FTE 0.11 | year1 709,177 | 3yr TCO 1,780,952 | INR",
        "passbolt/pro | licence/yr 55,768 | ops FTE 0.15 | year1 763,618 | 3yr TCO 1,816,357 | INR",
        "ntopng/community | licence/yr 0 | ops FTE 0.21 | year1 741,575 | 3yr TCO 1,822,224 | INR",
        "huntress/managed-edr | licence/yr 409,210 | ops FTE 0.11 | year1 671,185 | 3yr TCO 1,834,461 | INR",
        "n8n/community-self-hosted | licence/yr 0 | ops FTE 0.21 | year1 775,100 | 3yr TCO 1,842,299 | INR",
        "fortinet-fortigate/utp | licence/yr 50,836 | ops FTE 0.16 | year1 843,221 | 3yr TCO 1,893,415 | INR",
        "aws-network-firewall/standard | licence/yr 328,176 | ops FTE 0.15 | year1 778,151 | 3yr TCO 1,901,501 | INR",
        "thehive/community | licence/yr 0 | ops FTE 0.21 | year1 855,600 | 3yr TCO 1,922,799 | INR",
        "n8n/cloud-starter | licence/yr 26,459 | ops FTE 0.21 | year1 801,559 | 3yr TCO 1,925,712 | INR",
        "apache-guacamole/open | licence/yr 0 | ops FTE 0.21 | year1 862,325 | 3yr TCO 1,942,974 | INR",
        "opnsense/community | licence/yr 0 | ops FTE 0.21 | year1 942,825 | 3yr TCO 2,023,474 | INR",
        "pfsense/ce | licence/yr 0 | ops FTE 0.21 | year1 942,825 | 3yr TCO 2,023,474 | INR",
        "n8n/cloud-pro | licence/yr 66,148 | ops FTE 0.21 | year1 841,248 | 3yr TCO 2,050,832 | INR",
        "pfsense/plus-software | licence/yr 12,235 | ops FTE 0.21 | year1 955,060 | 3yr TCO 2,062,044 | INR",
        "opnsense/business | licence/yr 16,427 | ops FTE 0.21 | year1 959,252 | 3yr TCO 2,075,260 | INR",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 204,861 | ops FTE 0.27 | year1 963,786 | 3yr TCO 2,117,600 | INR",
        "proxmox-mail-gateway/no-subscription | licence/yr 0 | ops FTE 0.26 | year1 922,850 | 3yr TCO 2,124,549 | INR",
        "proxmox-backup-server/no-subscription | licence/yr 0 | ops FTE 0.27 | year1 936,300 | 3yr TCO 2,164,899 | INR",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.29 | year1 882,700 | 3yr TCO 2,165,099 | INR",
        "devolutions-pam/remote-access-management | licence/yr 113,812 | ops FTE 0.16 | year1 986,697 | 3yr TCO 2,172,446 | INR",
        "proxmox-mail-gateway/community | licence/yr 20,947 | ops FTE 0.26 | year1 943,797 | 3yr TCO 2,190,585 | INR",
        "proxmox-mail-gateway/basic | licence/yr 59,533 | ops FTE 0.26 | year1 982,383 | 3yr TCO 2,312,228 | INR",
        "cisco-duo/premier | licence/yr 614,584 | ops FTE 0.05 | year1 846,869 | 3yr TCO 2,312,330 | INR",
        "glpi/community | licence/yr 0 | ops FTE 0.26 | year1 1,093,265 | 3yr TCO 2,313,794 | INR",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 990,100 | 3yr TCO 2,326,299 | INR",
        "devolutions-pam/rdm-it-operations | licence/yr 170,718 | ops FTE 0.16 | year1 1,043,602 | 3yr TCO 2,351,842 | INR",
        "proxmox-backup-server/community | licence/yr 61,738 | ops FTE 0.27 | year1 998,038 | 3yr TCO 2,359,529 | INR",
        "proofpoint-essentials/professional | licence/yr 555,857 | ops FTE 0.11 | year1 898,332 | 3yr TCO 2,377,264 | INR",
        "shuffle/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 1,070,600 | 3yr TCO 2,406,799 | INR",
        "netbox/community | licence/yr 0 | ops FTE 0.26 | year1 1,211,325 | 3yr TCO 2,426,474 | INR",
        "microsoft-entra-id/p1 | licence/yr 478,010 | ops FTE 0.15 | year1 1,008,485 | 3yr TCO 2,454,350 | INR",
        "proxmox-backup-server/basic | licence/yr 123,477 | ops FTE 0.27 | year1 1,059,776 | 3yr TCO 2,554,159 | INR",
        "proxmox-mail-gateway/standard | licence/yr 138,911 | ops FTE 0.26 | year1 1,061,761 | 3yr TCO 2,562,467 | INR",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 355,093 | ops FTE 0.27 | year1 1,114,018 | 3yr TCO 2,591,205 | INR",
        "veeam-data-platform/foundation | licence/yr 165,976 | ops FTE 0.21 | year1 1,189,300 | 3yr TCO 2,627,212 | INR",
        "suricata/open | licence/yr 0 | ops FTE 0.37 | year1 1,158,025 | 3yr TCO 2,669,074 | INR",
        "rspamd/open | licence/yr 0 | ops FTE 0.35 | year1 1,218,350 | 3yr TCO 2,689,049 | INR",
        "devolutions-pam/pam | licence/yr 284,530 | ops FTE 0.16 | year1 1,157,414 | 3yr TCO 2,710,634 | INR",
        "okta-workforce-identity/starter | licence/yr 409,722 | ops FTE 0.21 | year1 1,293,232 | 3yr TCO 2,734,680 | INR",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 1,144,775 | 3yr TCO 2,790,324 | INR",
        "veeam-data-platform/advanced | licence/yr 232,366 | ops FTE 0.21 | year1 1,255,691 | 3yr TCO 2,836,507 | INR",
        "teleport-community/community | licence/yr 0 | ops FTE 0.36 | year1 1,352,550 | 3yr TCO 2,850,149 | INR",
        "jumpcloud/device-management | licence/yr 614,584 | ops FTE 0.16 | year1 1,149,094 | 3yr TCO 2,897,005 | INR",
        "proxmox-backup-server/standard | licence/yr 246,953 | ops FTE 0.27 | year1 1,183,253 | 3yr TCO 2,943,419 | INR",
        "arkime/open | licence/yr 0 | ops FTE 0.42 | year1 1,305,775 | 3yr TCO 2,951,324 | INR",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 1,312,500 | 3yr TCO 2,971,499 | INR",
        "stackstorm/open | licence/yr 0 | ops FTE 0.41 | year1 1,406,350 | 3yr TCO 3,011,549 | INR",
        "keycloak/open | licence/yr 0 | ops FTE 0.41 | year1 1,413,075 | 3yr TCO 3,031,724 | INR",
        "sophos-mdr/essentials | licence/yr 768,230 | ops FTE 0.10 | year1 1,108,015 | 3yr TCO 3,038,699 | INR",
        "greenbone-openvas/basic | licence/yr 278,263 | ops FTE 0.29 | year1 1,160,963 | 3yr TCO 3,042,325 | INR",
        "veeam-data-platform/premium | licence/yr 298,756 | ops FTE 0.21 | year1 1,322,081 | 3yr TCO 3,045,803 | INR",
        "bareos/community | licence/yr 0 | ops FTE 0.42 | year1 1,426,525 | 3yr TCO 3,072,074 | INR",
        "microsoft-entra-id/p2 | licence/yr 682,871 | ops FTE 0.15 | year1 1,213,346 | 3yr TCO 3,100,175 | INR",
        "tenable-nessus-professional/professional | licence/yr 454,299 | ops FTE 0.23 | year1 1,135,549 | 3yr TCO 3,234,426 | INR",
        "sentinelone-singularity/complete | licence/yr 768,187 | ops FTE 0.16 | year1 1,187,327 | 3yr TCO 3,276,629 | INR",
        "jumpcloud/sso | licence/yr 751,158 | ops FTE 0.16 | year1 1,285,668 | 3yr TCO 3,327,555 | INR",
        "blumira/detect | licence/yr 819,445 | ops FTE 0.15 | year1 1,229,170 | 3yr TCO 3,409,975 | INR",
        "zeek/open | licence/yr 0 | ops FTE 0.53 | year1 1,567,750 | 3yr TCO 3,495,749 | INR",
        "security-onion/free | licence/yr 0 | ops FTE 0.53 | year1 1,574,475 | 3yr TCO 3,515,924 | INR",
        "wazuh/open | licence/yr 0 | ops FTE 0.53 | year1 1,775,725 | 3yr TCO 3,717,174 | INR",
        "jumpcloud/device-identity-management | licence/yr 887,732 | ops FTE 0.16 | year1 1,422,242 | 3yr TCO 3,758,105 | INR",
        "azure-firewall/standard | licence/yr 1,038,533 | ops FTE 0.11 | year1 1,381,008 | 3yr TCO 3,898,899 | INR",
        "sentinelone-singularity/commercial | licence/yr 981,584 | ops FTE 0.16 | year1 1,400,724 | 3yr TCO 3,949,364 | INR",
        "blumira/respond | licence/yr 1,092,593 | ops FTE 0.15 | year1 1,502,318 | 3yr TCO 4,271,075 | INR",
        "okta-workforce-identity/core-essentials | licence/yr 956,019 | ops FTE 0.21 | year1 1,839,529 | 3yr TCO 4,456,880 | INR",
        "sophos-mdr/complete | licence/yr 1,280,383 | ops FTE 0.10 | year1 1,620,168 | 3yr TCO 4,653,262 | INR",
        "bareos/subscription | licence/yr 529,186 | ops FTE 0.42 | year1 1,955,710 | 3yr TCO 4,740,332 | INR",
        "okta-workforce-identity/essentials | licence/yr 1,160,880 | ops FTE 0.21 | year1 2,044,390 | 3yr TCO 5,102,705 | INR",
        "azure-firewall/premium | licence/yr 1,453,946 | ops FTE 0.11 | year1 1,796,421 | 3yr TCO 5,208,489 | INR",
        "manageengine-pam360/subscription | licence/yr 758,271 | ops FTE 0.31 | year1 2,238,096 | 3yr TCO 5,219,924 | INR",
        "arctic-wolf/mdr | licence/yr 1,365,742 | ops FTE 0.15 | year1 1,893,527 | 3yr TCO 5,244,855 | INR",
        "blumira/automate | licence/yr 1,434,029 | ops FTE 0.15 | year1 1,843,754 | 3yr TCO 5,347,451 | INR",
        "crowdstrike-falcon-complete/complete | licence/yr 1,792,536 | ops FTE 0.10 | year1 2,130,976 | 3yr TCO 6,263,789 | INR",
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
