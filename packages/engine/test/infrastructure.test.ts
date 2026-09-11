// The infrastructure stage, checked on estates whose right answers are obvious.
//
// The point of this stage is that two clients with different infrastructure and
// no compliance obligation must not receive the same stack. These tests assert
// exactly that, and assert the eliminations that make the difference real: a
// company with no network is never sold network detection.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AssetInventory, CategoryWeights, InfrastructureSurface } from '@stackfit/schema';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import {
  computeCategoryRelevance,
  computeInfrastructureProfile,
  rankCategories,
} from '../src/infrastructure';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');

const weights: CategoryWeights = CategoryWeights.parse(
  parseYaml(readFileSync(join(DATA_DIR, 'config', 'category-weights.yaml'), 'utf8')),
);

function inventory(counts: Record<string, number>): AssetInventory {
  return AssetInventory.parse(
    Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
  );
}

/** A 120-person consultancy: laptops, Microsoft 365, nothing else. */
const saasOnly = inventory({
  windowsEndpoints: 110,
  macosEndpoints: 30,
  m365Seats: 140,
  otherCriticalSaasApps: 6,
  remoteUsers: 90,
  privilegedAccounts: 5,
});

/** A manufacturer running its own everything. */
const onPrem = inventory({
  windowsEndpoints: 260,
  windowsServers: 34,
  windowsDomainControllers: 3,
  linuxServers: 18,
  hypervisors: 6,
  fileServers: 4,
  databases: 9,
  firewalls: 6,
  vpnConcentrators: 2,
  switches: 40,
  routers: 6,
  publicWebApps: 3,
  privilegedAccounts: 22,
  serviceAccounts: 60,
});

/** A plant: a modest IT estate wrapped around a large control network. */
const otHeavy = inventory({
  windowsEndpoints: 90,
  windowsServers: 8,
  firewalls: 4,
  otIcsScadaDevices: 900,
  iotCctvPosDevices: 400,
  privilegedAccounts: 8,
});

describe('estate shape', () => {
  it('reads a laptops-and-Microsoft-365 company as SaaS-centric', () => {
    expect(computeInfrastructureProfile(saasOnly, weights).shape).toBe('saas_centric');
  });

  it('reads a company running its own servers and network as on-prem-centric', () => {
    expect(computeInfrastructureProfile(onPrem, weights).shape).toBe('on_prem_centric');
  });

  it('reads a large control network as OT-heavy', () => {
    expect(computeInfrastructureProfile(otHeavy, weights).shape).toBe('ot_heavy');
  });

  it('refuses to guess a shape with no inventory', () => {
    const profile = computeInfrastructureProfile(inventory({}), weights);
    expect(profile.shape).toBe('unknown');
    expect(profile.totalUnits).toBe(0);
    expect(profile.rationale.join(' ')).toContain('no infrastructure signal');
  });

  it('refuses to guess from endpoints and accounts alone', () => {
    // Laptops and users say nothing about where the computing happens.
    const profile = computeInfrastructureProfile(
      inventory({ windowsEndpoints: 50, privilegedAccounts: 4 }),
      weights,
    );
    expect(profile.shape).toBe('unknown');
  });

  it('shares sum to 1 across all surfaces', () => {
    for (const estate of [saasOnly, onPrem, otHeavy]) {
      const profile = computeInfrastructureProfile(estate, weights);
      const total = profile.surfaces.reduce((sum, surface) => sum + surface.share, 0);
      expect(total).toBeCloseTo(1, 3);
    }
  });
});

describe('applicability — the eliminations that matter', () => {
  it('never recommends network detection to a client with no network', () => {
    const relevance = computeCategoryRelevance(
      computeInfrastructureProfile(saasOnly, weights),
      weights,
    );
    const ndr = relevance.find((entry) => entry.category === 'ndr');
    expect(ndr?.applicable).toBe(false);
    expect(ndr?.weight).toBe(0);
    expect(ndr?.rationale.join(' ')).toContain('Not applicable');
  });

  it('never recommends a firewall to a client with nothing to put it in front of', () => {
    const relevance = computeCategoryRelevance(
      computeInfrastructureProfile(saasOnly, weights),
      weights,
    );
    expect(relevance.find((entry) => entry.category === 'ngfw')?.applicable).toBe(false);
  });

  it('keeps both applicable for an on-prem estate', () => {
    const relevance = computeCategoryRelevance(
      computeInfrastructureProfile(onPrem, weights),
      weights,
    );
    for (const category of ['ndr', 'ngfw'] as const) {
      expect(relevance.find((entry) => entry.category === category)?.applicable).toBe(true);
    }
  });

  it('rules nothing out when no inventory was captured', () => {
    // An absent inventory means "not asked", not "does not exist". Eliminating
    // on silence would hide categories the analyst never got to discuss.
    const relevance = computeCategoryRelevance(
      computeInfrastructureProfile(inventory({}), weights),
      weights,
    );
    expect(relevance.every((entry) => entry.applicable)).toBe(true);
    expect(relevance.every((entry) => entry.estateMultiplier === 1)).toBe(true);
  });
});

