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
  loadStaffingModel,
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
  staffingModel: loadStaffingModel(DATA_DIR),
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
    deliveryModel: 'client_operated',
    serviceLevel: null,
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
        "cisco-duo/free | licence/yr 0 | ops FTE 0.05 | year1 17,149 | 3yr TCO 33,047 | USD",
        "canarytokens/free | licence/yr 0 | ops FTE 0.05 | year1 14,191 | 3yr TCO 33,373 | USD",
        "backblaze-business-backup/business | licence/yr 4,455 | ops FTE 0.04 | year1 15,027 | 3yr TCO 36,559 | USD",
        "cisco-duo/essentials | licence/yr 2,160 | ops FTE 0.05 | year1 19,309 | 3yr TCO 39,856 | USD",
        "cisco-duo/advantage | licence/yr 4,320 | ops FTE 0.05 | year1 21,469 | 3yr TCO 46,665 | USD",
        "huntress/managed-itdr | licence/yr 2,592 | ops FTE 0.07 | year1 20,534 | 3yr TCO 48,196 | USD",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 1,440 | ops FTE 0.07 | year1 23,982 | 3yr TCO 49,164 | USD",
        "crowdstrike-falcon-go/go | licence/yr 2,700 | ops FTE 0.07 | year1 21,543 | 3yr TCO 51,240 | USD",
        "cisco-duo/premier | licence/yr 6,480 | ops FTE 0.05 | year1 23,629 | 3yr TCO 53,475 | USD",
        "huntress/managed-edr | licence/yr 4,315 | ops FTE 0.07 | year1 22,256 | 3yr TCO 53,627 | USD",
        "azure-firewall/basic | licence/yr 3,460 | ops FTE 0.07 | year1 26,002 | 3yr TCO 55,533 | USD",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 3,600 | ops FTE 0.07 | year1 26,142 | 3yr TCO 55,974 | USD",
        "azure-backup/protected-instance | licence/yr 840 | ops FTE 0.09 | year1 27,982 | 3yr TCO 61,075 | USD",
        "runzero/community | licence/yr 0 | ops FTE 0.11 | year1 25,843 | 3yr TCO 63,728 | USD",
        "thinkst-canary/subscription | licence/yr 10,000 | ops FTE 0.05 | year1 24,191 | 3yr TCO 64,898 | USD",
        "trivy/open | licence/yr 0 | ops FTE 0.11 | year1 26,383 | 3yr TCO 65,348 | USD",
        "proofpoint-essentials/business | licence/yr 2,830 | ops FTE 0.09 | year1 29,972 | 3yr TCO 67,347 | USD",
        "proofpoint-essentials/advanced | licence/yr 3,866 | ops FTE 0.09 | year1 31,009 | 3yr TCO 70,616 | USD",
        "aws-network-firewall/standard | licence/yr 3,460 | ops FTE 0.10 | year1 33,372 | 3yr TCO 73,043 | USD",
        "snipe-it/self-hosted | licence/yr 0 | ops FTE 0.12 | year1 34,245 | 3yr TCO 75,136 | USD",
        "snipe-it/hosted-basic | licence/yr 400 | ops FTE 0.12 | year1 34,645 | 3yr TCO 76,397 | USD",
        "proofpoint-essentials/professional | licence/yr 5,861 | ops FTE 0.09 | year1 33,003 | 3yr TCO 76,903 | USD",
        "azure-firewall/standard | licence/yr 10,950 | ops FTE 0.07 | year1 33,492 | 3yr TCO 79,145 | USD",
        "tines/free | licence/yr 0 | ops FTE 0.14 | year1 34,325 | 3yr TCO 79,974 | USD",
        "sophos-mdr/essentials | licence/yr 8,100 | ops FTE 0.09 | year1 34,731 | 3yr TCO 82,429 | USD",
        "microsoft-entra-id/free | licence/yr 0 | ops FTE 0.14 | year1 41,225 | 3yr TCO 86,874 | USD",
        "sentinelone-singularity/complete | licence/yr 8,100 | ops FTE 0.10 | year1 36,973 | 3yr TCO 89,155 | USD",
        "opencanary/open | licence/yr 0 | ops FTE 0.16 | year1 36,593 | 3yr TCO 91,378 | USD",
        "azure-firewall/premium | licence/yr 15,330 | ops FTE 0.07 | year1 37,872 | 3yr TCO 92,953 | USD",
        "nmap/open | licence/yr 0 | ops FTE 0.17 | year1 35,795 | 3yr TCO 93,586 | USD",
        "sentinelone-singularity/commercial | licence/yr 10,350 | ops FTE 0.10 | year1 39,223 | 3yr TCO 96,248 | USD",
        "passbolt/community | licence/yr 0 | ops FTE 0.16 | year1 41,733 | 3yr TCO 97,598 | USD",
        "passbolt/pro | licence/yr 588 | ops FTE 0.16 | year1 42,321 | 3yr TCO 99,452 | USD",
        "sophos-mdr/complete | licence/yr 13,500 | ops FTE 0.09 | year1 40,131 | 3yr TCO 99,453 | USD",
        "crowdstrike-falcon-complete/complete | licence/yr 18,900 | ops FTE 0.06 | year1 40,901 | 3yr TCO 102,584 | USD",
        "microsoft-entra-id/p1 | licence/yr 5,040 | ops FTE 0.14 | year1 46,265 | 3yr TCO 102,763 | USD",
        "tenable-vulnerability-management/standard | licence/yr 3,500 | ops FTE 0.15 | year1 47,279 | 3yr TCO 105,572 | USD",
        "fortinet-fortigate/utp | licence/yr 536 | ops FTE 0.16 | year1 47,770 | 3yr TCO 106,592 | USD",
        "blumira/detect | licence/yr 8,640 | ops FTE 0.14 | year1 42,965 | 3yr TCO 107,212 | USD",
        "microsoft-entra-id/p2 | licence/yr 7,200 | ops FTE 0.14 | year1 48,425 | 3yr TCO 109,572 | USD",
        "jumpcloud/device-management | licence/yr 6,480 | ops FTE 0.14 | year1 48,471 | 3yr TCO 109,602 | USD",
        "bitdefender-gravityzone/business-security | licence/yr 3,465 | ops FTE 0.17 | year1 45,001 | 3yr TCO 112,532 | USD",
        "devolutions-pam/remote-access-management | licence/yr 1,200 | ops FTE 0.16 | year1 53,034 | 3yr TCO 113,286 | USD",
        "jumpcloud/sso | licence/yr 7,920 | ops FTE 0.14 | year1 49,911 | 3yr TCO 114,141 | USD",
        "devolutions-pam/rdm-it-operations | licence/yr 1,800 | ops FTE 0.16 | year1 53,634 | 3yr TCO 115,177 | USD",
        "bitdefender-gravityzone/business-security-premium | licence/yr 4,315 | ops FTE 0.17 | year1 45,851 | 3yr TCO 115,212 | USD",
        "blumira/respond | licence/yr 11,520 | ops FTE 0.14 | year1 45,845 | 3yr TCO 116,291 | USD",
        "cowrie/open | licence/yr 0 | ops FTE 0.21 | year1 45,043 | 3yr TCO 116,728 | USD",
        "jumpcloud/device-identity-management | licence/yr 9,360 | ops FTE 0.14 | year1 51,351 | 3yr TCO 118,681 | USD",
        "devolutions-pam/pam | licence/yr 3,000 | ops FTE 0.16 | year1 54,834 | 3yr TCO 118,960 | USD",
        "n8n/community-self-hosted | licence/yr 0 | ops FTE 0.21 | year1 50,183 | 3yr TCO 122,948 | USD",
        "n8n/cloud-starter | licence/yr 279 | ops FTE 0.21 | year1 50,462 | 3yr TCO 123,827 | USD",
        "n8n/cloud-pro | licence/yr 697 | ops FTE 0.21 | year1 50,880 | 3yr TCO 125,147 | USD",
        "thehive/community | licence/yr 0 | ops FTE 0.21 | year1 54,783 | 3yr TCO 127,548 | USD",
        "defectdojo/community | licence/yr 0 | ops FTE 0.21 | year1 54,783 | 3yr TCO 127,548 | USD",
        "blumira/automate | licence/yr 15,120 | ops FTE 0.14 | year1 49,445 | 3yr TCO 127,640 | USD",
        "ntopng/community | licence/yr 0 | ops FTE 0.22 | year1 51,037 | 3yr TCO 130,112 | USD",
        "arctic-wolf/mdr | licence/yr 14,400 | ops FTE 0.13 | year1 55,114 | 3yr TCO 130,738 | USD",
        "apache-guacamole/open | licence/yr 0 | ops FTE 0.22 | year1 56,285 | 3yr TCO 132,056 | USD",
        "opnsense/community | licence/yr 0 | ops FTE 0.22 | year1 60,885 | 3yr TCO 136,656 | USD",
        "pfsense/ce | licence/yr 0 | ops FTE 0.22 | year1 60,885 | 3yr TCO 136,656 | USD",
        "pfsense/plus-software | licence/yr 129 | ops FTE 0.22 | year1 61,014 | 3yr TCO 137,063 | USD",
        "opnsense/business | licence/yr 173 | ops FTE 0.22 | year1 61,058 | 3yr TCO 137,202 | USD",
        "okta-workforce-identity/starter | licence/yr 4,320 | ops FTE 0.18 | year1 69,594 | 3yr TCO 140,440 | USD",
        "veeam-data-platform/foundation | licence/yr 1,750 | ops FTE 0.22 | year1 67,235 | 3yr TCO 146,773 | USD",
        "veeam-data-platform/advanced | licence/yr 2,450 | ops FTE 0.22 | year1 67,935 | 3yr TCO 148,980 | USD",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 2,160 | ops FTE 0.24 | year1 64,904 | 3yr TCO 149,042 | USD",
        "tenable-nessus-professional/professional | licence/yr 4,790 | ops FTE 0.24 | year1 54,083 | 3yr TCO 149,180 | USD",
        "veeam-data-platform/premium | licence/yr 3,150 | ops FTE 0.22 | year1 68,635 | 3yr TCO 151,186 | USD",
        "proxmox-mail-gateway/no-subscription | licence/yr 0 | ops FTE 0.26 | year1 63,233 | 3yr TCO 152,898 | USD",
        "proxmox-mail-gateway/community | licence/yr 221 | ops FTE 0.26 | year1 63,454 | 3yr TCO 153,594 | USD",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 3,744 | ops FTE 0.24 | year1 66,488 | 3yr TCO 154,036 | USD",
        "proxmox-mail-gateway/basic | licence/yr 628 | ops FTE 0.26 | year1 63,860 | 3yr TCO 154,877 | USD",
        "proxmox-mail-gateway/standard | licence/yr 1,465 | ops FTE 0.26 | year1 64,697 | 3yr TCO 157,515 | USD",
        "okta-workforce-identity/core-essentials | licence/yr 10,080 | ops FTE 0.18 | year1 75,354 | 3yr TCO 158,598 | USD",
        "proxmox-backup-server/no-subscription | licence/yr 0 | ops FTE 0.28 | year1 66,238 | 3yr TCO 161,914 | USD",
        "proxmox-backup-server/community | licence/yr 651 | ops FTE 0.28 | year1 66,889 | 3yr TCO 163,966 | USD",
        "okta-workforce-identity/essentials | licence/yr 12,240 | ops FTE 0.18 | year1 77,514 | 3yr TCO 165,407 | USD",
        "proxmox-backup-server/basic | licence/yr 1,302 | ops FTE 0.28 | year1 67,540 | 3yr TCO 166,018 | USD",
        "glpi/community | licence/yr 0 | ops FTE 0.27 | year1 73,996 | 3yr TCO 166,789 | USD",
        "proxmox-backup-server/standard | licence/yr 2,604 | ops FTE 0.28 | year1 68,842 | 3yr TCO 170,122 | USD",
        "netbox/community | licence/yr 0 | ops FTE 0.27 | year1 80,295 | 3yr TCO 171,886 | USD",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.31 | year1 67,649 | 3yr TCO 175,346 | USD",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.31 | year1 71,683 | 3yr TCO 178,248 | USD",
        "shuffle/self-hosted | licence/yr 0 | ops FTE 0.31 | year1 76,283 | 3yr TCO 182,848 | USD",
        "greenbone-openvas/basic | licence/yr 2,934 | ops FTE 0.31 | year1 70,582 | 3yr TCO 184,595 | USD",
        "microsoft-sentinel/pay-as-you-go | licence/yr 17,833 | ops FTE 0.20 | year1 86,359 | 3yr TCO 192,797 | USD",
        "t-pot/open | licence/yr 0 | ops FTE 0.36 | year1 79,593 | 3yr TCO 201,978 | USD",
        "rspamd/open | licence/yr 0 | ops FTE 0.36 | year1 89,333 | 3yr TCO 212,798 | USD",
        "suricata/open | licence/yr 0 | ops FTE 0.39 | year1 90,893 | 3yr TCO 226,678 | USD",
        "teleport-community/community | licence/yr 0 | ops FTE 0.38 | year1 99,238 | 3yr TCO 228,714 | USD",
        "manageengine-pam360/subscription | licence/yr 7,995 | ops FTE 0.32 | year1 108,780 | 3yr TCO 235,560 | USD",
        "velociraptor/open | licence/yr 0 | ops FTE 0.44 | year1 93,091 | 3yr TCO 242,472 | USD",
        "stackstorm/open | licence/yr 0 | ops FTE 0.41 | year1 104,683 | 3yr TCO 245,048 | USD",
        "keycloak/open | licence/yr 0 | ops FTE 0.42 | year1 106,185 | 3yr TCO 249,556 | USD",
        "arkime/open | licence/yr 0 | ops FTE 0.44 | year1 103,943 | 3yr TCO 256,628 | USD",
        "bareos/community | licence/yr 0 | ops FTE 0.44 | year1 109,191 | 3yr TCO 258,572 | USD",
        "graylog-open/open | licence/yr 0 | ops FTE 0.44 | year1 105,445 | 3yr TCO 261,136 | USD",
        "bareos/subscription | licence/yr 5,580 | ops FTE 0.44 | year1 114,770 | 3yr TCO 276,161 | USD",
        "elastic-security/basic-self-managed | licence/yr 0 | ops FTE 0.49 | year1 127,695 | 3yr TCO 300,286 | USD",
        "graylog-open/enterprise | licence/yr 15,000 | ops FTE 0.44 | year1 120,445 | 3yr TCO 308,424 | USD",
        "graylog-open/security | licence/yr 18,000 | ops FTE 0.44 | year1 123,445 | 3yr TCO 317,881 | USD",
        "zeek/open | licence/yr 0 | ops FTE 0.54 | year1 129,245 | 3yr TCO 318,736 | USD",
        "security-onion/free | licence/yr 0 | ops FTE 0.55 | year1 130,748 | 3yr TCO 323,244 | USD",
        "opensearch/open | licence/yr 0 | ops FTE 0.54 | year1 136,145 | 3yr TCO 325,636 | USD",
        "wazuh/open | licence/yr 0 | ops FTE 0.55 | year1 142,248 | 3yr TCO 334,744 | USD",
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
        "cisco-duo/free | licence/yr 0 | ops FTE 0.05 | year1 224,262 | 3yr TCO 350,785 | INR",
        "canarytokens/free | licence/yr 0 | ops FTE 0.05 | year1 203,749 | 3yr TCO 450,247 | INR",
        "runzero/community | licence/yr 0 | ops FTE 0.11 | year1 318,424 | 3yr TCO 713,773 | INR",
        "tines/free | licence/yr 0 | ops FTE 0.14 | year1 382,903 | 3yr TCO 746,208 | INR",
        "azure-backup/protected-instance | licence/yr 79,668 | ops FTE 0.09 | year1 405,408 | 3yr TCO 825,874 | INR",
        "microsoft-entra-id/free | licence/yr 0 | ops FTE 0.14 | year1 503,653 | 3yr TCO 866,958 | INR",
        "trivy/open | licence/yr 0 | ops FTE 0.11 | year1 369,640 | 3yr TCO 867,419 | INR",
        "snipe-it/self-hosted | licence/yr 0 | ops FTE 0.12 | year1 451,133 | 3yr TCO 870,400 | INR",
        "microsoft-defender-for-office-365/plan-1 | licence/yr 136,574 | ops FTE 0.07 | year1 425,700 | 3yr TCO 895,426 | INR",
        "nmap/open | licence/yr 0 | ops FTE 0.17 | year1 397,633 | 3yr TCO 951,400 | INR",
        "opencanary/open | licence/yr 0 | ops FTE 0.16 | year1 425,924 | 3yr TCO 955,773 | INR",
        "snipe-it/hosted-basic | licence/yr 37,936 | ops FTE 0.12 | year1 489,069 | 3yr TCO 989,994 | INR",
        "cisco-duo/essentials | licence/yr 204,861 | ops FTE 0.05 | year1 429,123 | 3yr TCO 996,610 | INR",
        "cowrie/open | licence/yr 0 | ops FTE 0.21 | year1 493,174 | 3yr TCO 1,157,523 | INR",
        "huntress/managed-itdr | licence/yr 245,833 | ops FTE 0.07 | year1 454,459 | 3yr TCO 1,159,366 | INR",
        "passbolt/community | licence/yr 0 | ops FTE 0.16 | year1 557,640 | 3yr TCO 1,189,919 | INR",
        "crowdstrike-falcon-go/go | licence/yr 256,034 | ops FTE 0.07 | year1 471,835 | 3yr TCO 1,213,049 | INR",
        "passbolt/pro | licence/yr 55,768 | ops FTE 0.16 | year1 613,407 | 3yr TCO 1,365,727 | INR",
        "n8n/community-self-hosted | licence/yr 0 | ops FTE 0.21 | year1 624,890 | 3yr TCO 1,391,669 | INR",
        "proofpoint-essentials/business | licence/yr 268,368 | ops FTE 0.09 | year1 594,108 | 3yr TCO 1,420,751 | INR",
        "fortinet-fortigate/utp | licence/yr 50,836 | ops FTE 0.16 | year1 696,151 | 3yr TCO 1,452,205 | INR",
        "thehive/community | licence/yr 0 | ops FTE 0.21 | year1 705,390 | 3yr TCO 1,472,169 | INR",
        "defectdojo/community | licence/yr 0 | ops FTE 0.21 | year1 705,390 | 3yr TCO 1,472,169 | INR",
        "n8n/cloud-starter | licence/yr 26,459 | ops FTE 0.21 | year1 651,349 | 3yr TCO 1,475,082 | INR",
        "azure-firewall/basic | licence/yr 328,176 | ops FTE 0.07 | year1 617,302 | 3yr TCO 1,499,452 | INR",
        "apache-guacamole/open | licence/yr 0 | ops FTE 0.22 | year1 717,348 | 3yr TCO 1,508,045 | INR",
        "microsoft-defender-for-office-365/plan-2 | licence/yr 341,435 | ops FTE 0.07 | year1 630,561 | 3yr TCO 1,541,251 | INR",
        "backblaze-business-backup/business | licence/yr 422,526 | ops FTE 0.04 | year1 550,552 | 3yr TCO 1,555,090 | INR",
        "opnsense/community | licence/yr 0 | ops FTE 0.22 | year1 797,848 | 3yr TCO 1,588,545 | INR",
        "pfsense/ce | licence/yr 0 | ops FTE 0.22 | year1 797,848 | 3yr TCO 1,588,545 | INR",
        "n8n/cloud-pro | licence/yr 66,148 | ops FTE 0.21 | year1 691,038 | 3yr TCO 1,600,201 | INR",
        "pfsense/plus-software | licence/yr 12,235 | ops FTE 0.22 | year1 810,083 | 3yr TCO 1,627,116 | INR",
        "opnsense/business | licence/yr 16,427 | ops FTE 0.22 | year1 814,275 | 3yr TCO 1,640,331 | INR",
        "cisco-duo/advantage | licence/yr 409,722 | ops FTE 0.05 | year1 633,984 | 3yr TCO 1,642,435 | INR",
        "aws-network-firewall/standard | licence/yr 328,176 | ops FTE 0.10 | year1 697,902 | 3yr TCO 1,660,752 | INR",
        "proxmox-mail-gateway/no-subscription | licence/yr 0 | ops FTE 0.26 | year1 772,640 | 3yr TCO 1,673,919 | INR",
        "huntress/managed-edr | licence/yr 409,210 | ops FTE 0.07 | year1 617,836 | 3yr TCO 1,674,412 | INR",
        "proofpoint-essentials/advanced | licence/yr 366,702 | ops FTE 0.09 | year1 692,442 | 3yr TCO 1,730,747 | INR",
        "devolutions-pam/remote-access-management | licence/yr 113,812 | ops FTE 0.16 | year1 839,627 | 3yr TCO 1,731,236 | INR",
        "glpi/community | licence/yr 0 | ops FTE 0.27 | year1 899,167 | 3yr TCO 1,731,500 | INR",
        "proxmox-mail-gateway/community | licence/yr 20,947 | ops FTE 0.26 | year1 793,586 | 3yr TCO 1,739,954 | INR",
        "proxmox-backup-server/no-subscription | licence/yr 0 | ops FTE 0.28 | year1 796,557 | 3yr TCO 1,745,672 | INR",
        "greenbone-openvas/free | licence/yr 0 | ops FTE 0.31 | year1 763,893 | 3yr TCO 1,808,679 | INR",
        "netbox/community | licence/yr 0 | ops FTE 0.27 | year1 1,015,133 | 3yr TCO 1,837,900 | INR",
        "ntopng/community | licence/yr 0 | ops FTE 0.22 | year1 753,295 | 3yr TCO 1,857,384 | INR",
        "proxmox-mail-gateway/basic | licence/yr 59,533 | ops FTE 0.26 | year1 832,173 | 3yr TCO 1,861,598 | INR",
        "sublime-platform/self-hosted | licence/yr 0 | ops FTE 0.31 | year1 839,890 | 3yr TCO 1,875,669 | INR",
        "devolutions-pam/rdm-it-operations | licence/yr 170,718 | ops FTE 0.16 | year1 896,533 | 3yr TCO 1,910,632 | INR",
        "t-pot/open | licence/yr 0 | ops FTE 0.36 | year1 855,924 | 3yr TCO 1,923,773 | INR",
        "proxmox-backup-server/community | licence/yr 61,738 | ops FTE 0.28 | year1 858,296 | 3yr TCO 1,940,302 | INR",
        "shuffle/self-hosted | licence/yr 0 | ops FTE 0.31 | year1 920,390 | 3yr TCO 1,956,169 | INR",
        "tenable-vulnerability-management/standard | licence/yr 331,951 | ops FTE 0.15 | year1 855,934 | 3yr TCO 1,974,424 | INR",
        "microsoft-defender-for-endpoint/plan-1 | licence/yr 204,861 | ops FTE 0.24 | year1 923,669 | 3yr TCO 1,997,248 | INR",
        "proxmox-mail-gateway/standard | licence/yr 138,911 | ops FTE 0.26 | year1 911,551 | 3yr TCO 2,111,836 | INR",
        "proxmox-backup-server/basic | licence/yr 123,477 | ops FTE 0.28 | year1 920,034 | 3yr TCO 2,134,932 | INR",
        "veeam-data-platform/foundation | licence/yr 165,976 | ops FTE 0.22 | year1 1,044,324 | 3yr TCO 2,192,283 | INR",
        "bitdefender-gravityzone/business-security | licence/yr 328,632 | ops FTE 0.17 | year1 862,764 | 3yr TCO 2,235,907 | INR",
        "rspamd/open | licence/yr 0 | ops FTE 0.36 | year1 1,068,140 | 3yr TCO 2,238,419 | INR",
        "devolutions-pam/pam | licence/yr 284,530 | ops FTE 0.16 | year1 1,010,344 | 3yr TCO 2,269,424 | INR",
        "cisco-duo/premier | licence/yr 614,584 | ops FTE 0.05 | year1 838,845 | 3yr TCO 2,288,260 | INR",
        "proofpoint-essentials/professional | licence/yr 555,857 | ops FTE 0.09 | year1 881,597 | 3yr TCO 2,327,059 | INR",
        "microsoft-entra-id/p1 | licence/yr 478,010 | ops FTE 0.14 | year1 981,662 | 3yr TCO 2,373,883 | INR",
        "velociraptor/open | licence/yr 0 | ops FTE 0.44 | year1 1,010,266 | 3yr TCO 2,386,799 | INR",
        "veeam-data-platform/advanced | licence/yr 232,366 | ops FTE 0.22 | year1 1,110,714 | 3yr TCO 2,401,579 | INR",
        "teleport-community/community | licence/yr 0 | ops FTE 0.38 | year1 1,212,807 | 3yr TCO 2,430,922 | INR",
        "microsoft-defender-for-endpoint/plan-2 | licence/yr 355,093 | ops FTE 0.24 | year1 1,073,901 | 3yr TCO 2,470,853 | INR",
        "bitdefender-gravityzone/business-security-premium | licence/yr 409,253 | ops FTE 0.17 | year1 943,385 | 3yr TCO 2,490,066 | INR",
        "proxmox-backup-server/standard | licence/yr 246,953 | ops FTE 0.28 | year1 1,043,511 | 3yr TCO 2,524,192 | INR",
        "stackstorm/open | licence/yr 0 | ops FTE 0.41 | year1 1,256,140 | 3yr TCO 2,560,919 | INR",
        "keycloak/open | licence/yr 0 | ops FTE 0.42 | year1 1,268,098 | 3yr TCO 2,596,795 | INR",
        "veeam-data-platform/premium | licence/yr 298,756 | ops FTE 0.22 | year1 1,177,104 | 3yr TCO 2,610,874 | INR",
        "okta-workforce-identity/starter | licence/yr 409,722 | ops FTE 0.18 | year1 1,258,387 | 3yr TCO 2,630,143 | INR",
        "bareos/community | licence/yr 0 | ops FTE 0.44 | year1 1,292,016 | 3yr TCO 2,668,549 | INR",
        "greenbone-openvas/basic | licence/yr 278,263 | ops FTE 0.31 | year1 1,042,157 | 3yr TCO 2,685,905 | INR",
        "suricata/open | licence/yr 0 | ops FTE 0.39 | year1 1,180,212 | 3yr TCO 2,735,637 | INR",
        "jumpcloud/device-management | licence/yr 614,584 | ops FTE 0.14 | year1 1,124,335 | 3yr TCO 2,822,730 | INR",
        "tenable-nessus-professional/professional | licence/yr 454,299 | ops FTE 0.24 | year1 1,006,274 | 3yr TCO 2,846,603 | INR",
        "sophos-mdr/essentials | licence/yr 768,230 | ops FTE 0.09 | year1 1,089,904 | 3yr TCO 2,984,366 | INR",
        "arkime/open | licence/yr 0 | ops FTE 0.44 | year1 1,327,962 | 3yr TCO 3,017,887 | INR",
        "microsoft-entra-id/p2 | licence/yr 682,871 | ops FTE 0.14 | year1 1,186,523 | 3yr TCO 3,019,708 | INR",
        "sentinelone-singularity/complete | licence/yr 768,187 | ops FTE 0.10 | year1 1,107,708 | 3yr TCO 3,037,772 | INR",
        "graylog-open/open | licence/yr 0 | ops FTE 0.44 | year1 1,339,921 | 3yr TCO 3,053,764 | INR",
        "jumpcloud/sso | licence/yr 751,158 | ops FTE 0.14 | year1 1,260,910 | 3yr TCO 3,253,280 | INR",
        "blumira/detect | licence/yr 819,445 | ops FTE 0.14 | year1 1,202,348 | 3yr TCO 3,329,508 | INR",
        "thinkst-canary/subscription | licence/yr 948,432 | ops FTE 0.05 | year1 1,152,181 | 3yr TCO 3,440,178 | INR",
        "elastic-security/basic-self-managed | licence/yr 0 | ops FTE 0.49 | year1 1,648,671 | 3yr TCO 3,497,014 | INR",
        "zeek/open | licence/yr 0 | ops FTE 0.54 | year1 1,595,171 | 3yr TCO 3,578,014 | INR",
        "security-onion/free | licence/yr 0 | ops FTE 0.55 | year1 1,607,130 | 3yr TCO 3,613,891 | INR",
        "jumpcloud/device-identity-management | licence/yr 887,732 | ops FTE 0.14 | year1 1,397,484 | 3yr TCO 3,683,830 | INR",
        "opensearch/open | licence/yr 0 | ops FTE 0.54 | year1 1,715,921 | 3yr TCO 3,698,764 | INR",
        "sentinelone-singularity/commercial | licence/yr 981,584 | ops FTE 0.10 | year1 1,321,105 | 3yr TCO 3,710,507 | INR",
        "azure-firewall/standard | licence/yr 1,038,533 | ops FTE 0.07 | year1 1,327,658 | 3yr TCO 3,738,850 | INR",
        "wazuh/open | licence/yr 0 | ops FTE 0.55 | year1 1,808,380 | 3yr TCO 3,815,141 | INR",
        "blumira/respond | licence/yr 1,092,593 | ops FTE 0.14 | year1 1,475,496 | 3yr TCO 4,190,608 | INR",
        "bareos/subscription | licence/yr 529,186 | ops FTE 0.44 | year1 1,821,202 | 3yr TCO 4,336,806 | INR",
        "okta-workforce-identity/core-essentials | licence/yr 956,019 | ops FTE 0.18 | year1 1,804,683 | 3yr TCO 4,352,343 | INR",
        "sophos-mdr/complete | licence/yr 1,280,383 | ops FTE 0.09 | year1 1,602,057 | 3yr TCO 4,598,929 | INR",
        "manageengine-pam360/subscription | licence/yr 758,271 | ops FTE 0.32 | year1 2,093,120 | 3yr TCO 4,784,995 | INR",
        "okta-workforce-identity/essentials | licence/yr 1,160,880 | ops FTE 0.18 | year1 2,009,545 | 3yr TCO 4,998,168 | INR",
        "azure-firewall/premium | licence/yr 1,453,946 | ops FTE 0.07 | year1 1,743,071 | 3yr TCO 5,048,440 | INR",
        "arctic-wolf/mdr | licence/yr 1,365,742 | ops FTE 0.13 | year1 1,865,328 | 3yr TCO 5,160,260 | INR",
        "blumira/automate | licence/yr 1,434,029 | ops FTE 0.14 | year1 1,816,931 | 3yr TCO 5,266,983 | INR",
        "crowdstrike-falcon-complete/complete | licence/yr 1,792,536 | ops FTE 0.06 | year1 2,077,356 | 3yr TCO 6,102,930 | INR",
        "microsoft-sentinel/pay-as-you-go | licence/yr 1,691,306 | ops FTE 0.20 | year1 2,565,857 | 3yr TCO 6,747,996 | INR",
        "graylog-open/enterprise | licence/yr 1,422,648 | ops FTE 0.44 | year1 2,762,569 | 3yr TCO 7,538,660 | INR",
        "graylog-open/security | licence/yr 1,707,177 | ops FTE 0.44 | year1 3,047,098 | 3yr TCO 8,435,640 | INR",
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
