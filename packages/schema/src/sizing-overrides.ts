// Per-scenario sizing overrides (PROJECT_SPEC §8.6).
//
// The sizing worksheet has to show "every assumption visible and editable". The
// coefficients themselves stay in data/config/sizing-assumptions.yaml, where
// they are argued with once for everybody; this is the layer where one analyst
// says "no, *these* firewalls are quieter than that" about one client, on a
// call, without editing the repo.
//
// An override is a claim about a client, so it is stored with the scenario. The
// defaults it replaces are never mutated.

import { z } from 'zod';

import { AssetClass } from './asset-inventory';

const epsShape = Object.fromEntries(
  AssetClass.options.map((assetClass) => [assetClass, z.number().nonnegative().max(100_000)]),
) as { [K in AssetClass]: z.ZodNumber };

export const SizingOverrides = z
  .object({
    /** Replaces the EPS coefficient for a class. Absent means "use the default". */
    eventsPerSecond: z.object(epsShape).partial().strict().default({}),
    averageEventBytes: z.number().positive().max(1_000_000).optional(),
    peakFactor: z.number().min(1).max(20).optional(),
    compressionRatio: z.number().min(0).max(0.95).optional(),
    /**
     * Replaces the *default* retention period, not the computed one.
     *
     * Compliance can still only lengthen it: an analyst who thinks 30 days is
     * enough does not thereby exempt a PCI client from requirement 10's 365.
     */
    retentionDays: z.number().int().positive().max(3650).optional(),
  })
  .strict();
export type SizingOverrides = z.infer<typeof SizingOverrides>;

/** No overrides at all — the committed assumptions, unmodified. */
export const NO_SIZING_OVERRIDES: SizingOverrides = { eventsPerSecond: {} };
