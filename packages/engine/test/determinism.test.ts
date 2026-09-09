// PROJECT_SPEC §12.6 and CONTRIBUTING.md: same input twice → identical output.
//
// This test must stay green for the life of the project. It grows a case per
// pipeline stage as each one lands; today that is sizing.

import type { AssetInventory } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { computeSizing } from '../src/index.js';
import { buildClientProfile, buildSizingAssumptions } from './fixtures.js';

const assumptions = buildSizingAssumptions({
  windowsEndpoints: { eventsPerSecond: 0.2, role: 'endpoint', monitored: true },
  windowsServers: { eventsPerSecond: 2, role: 'server', monitored: true },
  windowsDomainControllers: { eventsPerSecond: 25, role: 'server', monitored: true },
  firewalls: { eventsPerSecond: 100, role: 'network', monitored: true },
  iotCctvPosDevices: { eventsPerSecond: 0.3, role: 'ot', monitored: true },
  m365Seats: { eventsPerSecond: 0.05, role: 'saas_seat', monitored: false },
});

// Deliberately awkward counts, so any order-dependence in the floating-point
// sum would show up rather than cancelling out on round numbers.
const inventory: AssetInventory = {
  windowsEndpoints: { count: 437 },
  windowsServers: { count: 23 },
  windowsDomainControllers: { count: 3 },
  firewalls: { count: 7 },
  iotCctvPosDevices: { count: 191 },
  m365Seats: { count: 463 },
  networkVendors: ['cisco', 'fortinet'],
};

const profile = buildClientProfile({ compliance: ['pci-dss-4.0'], itStaffCount: 7 });

describe('determinism', () => {
  it('produces a byte-identical sizing result for the same input', () => {
    const first = computeSizing(inventory, profile, assumptions);
    const second = computeSizing(inventory, profile, assumptions);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('produces the same result from a structurally identical but distinct input', () => {
    // Guards against the result depending on object identity or on some cached
    // state hanging off the input rather than on its values.
    const first = computeSizing(inventory, profile, assumptions);
    const second = computeSizing(
      structuredClone(inventory),
      structuredClone(profile),
      structuredClone(assumptions),
    );

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('does not mutate its inputs', () => {
    const inventoryBefore = JSON.stringify(inventory);
    const profileBefore = JSON.stringify(profile);
    const assumptionsBefore = JSON.stringify(assumptions);

    computeSizing(inventory, profile, assumptions);

    expect(JSON.stringify(inventory)).toBe(inventoryBefore);
    expect(JSON.stringify(profile)).toBe(profileBefore);
    expect(JSON.stringify(assumptions)).toBe(assumptionsBefore);
  });

  it('orders the per-class worksheet by AssetClass declaration, not by insertion', () => {
    // Two inventories with the same classes listed in a different order must
    // produce the same worksheet order, or the output is input-order dependent.
    const reordered: AssetInventory = {
      networkVendors: ['cisco', 'fortinet'],
      m365Seats: { count: 463 },
      iotCctvPosDevices: { count: 191 },
      firewalls: { count: 7 },
      windowsDomainControllers: { count: 3 },
      windowsServers: { count: 23 },
      windowsEndpoints: { count: 437 },
    };

    const fromOriginal = computeSizing(inventory, profile, assumptions);
    const fromReordered = computeSizing(reordered, profile, assumptions);

    expect(JSON.stringify(fromReordered)).toBe(JSON.stringify(fromOriginal));
  });
});
