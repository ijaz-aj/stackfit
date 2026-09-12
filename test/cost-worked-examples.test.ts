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
    environment: 'not_asked',
    deploymentConstraint: 'none',
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
        "canarytokens/free | licence/yr 0 | ops FTE 0.05 | year1 13,928 | 3yr TCO 32,584 | USD",
        "cisco-duo/free | licence/yr 0 | ops FTE 0.05 | year1 18,157 | 3yr TCO 36,071 | USD",
        "cisco-duo/essentials | licence/yr 2,160 | ops FTE 0.05 | year1 20,317 | 3yr TCO 42,880 | USD",
        "backblaze-business-backup/business | licence/yr 4,455 | ops FTE 0.06 | year1 18,350 | 3yr TCO 46,529 | USD",
        "cisco-duo/advantage | licence/yr 4,320 | ops FTE 0.05 | year1 22,477 | 3yr TCO 49,690 | USD",
        "cisco-duo/premier | licence/yr 6,480 | ops FTE 0.05 | year1 24,637 | 3yr TCO 56,499 | USD",
        "runzero/community | licence/yr 0 | ops FTE 0.11 | year1 25,185 | 3yr TCO 61,755 | USD",
        "trivy/open | licence/yr 0 | ops FTE 0.11 | year1 25,725 | 3yr TCO 63,375 | USD",
        "thinkst-canary/subscription | licence/yr 10,000 | ops FTE 0.05 | year1 23,928 | 3yr TCO 64,109 | USD",
        "azure-backup/protected-instance | licence/yr 840 | ops FTE 0.11 | year1 30,085 | 3yr TCO 67,383 | USD",
        "huntress/managed-itdr | licence/yr 2,592 | ops FTE 0.11 | year1 27,237 | 3yr TCO 68,306 | USD",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 1,440 | ops FTE 0.11 | year1 30,685 | 3yr TCO 69,275 | USD",
        "crowdstrike-falcon-go/go | licence/yr 2,700 | ops FTE 0.11 | year1 28,190 | 3yr TCO 71,180 | USD",
        "snipe-it/self-hosted | licence/yr 0 | ops FTE 0.11 | year1 32,930 | 3yr TCO 71,190 | USD",
        "snipe-it/hosted-basic | licence/yr 400 | ops FTE 0.11 | year1 33,330 | 3yr TCO 72,451 | USD",
        "proofpoint-essentials/business | licence/yr 2,830 | ops FTE 0.11 | year1 32,075 | 3yr TCO 73,655 | USD",
        "huntress/managed-edr | licence/yr 4,315 | ops FTE 0.11 | year1 28,960 | 3yr TCO 73,737 | USD",
        "azure-firewall/basic | licence/yr 3,460 | ops FTE 0.11 | year1 32,705 | 3yr TCO 75,643 | USD",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 3,600 | ops FTE 0.11 | year1 32,845 | 3yr TCO 76,084 | USD",
        "proofpoint-essentials/advanced | licence/yr 3,866 | ops FTE 0.11 | year1 33,111 | 3yr TCO 76,924 | USD",
        "proofpoint-essentials/professional | licence/yr 5,861 | ops FTE 0.11 | year1 35,106 | 3yr TCO 83,211 | USD",
        "sophos-mdr/essentials | licence/yr 8,100 | ops FTE 0.10 | year1 37,007 | 3yr TCO 89,256 | USD",
        "opencanary/open | licence/yr 0 | ops FTE 0.15 | year1 35,935 | 3yr TCO 89,405 | USD",
        "nmap/open | licence/yr 0 | ops FTE 0.16 | year1 34,480 | 3yr TCO 89,640 | USD",
        "tines/free | licence/yr 0 | ops FTE 0.15 | year1 37,695 | 3yr TCO 90,085 | USD",
        "passbolt/community | licence/yr 0 | ops FTE 0.15 | year1 41,075 | 3yr TCO 95,625 | USD",
        "microsoft-entra-id/free | licence/yr 0 | ops FTE 0.15 | year1 44,595 | 3yr TCO 96,985 | USD",
        "passbolt/pro | licence/yr 588 | ops FTE 0.15 | year1 41,663 | 3yr TCO 97,479 | USD",
        "azure-firewall/standard | licence/yr 10,950 | ops FTE 0.11 | year1 40,195 | 3yr TCO 99,255 | USD",
        "aws-network-firewall/standard | licence/yr 3,460 | ops FTE 0.15 | year1 43,455 | 3yr TCO 103,293 | USD",
        "fortinet-fortigate/utp | licence/yr 536 | ops FTE 0.16 | year1 46,718 | 3yr TCO 103,436 | USD",
        "sophos-mdr/complete | licence/yr 13,500 | ops FTE 0.10 | year1 42,407 | 3yr TCO 106,280 | USD",
        "bitdefender-gravityzone/business-security | licence/yr 3,465 | ops FTE 0.16 | year1 43,423 | 3yr TCO 107,797 | USD",
        "devolutions-pam/remote-access-management | licence/yr 1,200 | ops FTE 0.16 | year1 51,982 | 3yr TCO 110,129 | USD",
        "bitdefender-gravityzone/business-security-premium | licence/yr 4,315 | ops FTE 0.16 | year1 44,273 | 3yr TCO 110,477 | USD",
        "devolutions-pam/rdm-it-operations | licence/yr 1,800 | ops FTE 0.16 | year1 52,582 | 3yr TCO 112,021 | USD",
        "microsoft-entra-id/p1 | licence/yr 5,040 | ops FTE 0.15 | year1 49,635 | 3yr TCO 112,874 | USD",
        "azure-firewall/premium | licence/yr 15,330 | ops FTE 0.11 | year1 44,575 | 3yr TCO 113,063 | USD",
        "tenable-vulnerability-management/standard | licence/yr 3,500 | ops FTE 0.16 | year1 49,785 | 3yr TCO 113,089 | USD",
        "cowrie/open | licence/yr 0 | ops FTE 0.21 | year1 44,385 | 3yr TCO 114,755 | USD",
        "devolutions-pam/pam | licence/yr 3,000 | ops FTE 0.16 | year1 53,782 | 3yr TCO 115,804 | USD",
        "blumira/detect | licence/yr 8,640 | ops FTE 0.15 | year1 46,335 | 3yr TCO 117,323 | USD",
        "jumpcloud/device-management | licence/yr 6,480 | ops FTE 0.16 | year1 51,582 | 3yr TCO 118,934 | USD",
        "sentinelone-singularity/complete | licence/yr 8,100 | ops FTE 0.16 | year1 46,978 | 3yr TCO 119,168 | USD",
        "microsoft-entra-id/p2 | licence/yr 7,200 | ops FTE 0.15 | year1 51,795 | 3yr TCO 119,683 | USD",
        "n8n/community-self-hosted | licence/yr 0 | ops FTE 0.21 | year1 49,525 | 3yr TCO 120,975 | USD",
        "n8n/cloud-starter | licence/yr 279 | ops FTE 0.21 | year1 49,804 | 3yr TCO 121,854 | USD",
        "crowdstrike-falcon-complete/complete | licence/yr 18,900 | ops FTE 0.10 | year1 47,638 | 3yr TCO 122,796 | USD",
        "n8n/cloud-pro | licence/yr 697 | ops FTE 0.21 | year1 50,222 | 3yr TCO 123,174 | USD",
        "jumpcloud/sso | licence/yr 7,920 | ops FTE 0.16 | year1 53,022 | 3yr TCO 123,474 | USD",
        "thehive/community | licence/yr 0 | ops FTE 0.21 | year1 54,125 | 3yr TCO 125,575 | USD",
        "defectdojo/community | licence/yr 0 | ops FTE 0.21 | year1 54,125 | 3yr TCO 125,575 | USD",
        "ntopng/community | licence/yr 0 | ops FTE 0.21 | year1 49,709 | 3yr TCO 126,127 | USD",
        "sentinelone-singularity/commercial | licence/yr 10,350 | ops FTE 0.16 | year1 49,228 | 3yr TCO 126,261 | USD",
        "blumira/respond | licence/yr 11,520 | ops FTE 0.15 | year1 49,215 | 3yr TCO 126,402 | USD",
        "jumpcloud/device-identity-management | licence/yr 9,360 | ops FTE 0.16 | year1 54,462 | 3yr TCO 128,013 | USD",
        "apache-guacamole/open | licence/yr 0 | ops FTE 0.21 | year1 54,970 | 3yr TCO 128,110 | USD",
        "opnsense/community | licence/yr 0 | ops FTE 0.21 | year1 59,570 | 3yr TCO 132,710 | USD",
        "pfsense/ce | licence/yr 0 | ops FTE 0.21 | year1 59,570 | 3yr TCO 132,710 | USD",
        "pfsense/plus-software | licence/yr 129 | ops FTE 0.21 | year1 59,699 | 3yr TCO 133,117 | USD",
        "opnsense/business | licence/yr 173 | ops FTE 0.21 | year1 59,743 | 3yr TCO 133,256 | USD",
        "blumira/automate | licence/yr 15,120 | ops FTE 0.15 | year1 52,815 | 3yr TCO 137,751 | USD",
        "tenable-nessus-professional/professional | licence/yr 4,790 | ops FTE 0.23 | year1 50,795 | 3yr TCO 139,315 | USD",
        "arctic-wolf/mdr | licence/yr 14,400 | ops FTE 0.15 | year1 58,657 | 3yr TCO 141,367 | USD",
        "veeam-data-platform/foundation | licence/yr 1,750 | ops FTE 0.21 | year1 65,920 | 3yr TCO 142,827 | USD",
        "veeam-data-platform/advanced | licence/yr 2,450 | ops FTE 0.21 | year1 66,620 | 3yr TCO 145,034 | USD",
        "veeam-data-platform/premium | licence/yr 3,150 | ops FTE 0.21 | year1 67,320 | 3yr TCO 147,240 | USD",
        "proxmox-mail-gateway/no-subscription | licence/yr 0 | ops FTE 0.26 | year1 62,575 | 3yr TCO 150,925 | USD",
        "proxmox-mail-gateway/community | licence/yr 221 | ops FTE 0.26 | year1 62,796 | 3yr TCO 151,621 | USD",
        "proxmox-mail-gateway/basic | licence/yr 628 | ops FTE 0.26 | year1 63,203 | 3yr TCO 152,904 | USD",
        "okta-workforce-identity/starter | licence/yr 4,320 | ops FTE 0.21 | year1 73,972 | 3yr TCO 153,575 | USD",
        "proxmox-mail-gateway/standard | licence/yr 1,465 | ops FTE 0.26 | year1 64,040 | 3yr TCO 155,542 | USD",
        "proxmox-backup-server/no-subscription | licence/yr 0 | ops FTE 0.27 | year1 64,265 | 3yr TCO 155,995 | USD",
        "proxmox-backup-server/community | licence/yr 651 | ops FTE 0.27 | year1 64,916 | 3yr TCO 158,047 | USD",
        "proxmox-backup-server/basic | licence/yr 1,302 | ops FTE 0.27 | year1 65,567 | 3yr TCO 160,099 | USD",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.29 | year1 63,045 | 3yr TCO 161,535 | USD",
        "glpi/community | licence/yr 0 | ops FTE 0.26 | year1 72,418 | 3yr TCO 162,054 | USD",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 2,160 | ops FTE 0.27 | year1 69,945 | 3yr TCO 164,164 | USD",
        "proxmox-backup-server/standard | licence/yr 2,604 | ops FTE 0.27 | year1 66,869 | 3yr TCO 164,204 | USD",
        "netbox/community | licence/yr 0 | ops FTE 0.26 | year1 78,980 | 3yr TCO 167,940 | USD",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 3,744 | ops FTE 0.27 | year1 71,529 | 3yr TCO 169,158 | USD",
        "greenbone-openvas/basic | licence/yr 2,934 | ops FTE 0.29 | year1 65,979 | 3yr TCO 170,784 | USD",
        "okta-workforce-identity/core-essentials | licence/yr 10,080 | ops FTE 0.21 | year1 79,732 | 3yr TCO 171,733 | USD",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 71,025 | 3yr TCO 176,275 | USD",
        "okta-workforce-identity/essentials | licence/yr 12,240 | ops FTE 0.21 | year1 81,892 | 3yr TCO 178,543 | USD",
        "shuffle/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 75,625 | 3yr TCO 180,875 | USD",
        "t-pot/open | licence/yr 0 | ops FTE 0.35 | year1 78,935 | 3yr TCO 200,005 | USD",
        "rspamd/open | licence/yr 0 | ops FTE 0.35 | year1 88,675 | 3yr TCO 210,825 | USD",
        "suricata/open | licence/yr 0 | ops FTE 0.37 | year1 88,249 | 3yr TCO 218,747 | USD",
        "teleport-community/community | licence/yr 0 | ops FTE 0.36 | year1 97,265 | 3yr TCO 222,795 | USD",
        "manageengine-pam360/subscription | licence/yr 7,995 | ops FTE 0.31 | year1 107,465 | 3yr TCO 231,614 | USD",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 90,460 | 3yr TCO 234,580 | USD",
        "stackstorm/open | licence/yr 0 | ops FTE 0.41 | year1 104,025 | 3yr TCO 243,075 | USD",
        "keycloak/open | licence/yr 0 | ops FTE 0.41 | year1 104,870 | 3yr TCO 245,610 | USD",
        "arkime/open | licence/yr 0 | ops FTE 0.42 | year1 101,299 | 3yr TCO 248,697 | USD",
        "bareos/community | licence/yr 0 | ops FTE 0.42 | year1 106,560 | 3yr TCO 250,680 | USD",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 102,144 | 3yr TCO 251,232 | USD",
        "microsoft-sentinel/pay-as-you-go | licence/yr 17,833 | ops FTE 0.32 | year1 106,413 | 3yr TCO 252,957 | USD",
        "bareos/subscription | licence/yr 5,580 | ops FTE 0.42 | year1 112,140 | 3yr TCO 268,270 | USD",
        "elastic-security/basic-self-managed | licence/yr 0 | ops FTE 0.48 | year1 124,394 | 3yr TCO 290,382 | USD",
        "graylog-open/enterprise | licence/yr 15,000 | ops FTE 0.43 | year1 117,144 | 3yr TCO 298,519 | USD",
        "graylog-open/security | licence/yr 18,000 | ops FTE 0.43 | year1 120,144 | 3yr TCO 307,977 | USD",
        "zeek/open | licence/yr 0 | ops FTE 0.53 | year1 125,944 | 3yr TCO 308,832 | USD",
        "security-onion/free | licence/yr 0 | ops FTE 0.53 | year1 126,789 | 3yr TCO 311,367 | USD",
        "opensearch/open | licence/yr 0 | ops FTE 0.53 | year1 132,844 | 3yr TCO 315,732 | USD",
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
        "canarytokens/free | licence/yr 0 | ops FTE 0.05 | year1 201,655 | 3yr TCO 443,966 | INR",
        "runzero/community | licence/yr 0 | ops FTE 0.11 | year1 313,190 | 3yr TCO 698,071 | INR",
        "tines/free | licence/yr 0 | ops FTE 0.15 | year1 409,725 | 3yr TCO 826,675 | INR",
        "snipe-it/self-hosted | licence/yr 0 | ops FTE 0.11 | year1 440,665 | 3yr TCO 838,996 | INR",
        "trivy/open | licence/yr 0 | ops FTE 0.11 | year1 364,406 | 3yr TCO 851,717 | INR",
        "azure-backup/protected-instance | licence/yr 79,668 | ops FTE 0.11 | year1 422,143 | 3yr TCO 876,079 | INR",
        "nmap/open | licence/yr 0 | ops FTE 0.16 | year1 387,165 | 3yr TCO 919,996 | INR",
        "opencanary/open | licence/yr 0 | ops FTE 0.15 | year1 420,690 | 3yr TCO 940,071 | INR",
        "microsoft-entra-id/free | licence/yr 0 | ops FTE 0.15 | year1 530,475 | 3yr TCO 947,425 | INR",
        "snipe-it/hosted-basic | licence/yr 37,936 | ops FTE 0.11 | year1 478,602 | 3yr TCO 958,590 | INR",
        "cisco-duo/essentials | licence/yr 204,861 | ops FTE 0.05 | year1 437,146 | 3yr TCO 1,020,680 | INR",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 136,574 | ops FTE 0.11 | year1 479,049 | 3yr TCO 1,055,475 | INR",
        "cowrie/open | licence/yr 0 | ops FTE 0.21 | year1 487,940 | 3yr TCO 1,141,821 | INR",
        "passbolt/community | licence/yr 0 | ops FTE 0.15 | year1 552,406 | 3yr TCO 1,174,217 | INR",
        "huntress/managed-itdr | licence/yr 245,833 | ops FTE 0.11 | year1 507,808 | 3yr TCO 1,319,415 | INR",
        "passbolt/pro | licence/yr 55,768 | ops FTE 0.15 | year1 608,173 | 3yr TCO 1,350,025 | INR",
        "crowdstrike-falcon-go/go | licence/yr 256,034 | ops FTE 0.11 | year1 524,734 | 3yr TCO 1,371,747 | INR",
        "n8n/community-self-hosted | licence/yr 0 | ops FTE 0.21 | year1 619,656 | 3yr TCO 1,375,967 | INR",
        "fortinet-fortigate/utp | licence/yr 50,836 | ops FTE 0.16 | year1 687,777 | 3yr TCO 1,427,082 | INR",
        "thehive/community | licence/yr 0 | ops FTE 0.21 | year1 700,156 | 3yr TCO 1,456,467 | INR",
        "defectdojo/community | licence/yr 0 | ops FTE 0.21 | year1 700,156 | 3yr TCO 1,456,467 | INR",
        "n8n/cloud-starter | licence/yr 26,459 | ops FTE 0.21 | year1 646,115 | 3yr TCO 1,459,380 | INR",
        "proofpoint-essentials/business | licence/yr 268,368 | ops FTE 0.11 | year1 610,843 | 3yr TCO 1,470,956 | INR",
        "apache-guacamole/open | licence/yr 0 | ops FTE 0.21 | year1 706,881 | 3yr TCO 1,476,642 | INR",
        "opnsense/community | licence/yr 0 | ops FTE 0.21 | year1 787,381 | 3yr TCO 1,557,142 | INR",
        "pfsense/ce | licence/yr 0 | ops FTE 0.21 | year1 787,381 | 3yr TCO 1,557,142 | INR",
        "n8n/cloud-pro | licence/yr 66,148 | ops FTE 0.21 | year1 685,804 | 3yr TCO 1,584,499 | INR",
        "pfsense/plus-software | licence/yr 12,235 | ops FTE 0.21 | year1 799,615 | 3yr TCO 1,595,712 | INR",
        "opnsense/business | licence/yr 16,427 | ops FTE 0.21 | year1 803,807 | 3yr TCO 1,608,927 | INR",
        "backblaze-business-backup/business | licence/yr 422,526 | ops FTE 0.06 | year1 577,001 | 3yr TCO 1,634,439 | INR",
        "proxmox-mail-gateway/no-subscription | licence/yr 0 | ops FTE 0.26 | year1 767,406 | 3yr TCO 1,658,217 | INR",
        "azure-firewall/basic | licence/yr 328,176 | ops FTE 0.11 | year1 670,651 | 3yr TCO 1,659,501 | INR",
        "cisco-duo/advantage | licence/yr 409,722 | ops FTE 0.05 | year1 642,007 | 3yr TCO 1,666,505 | INR",
        "glpi/community | licence/yr 0 | ops FTE 0.26 | year1 886,605 | 3yr TCO 1,693,816 | INR",
        "proxmox-backup-server/no-subscription | licence/yr 0 | ops FTE 0.27 | year1 780,856 | 3yr TCO 1,698,567 | INR",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.29 | year1 727,256 | 3yr TCO 1,698,767 | INR",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 341,435 | ops FTE 0.11 | year1 683,910 | 3yr TCO 1,701,300 | INR",
        "devolutions-pam/remote-access-management | licence/yr 113,812 | ops FTE 0.16 | year1 831,252 | 3yr TCO 1,706,114 | INR",
        "proxmox-mail-gateway/community | licence/yr 20,947 | ops FTE 0.26 | year1 788,353 | 3yr TCO 1,724,252 | INR",
        "proofpoint-essentials/advanced | licence/yr 366,702 | ops FTE 0.11 | year1 709,177 | 3yr TCO 1,780,952 | INR",
        "netbox/community | licence/yr 0 | ops FTE 0.26 | year1 1,004,665 | 3yr TCO 1,806,496 | INR",
        "ntopng/community | licence/yr 0 | ops FTE 0.21 | year1 741,575 | 3yr TCO 1,822,224 | INR",
        "huntress/managed-edr | licence/yr 409,210 | ops FTE 0.11 | year1 671,185 | 3yr TCO 1,834,461 | INR",
        "proxmox-mail-gateway/basic | licence/yr 59,533 | ops FTE 0.26 | year1 826,939 | 3yr TCO 1,845,896 | INR",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 834,656 | 3yr TCO 1,859,967 | INR",
        "devolutions-pam/rdm-it-operations | licence/yr 170,718 | ops FTE 0.16 | year1 888,158 | 3yr TCO 1,885,509 | INR",
        "proxmox-backup-server/community | licence/yr 61,738 | ops FTE 0.27 | year1 842,594 | 3yr TCO 1,893,197 | INR",
        "aws-network-firewall/standard | licence/yr 328,176 | ops FTE 0.15 | year1 778,151 | 3yr TCO 1,901,501 | INR",
        "t-pot/open | licence/yr 0 | ops FTE 0.35 | year1 850,690 | 3yr TCO 1,908,071 | INR",
        "shuffle/self-hosted | licence/yr 0 | ops FTE 0.30 | year1 915,156 | 3yr TCO 1,940,467 | INR",
        "tenable-vulnerability-management/standard | licence/yr 331,951 | ops FTE 0.16 | year1 875,876 | 3yr TCO 2,034,251 | INR",
        "proxmox-backup-server/basic | licence/yr 123,477 | ops FTE 0.27 | year1 904,332 | 3yr TCO 2,087,827 | INR",
        "proxmox-mail-gateway/standard | licence/yr 138,911 | ops FTE 0.26 | year1 906,317 | 3yr TCO 2,096,134 | INR",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 204,861 | ops FTE 0.27 | year1 963,786 | 3yr TCO 2,117,600 | INR",
        "veeam-data-platform/foundation | licence/yr 165,976 | ops FTE 0.21 | year1 1,033,856 | 3yr TCO 2,160,880 | INR",
        "bitdefender-gravityzone/business-security | licence/yr 328,632 | ops FTE 0.16 | year1 850,202 | 3yr TCO 2,198,223 | INR",
        "rspamd/open | licence/yr 0 | ops FTE 0.35 | year1 1,062,906 | 3yr TCO 2,222,717 | INR",
        "devolutions-pam/pam | licence/yr 284,530 | ops FTE 0.16 | year1 1,001,970 | 3yr TCO 2,244,301 | INR",
        "cisco-duo/premier | licence/yr 614,584 | ops FTE 0.05 | year1 846,869 | 3yr TCO 2,312,330 | INR",
        "velociraptor/open | licence/yr 0 | ops FTE 0.42 | year1 989,331 | 3yr TCO 2,323,992 | INR",
        "veeam-data-platform/advanced | licence/yr 232,366 | ops FTE 0.21 | year1 1,100,246 | 3yr TCO 2,370,175 | INR",
        "proofpoint-essentials/professional | licence/yr 555,857 | ops FTE 0.11 | year1 898,332 | 3yr TCO 2,377,264 | INR",
        "teleport-community/community | licence/yr 0 | ops FTE 0.36 | year1 1,197,106 | 3yr TCO 2,383,817 | INR",
        "bitdefender-gravityzone/business-security-premium | licence/yr 409,253 | ops FTE 0.16 | year1 930,824 | 3yr TCO 2,452,382 | INR",
        "microsoft-entra-id/p1 | licence/yr 478,010 | ops FTE 0.15 | year1 1,008,485 | 3yr TCO 2,454,350 | INR",
        "proxmox-backup-server/standard | licence/yr 246,953 | ops FTE 0.27 | year1 1,027,809 | 3yr TCO 2,477,087 | INR",
        "stackstorm/open | licence/yr 0 | ops FTE 0.41 | year1 1,250,906 | 3yr TCO 2,545,217 | INR",
        "keycloak/open | licence/yr 0 | ops FTE 0.41 | year1 1,257,631 | 3yr TCO 2,565,392 | INR",
        "greenbone-openvas/basic | licence/yr 278,263 | ops FTE 0.29 | year1 1,005,519 | 3yr TCO 2,575,992 | INR",
        "veeam-data-platform/premium | licence/yr 298,756 | ops FTE 0.21 | year1 1,166,637 | 3yr TCO 2,579,470 | INR",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 355,093 | ops FTE 0.27 | year1 1,114,018 | 3yr TCO 2,591,205 | INR",
        "bareos/community | licence/yr 0 | ops FTE 0.42 | year1 1,271,081 | 3yr TCO 2,605,742 | INR",
        "suricata/open | licence/yr 0 | ops FTE 0.37 | year1 1,158,025 | 3yr TCO 2,669,074 | INR",
        "okta-workforce-identity/starter | licence/yr 409,722 | ops FTE 0.21 | year1 1,293,232 | 3yr TCO 2,734,680 | INR",
        "tenable-nessus-professional/professional | licence/yr 454,299 | ops FTE 0.23 | year1 980,104 | 3yr TCO 2,768,094 | INR",
        "jumpcloud/device-management | licence/yr 614,584 | ops FTE 0.16 | year1 1,149,094 | 3yr TCO 2,897,005 | INR",
        "arkime/open | licence/yr 0 | ops FTE 0.42 | year1 1,305,775 | 3yr TCO 2,951,324 | INR",
        "graylog-open/open | licence/yr 0 | ops FTE 0.43 | year1 1,312,500 | 3yr TCO 2,971,499 | INR",
        "sophos-mdr/essentials | licence/yr 768,230 | ops FTE 0.10 | year1 1,108,015 | 3yr TCO 3,038,699 | INR",
        "microsoft-entra-id/p2 | licence/yr 682,871 | ops FTE 0.15 | year1 1,213,346 | 3yr TCO 3,100,175 | INR",
        "sentinelone-singularity/complete | licence/yr 768,187 | ops FTE 0.16 | year1 1,187,327 | 3yr TCO 3,276,629 | INR",
        "jumpcloud/sso | licence/yr 751,158 | ops FTE 0.16 | year1 1,285,668 | 3yr TCO 3,327,555 | INR",
        "blumira/detect | licence/yr 819,445 | ops FTE 0.15 | year1 1,229,170 | 3yr TCO 3,409,975 | INR",
        "elastic-security/basic-self-managed | licence/yr 0 | ops FTE 0.48 | year1 1,621,250 | 3yr TCO 3,414,749 | INR",
        "thinkst-canary/subscription | licence/yr 948,432 | ops FTE 0.05 | year1 1,150,087 | 3yr TCO 3,433,897 | INR",
        "zeek/open | licence/yr 0 | ops FTE 0.53 | year1 1,567,750 | 3yr TCO 3,495,749 | INR",
        "security-onion/free | licence/yr 0 | ops FTE 0.53 | year1 1,574,475 | 3yr TCO 3,515,924 | INR",
        "opensearch/open | licence/yr 0 | ops FTE 0.53 | year1 1,688,500 | 3yr TCO 3,616,499 | INR",
        "wazuh/open | licence/yr 0 | ops FTE 0.53 | year1 1,775,725 | 3yr TCO 3,717,174 | INR",
        "jumpcloud/device-identity-management | licence/yr 887,732 | ops FTE 0.16 | year1 1,422,242 | 3yr TCO 3,758,105 | INR",
        "azure-firewall/standard | licence/yr 1,038,533 | ops FTE 0.11 | year1 1,381,008 | 3yr TCO 3,898,899 | INR",
        "sentinelone-singularity/commercial | licence/yr 981,584 | ops FTE 0.16 | year1 1,400,724 | 3yr TCO 3,949,364 | INR",
        "blumira/respond | licence/yr 1,092,593 | ops FTE 0.15 | year1 1,502,318 | 3yr TCO 4,271,075 | INR",
        "bareos/subscription | licence/yr 529,186 | ops FTE 0.42 | year1 1,800,266 | 3yr TCO 4,273,999 | INR",
        "okta-workforce-identity/core-essentials | licence/yr 956,019 | ops FTE 0.21 | year1 1,839,529 | 3yr TCO 4,456,880 | INR",
        "sophos-mdr/complete | licence/yr 1,280,383 | ops FTE 0.10 | year1 1,620,168 | 3yr TCO 4,653,262 | INR",
        "manageengine-pam360/subscription | licence/yr 758,271 | ops FTE 0.31 | year1 2,082,652 | 3yr TCO 4,753,592 | INR",
        "okta-workforce-identity/essentials | licence/yr 1,160,880 | ops FTE 0.21 | year1 2,044,390 | 3yr TCO 5,102,705 | INR",
        "azure-firewall/premium | licence/yr 1,453,946 | ops FTE 0.11 | year1 1,796,421 | 3yr TCO 5,208,489 | INR",
        "arctic-wolf/mdr | licence/yr 1,365,742 | ops FTE 0.15 | year1 1,893,527 | 3yr TCO 5,244,855 | INR",
        "blumira/automate | licence/yr 1,434,029 | ops FTE 0.15 | year1 1,843,754 | 3yr TCO 5,347,451 | INR",
        "crowdstrike-falcon-complete/complete | licence/yr 1,792,536 | ops FTE 0.10 | year1 2,130,976 | 3yr TCO 6,263,789 | INR",
        "microsoft-sentinel/pay-as-you-go | licence/yr 1,691,306 | ops FTE 0.32 | year1 2,725,456 | 3yr TCO 7,226,792 | INR",
        "graylog-open/enterprise | licence/yr 1,422,648 | ops FTE 0.43 | year1 2,735,147 | 3yr TCO 7,456,396 | INR",
        "graylog-open/security | licence/yr 1,707,177 | ops FTE 0.43 | year1 3,019,677 | 3yr TCO 8,353,375 | INR",
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