describe('the same inventory question, answered differently by estate', () => {
  it('puts identity and mail at the top for a SaaS company', () => {
    const ranked = rankCategories(
      computeCategoryRelevance(computeInfrastructureProfile(saasOnly, weights), weights),
    );
    const top = ranked.slice(0, 4).map((entry) => entry.category);
    expect(top).toContain('iam');
    expect(top).toContain('email_security');
  });

  it('ranks network detection above email for a plant, and the reverse for a SaaS company', () => {
    // The clearest statement of what this stage is for. Same catalog, same
    // weights, opposite orderings — driven only by what the client owns.
    const weightOf = (estate: AssetInventory, category: string): number =>
      computeCategoryRelevance(computeInfrastructureProfile(estate, weights), weights).find(
        (entry) => entry.category === category,
      )?.weight ?? 0;

    expect(weightOf(otHeavy, 'ndr')).toBeGreaterThan(weightOf(otHeavy, 'email_security'));
    expect(weightOf(saasOnly, 'email_security')).toBeGreaterThan(weightOf(saasOnly, 'ndr'));
  });

  it('values vulnerability management more where there is edge infrastructure to exploit', () => {
    // DBIR 2025: edge-device exploitation rose eightfold. An estate with
    // firewalls and VPNs should feel that; a SaaS estate should not.
    const vmWeight = (estate: AssetInventory): number =>
      computeCategoryRelevance(computeInfrastructureProfile(estate, weights), weights).find(
        (entry) => entry.category === 'vulnerability_management',
      )?.weight ?? 0;

    expect(vmWeight(onPrem)).toBeGreaterThan(vmWeight(saasOnly));
  });

  it('produces a materially different ranking for each estate', () => {
    const ranking = (estate: AssetInventory): string[] =>
      rankCategories(
        computeCategoryRelevance(computeInfrastructureProfile(estate, weights), weights),
      ).map((entry) => entry.category);

    expect(ranking(saasOnly)).not.toEqual(ranking(onPrem));
    expect(ranking(onPrem)).not.toEqual(ranking(otHeavy));
  });
});

describe('every number explains itself (hard rule 5)', () => {
  it('gives a rationale for every category, applicable or not', () => {
    const relevance = computeCategoryRelevance(
      computeInfrastructureProfile(onPrem, weights),
      weights,
    );
    for (const entry of relevance) {
      expect(entry.rationale.length, `${entry.category} has no rationale`).toBeGreaterThan(0);
    }
  });

  it('names the surfaces that moved a weight', () => {
    const relevance = computeCategoryRelevance(
      computeInfrastructureProfile(otHeavy, weights),
      weights,
    );
    const ndr = relevance.find((entry) => entry.category === 'ndr');
    expect(ndr?.rationale.join(' ')).toContain('ot_ics');
  });
});

describe('determinism', () => {
  it('gives an identical result for the same input twice', () => {
    const once = computeCategoryRelevance(computeInfrastructureProfile(onPrem, weights), weights);
    const twice = computeCategoryRelevance(computeInfrastructureProfile(onPrem, weights), weights);
    expect(once).toEqual(twice);
  });

  it('is unaffected by the order of keys in the inventory', () => {
    const forwards = inventory({ windowsServers: 10, firewalls: 3, m365Seats: 200 });
    const backwards = inventory({ m365Seats: 200, firewalls: 3, windowsServers: 10 });
    expect(computeInfrastructureProfile(forwards, weights)).toEqual(
      computeInfrastructureProfile(backwards, weights),
    );
  });

  it('returns every surface in declaration order, including absent ones', () => {
    const profile = computeInfrastructureProfile(saasOnly, weights);
    expect(profile.surfaces.map((surface) => surface.surface)).toEqual([
      ...InfrastructureSurface.options,
    ]);
  });
});
