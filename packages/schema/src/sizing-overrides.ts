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

    /*
     * Measured ingest, which beats every coefficient in this file.
     *
     * The per-asset EPS figures are the standard first-pass method and every
     * vendor calculator uses them, but the published values for one device
     * class disagree by more than an order of magnitude: a Windows workstation
     * is quoted at 1, 2, 5 and 10 to 50 EPS by four different sources, and a
     * domain controller at 100 to 500. They are not disagreeing about the
     * device. They are disagreeing about audit policy and about what an estate
     * actually forwards, which is a fact about the client's configuration and
     * not about the hardware.
     *
     * So a client who knows their own number outranks any of it. An
     * organisation running a SIEM today knows its GB/day, because that is what
     * the licence bills on, and an organisation with a collector knows its EPS.
     * Either one pins the chain at that point and everything downstream follows
     * from it.
     *
     * Both are optional and independent. `measuredEps` replaces the derived
     * EPS; `measuredGbPerDay` replaces the derived volume, whatever the EPS
     * says. Giving both is legitimate: a client can measure their event rate
     * and their volume separately, and the ratio between them is their real
     * average event size rather than this file's assumption.
     */
    measuredEps: z.number().nonnegative().max(10_000_000).optional(),
    measuredGbPerDay: z.number().nonnegative().max(1_000_000).optional(),
  })
  .strict();
export type SizingOverrides = z.infer<typeof SizingOverrides>;

/** No overrides at all. The committed assumptions, unmodified. */
export const NO_SIZING_OVERRIDES: SizingOverrides = { eventsPerSecond: {} };
