// Sizing assumptions (PROJECT_SPEC §7.1). The coefficients that turn an asset
// inventory into EPS, GB/day and storage.
//
// These live in data/config/sizing-assumptions.yaml (hard rule 6) and are
// tunable from the UI's advanced-sizing panel, because they will be wrong for
// some clients and the analyst needs to override them. The engine holds none of
// these numbers; it is handed a parsed copy.

import { z } from 'zod';

import { AssetClass } from './asset-inventory';
import { FrameworkId } from './enums';
import { IsoDate, Source } from './pricing';

/**
 * What an asset class counts as when deriving headline figures. `endpoint` and
 * `server` drive per-endpoint and per-node licensing; `identity` and
 * `saas_seat` drive per-user licensing and are deliberately not "assets".
 */
export const AssetRole = z.enum([
  'endpoint',
  'server',
  'network',
  'data',
  'application',
  'ot',
  'cloud',
  'saas_seat',
  'identity',
]);
export type AssetRole = z.infer<typeof AssetRole>;

export const AssetClassAssumption = z
  .object({
    /**
     * Events per second emitted by one asset of this class at default
     * verbosity. The single most consequential number in the tool.
     */
    eventsPerSecond: z.number().nonnegative(),
    role: AssetRole,
    /**
     * Whether this class counts toward `monitoredAssetCount`, which drives
     * scale class and per-asset ops burden. User seats and accounts do not.
     */
    monitored: z.boolean(),
    /** Where this coefficient came from. Required: §7.1 asks for it explicitly. */
    basis: z.string().min(1),
  })
  .strict();
export type AssetClassAssumption = z.infer<typeof AssetClassAssumption>;

const assetClassAssumptionShape = Object.fromEntries(
  AssetClass.options.map((assetClass) => [assetClass, AssetClassAssumption]),
) as { [K in AssetClass]: typeof AssetClassAssumption };

/**
 * Every asset class needs a coefficient. No partial. Adding a class to
 * AssetClass without adding its coefficient here must fail validation rather
 * than silently size that class at zero.
 */
export const AssetClassAssumptions = z.object(assetClassAssumptionShape).strict();
export type AssetClassAssumptions = z.infer<typeof AssetClassAssumptions>;

const frameworkRetentionShape = Object.fromEntries(
  FrameworkId.options.map((id) => [id, z.number().int().positive()]),
) as { [K in FrameworkId]: z.ZodNumber };

export const RetentionAssumptions = z
  .object({
    defaultDays: z.number().int().positive(),
    /**
     * Minimum retention a framework imposes, for the frameworks that impose
     * one. The longest applicable value wins; PCI DSS 4.0 requirement 10 is
     * the usual reason this is not the default.
     */
    byFramework: z.object(frameworkRetentionShape).partial().strict().default({}),
  })
  .strict();
export type RetentionAssumptions = z.infer<typeof RetentionAssumptions>;

/** Inclusive upper bounds on monitored assets. Above `largeMax` is enterprise. */
export const ScaleClassThresholds = z
  .object({
    smallMax: z.number().int().positive(),
    midMax: z.number().int().positive(),
    largeMax: z.number().int().positive(),
  })
  .strict()
  .superRefine((thresholds, ctx) => {
    if (thresholds.midMax <= thresholds.smallMax || thresholds.largeMax <= thresholds.midMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scale class thresholds must increase: smallMax < midMax < largeMax',
      });
    }
  });
export type ScaleClassThresholds = z.infer<typeof ScaleClassThresholds>;

export const SizingAssumptions = z
  .object({
    asOf: IsoDate,
    assetClasses: AssetClassAssumptions,
    /** Mean bytes on the wire per event, before compression. */
    averageEventBytes: z.number().positive(),
    /** Multiplier from average EPS to the peak a licence must cover. */
    peakFactor: z.number().min(1),
    /** Fraction saved by compression at rest, 0–1. 0.5 means half the size. */
    compressionRatio: z.number().min(0).max(0.95),
    /** Multiplier applied to every EPS coefficient, by log-verbosity profile. */
    verbosityFactors: z
      .object({
        quiet: z.number().positive(),
        default: z.number().positive(),
        chatty: z.number().positive(),
      })
      .strict(),
    /** Used to estimate privileged accounts when the analyst did not capture them. */
    privilegedAccountsPerItStaff: z.number().nonnegative(),
    retention: RetentionAssumptions,
    scaleClassThresholds: ScaleClassThresholds,
    sources: z.array(Source).default([]),
  })
  .strict();
export type SizingAssumptions = z.infer<typeof SizingAssumptions>;
