// What the margin on a managed engagement actually is, measured against the
// committed presets rather than asserted about them.
//
// This file exists because a claim in the code was wrong for a phase and a
// half. The margin came out at 92-97% across the six presets, and the reason
// given, in `attribution.ts`, in `docs/STATUS.md` and in a unit test that
// pinned the wording, was that the cost side excluded the monitoring rota: an
// upper bound overstated "by an order of magnitude".
//
// The rota is now costed. The difference it makes is one to two percentage
// points, because an MSSP seat is spread across a published 50 to 100 clients
// and a reference client therefore consumes about 0.065 FTE of one. The
// explanation was wrong, and the margin it was explaining is still there.
//
// So these assertions are deliberately shaped as evidence rather than as a
// target. They pin that the rota is small, that the margin did not move, and
// that the figure says which of those two things is the cause. If a later
// change makes the margin plausible, this file should go red and be rewritten
// with the new measurement, not relaxed.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPresets } from '@stackfit/data';
import { describe, expect, it } from 'vitest';

import { runScenario } from './scenarios/harness';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

// A preset carries no `orgName`; the analyst types one during intake.
const runs = loadPresets(DATA_DIR).map((preset) => {
  const profile = { ...preset.profile, orgName: preset.name };
  return {
    id: preset.id,
    profile,
    attribution: runScenario(profile, preset.inventory).recommended.attribution,
  };
});

const managed = runs.filter((run) => run.profile.deliveryModel !== 'client_operated');
const share = (part: { amountMinor: number }, whole: { amountMinor: number }) =>
  Number(whole.amountMinor) === 0 ? 0 : Number(part.amountMinor) / Number(whole.amountMinor);

describe('what a managed engagement costs us', () => {
  it('has managed presets to measure, so this file cannot pass by measuring nothing', () => {
    expect(managed.length).toBeGreaterThanOrEqual(4);
  });

  it('splits the run cost into administration and the rota, with nothing left over', () => {
    for (const { id, attribution } of runs) {
      expect(
        Number(attribution.providerRunAnnual.amountMinor),
        `${id} run cost is its two halves`,
      ).toBe(
        Number(attribution.providerAdministrationAnnual.amountMinor) +
          Number(attribution.providerMonitoringAnnual.amountMinor),
      );
    }
  });

  /**
   * The finding. The rota is real, it is now charged, and it is nowhere near
   * large enough to be the reason the margin looks the way it does.
   */
  it('costs the rota, and the rota is under two points of the fee', () => {
    for (const { id, attribution } of managed) {
      const rotaShare = share(attribution.providerMonitoringAnnual, attribution.providerFeeAnnual);

      expect(attribution.providerMonitoringFte, `${id} consumes a rota`).toBeGreaterThan(0);
      expect(Number(attribution.providerMonitoringAnnual.amountMinor)).toBeGreaterThan(0);
      expect(rotaShare, `${id} rota as a share of fee`).toBeLessThan(0.02);
    }
  });

  /**
   * The margin did not move, and saying so is the point of the file. Costing
   * the rota was correct and it fixed nothing, so nothing downstream may start
   * treating this figure as a real margin.
   */
  it('leaves the margin implausibly high, because the cause is elsewhere', () => {
    for (const { id, attribution } of managed) {
      expect(attribution.providerMarginRate, `${id} margin rate`).not.toBeNull();
      expect(attribution.providerMarginRate ?? 0, `${id} margin rate`).toBeGreaterThan(0.75);
    }
  });

  it('names the two rate cards as the cause, on every managed preset', () => {
    for (const { id, attribution } of managed) {
      const blob = attribution.providerRationale.join(' ');

      expect(blob, `${id} states the cause`).toMatch(
        /two rate cards that were not written about the same market/,
      );
      expect(blob, `${id} shows the rota's working`).toMatch(/round-the-clock coverage/);
      expect(blob, `${id} must not revive the disproved reason`).not.toMatch(
        /excludes the monitoring rota/,
      );
    }
  });

  /**
   * No engagement, no rota. The client-operated preset is the one that would
   * quietly acquire a cost we do not carry, and a zero margin rate would read
   * as a break-even engagement rather than as no engagement at all.
   */
  it('charges no rota and reports no margin where we operate nothing', () => {
    const selfRun = runs.filter((run) => run.profile.deliveryModel === 'client_operated');
    expect(selfRun.length).toBeGreaterThan(0);

    for (const { id, attribution } of selfRun) {
      expect(Number(attribution.providerMonitoringAnnual.amountMinor), id).toBe(0);
      expect(attribution.providerMonitoringFte, id).toBe(0);
      expect(attribution.providerMarginRate, id).toBeNull();
    }
  });

  /**
   * Our own figures must not reach the list the results page turns toward the
   * client. Already guarded in the unit tests; repeated here against the real
   * presets because the new sentences are the ones most likely to be written
   * into the wrong list.
   */
  it('keeps the rota and the margin out of the client-facing rationale', () => {
    for (const { id, attribution } of runs) {
      const blob = attribution.rationale.join(' ');

      expect(blob, `${id} client-facing`).not.toMatch(/margin/i);
      expect(blob, `${id} client-facing`).not.toMatch(/charge-out/i);
      expect(blob, `${id} client-facing`).not.toMatch(/costs us/i);
      expect(blob, `${id} client-facing`).not.toMatch(/round-the-clock/i);
    }
  });
});
