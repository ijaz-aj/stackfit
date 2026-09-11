// The intake presets (PROJECT_SPEC §5.2), against the committed data.
//
// A preset is the first thing an analyst touches and the last thing anyone
// thinks to check. These assertions exist because a preset that sizes to
// nothing, or names a framework the library does not hold, fails in front of a
// client rather than in a test.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFrameworks, loadPresets, loadSizingAssumptions } from '@stackfit/data';
import { computeSizing } from '@stackfit/engine';
import { describe, expect, it } from 'vitest';

import { inventoryOf, profileOf, runScenario } from './scenarios/harness.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const presets = loadPresets(DATA_DIR);
const frameworks = loadFrameworks(DATA_DIR);
const sizingAssumptions = loadSizingAssumptions(DATA_DIR);

describe('the committed intake presets', () => {
  it('ships enough shapes to cover the paths the engine treats differently', () => {
    expect(presets.map((preset) => preset.id)).toMatchInlineSnapshot(`
      [
        "retail-chain-40-stores",
        "saas-scale-up-120",
        "manufacturer-two-plants",
        "hospital-300-beds",
        "bank-60-branches",
        "professional-services-45",
      ]
    `);
  });

  it('names only frameworks the library actually holds', () => {
    for (const preset of presets) {
      for (const id of preset.profile.compliance) {
        expect(frameworks.has(id), `${preset.id} selects "${id}"`).toBe(true);
      }
    }
  });

  it('gives every preset an estate that sizes to something', () => {
    // A preset whose inventory sizes to zero ingest would leave the wizard's
    // live readout blank, which reads as a broken tool rather than an empty
    // form.
    for (const preset of presets) {
      const sizing = computeSizing(
        preset.inventory,
        { ...preset.profile, orgName: preset.name },
        sizingAssumptions,
      );
      expect(sizing.epsTotal, preset.id).toBeGreaterThan(0);
      expect(sizing.gbPerDay, preset.id).toBeGreaterThan(0);
      expect(sizing.monitoredAssetCount, preset.id).toBeGreaterThan(0);
    }
  });

  it('states a basis for every set of counts', () => {
    // Hard rule 5's spirit: a number with no explanation does not ship. These
    // are invented estates, and the arithmetic behind them has to be visible.
    for (const preset of presets) {
      expect(preset.basis.length, preset.id).toBeGreaterThan(60);
    }
  });

  it('sizes each preset into a plausible scale class', () => {
    expect(
      presets.map((preset) => {
        const sizing = computeSizing(
          preset.inventory,
          { ...preset.profile, orgName: preset.name },
          sizingAssumptions,
        );
        return (
          `${preset.id} | ${sizing.monitoredAssetCount} assets | ${sizing.scaleClass} | ` +
          `${sizing.epsTotal.toFixed(0)} EPS | ${sizing.gbPerDay.toFixed(1)} GB/day | ` +
          `${sizing.retentionDays}d retention`
        );
      }),
    ).toMatchInlineSnapshot(`
      [
        "retail-chain-40-stores | 1017 assets | large | 4780 EPS | 206.5 GB/day | 365d retention",
        "saas-scale-up-120 | 345 assets | mid | 347 EPS | 15.0 GB/day | 90d retention",
        "manufacturer-two-plants | 1957 assets | large | 2121 EPS | 91.6 GB/day | 90d retention",
        "hospital-300-beds | 3465 assets | large | 2786 EPS | 120.3 GB/day | 90d retention",
        "bank-60-branches | 3382 assets | large | 9167 EPS | 396.0 GB/day | 365d retention",
        "professional-services-45 | 57 assets | small | 150 EPS | 6.5 GB/day | 90d retention",
      ]
    `);
  });

  it('runs end to end through the engine without a scope question going unanswered', () => {
    // The whole point of a preset is that it produces a result immediately.
    // Anything it cannot fund must be a category the catalog does not stock —
    // never a silent empty bundle.
    for (const preset of presets) {
      const result = runScenario(
        { ...preset.profile, orgName: preset.name },
        preset.inventory,
      );
      expect(result.recommended.selections.length, preset.id).toBeGreaterThan(0);
      expect(result.recommended.rationale.length, preset.id).toBeGreaterThan(0);
    }
  });

  it('keeps every budget cap in the scenario currency', () => {
    // The Budget schema enforces this, and it is asserted here because the
    // wizard lets an analyst change currency after typing a cap, which is
    // exactly where the two would drift apart.
    for (const preset of presets) {
      const { budget } = preset.profile;
      for (const cap of [budget.annualCap, budget.oneTimeCap]) {
        if (cap !== null) expect(cap.currency, preset.id).toBe(budget.currency);
      }
    }
  });
});

describe('a preset is a starting point, not an answer', () => {
  it('produces a different stack once the analyst edits the estate', () => {
    // If editing the inventory did not change the recommendation, the preset
    // would be deciding the outcome rather than seeding it.
    const preset = presets.find((entry) => entry.id === 'professional-services-45');
    if (preset === undefined) throw new Error('expected the small-firm preset');

    const asShipped = runScenario({ ...preset.profile, orgName: 'X' }, preset.inventory);
    const withAnEstate = runScenario(
      { ...preset.profile, orgName: 'X' },
      inventoryOf({ windowsServers: 60, windowsEndpoints: 400, firewalls: 6, databases: 20 }),
    );

    expect(asShipped.sizing.scaleClass).not.toBe(withAnEstate.sizing.scaleClass);
  });

  it('leaves the client name to the analyst', () => {
    // `orgName` is the one field a preset must not fill: it is the only value
    // guaranteed to be wrong.
    for (const preset of presets) {
      expect(Object.keys(preset.profile)).not.toContain('orgName');
    }
  });

  it('is not just the default profile with a new name', () => {
    const defaults = profileOf();
    const differing = presets.filter(
      (preset) =>
        preset.profile.industry !== defaults.industry ||
        preset.profile.employeeCount !== defaults.employeeCount ||
        preset.profile.compliance.length !== defaults.compliance.length,
    );
    expect(differing).toHaveLength(presets.length);
  });
});
