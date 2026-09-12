// Stage 1 of the pipeline: turn an asset inventory into ingest volume, storage
// and a scale class (PROJECT_SPEC §7.1).
//
// This is the number everything downstream leans on, SIEM pricing is driven by
// GB/day more than by anything else, so every derived figure carries the
// arithmetic that produced it, and the per-class breakdown is returned whole so
// the UI can render the sizing worksheet (§8.6) without recomputing anything.
//
// Pure: no fs, no clock, no randomness. The assumptions are handed in already
// parsed, because the engine may not read data/config itself.

import type {
  AssetClass,
  AssetInventory,
  ClientProfile,
  ScaleClass,
  SizingAssumptions,
  SizingOverrides,
} from '@stackfit/schema';
import { AssetClass as AssetClassEnum } from '@stackfit/schema';
import { plural } from './labels';

const SECONDS_PER_DAY = 86_400;

/*
 * Decimal, both of them, and that is a correction.
 *
 * GB has always been 1e9 here, which is right: it is the unit every SIEM
 * vendor prices ingest in and every storage vendor sells capacity in. TB was
 * 1024 GB, which is neither. A decimal gigabyte divided by 1024 produces a
 * figure that is 2.3% under a real TB and 7.4% over a real TiB, so the storage
 * line was quoted in a unit that does not exist.
 *
 * The error is small next to the coefficient it is built on (`averageEventBytes`
 * is a 300 to 800 byte range, a factor of 2.7), which is exactly why it
 * survived: it was never large enough to look wrong. It is still a client
 * buying an array against a number in an invented unit.
 *
 * PROJECT_SPEC §7.1 wrote the formula with /1024 and the spec line has been
 * corrected with it, because a spec and an implementation that disagree is a
 * worse outcome than either one alone.
 */
const BYTES_PER_GB = 1e9;
const GB_PER_TB = 1000;

/** One row of the sizing worksheet. */
export interface AssetClassSizing {
  readonly assetClass: AssetClass;
  readonly count: number;
  /** Coefficient used, before the verbosity multiplier. */
  readonly eventsPerSecondPerAsset: number;
  /** count × coefficient × verbosity. */
  readonly eventsPerSecond: number;
}

export interface SizingResult {
  /** Σ over all asset classes, after the verbosity multiplier. */
  readonly epsTotal: number;
  readonly gbPerDay: number;
  /** GB/day a licence must cover, i.e. gbPerDay × peakFactor. */
  readonly licensedGbPerDay: number;
  readonly storageTb: number;
  readonly retentionDays: number;

  readonly endpointCount: number;
  readonly serverCount: number;
  /** Assets a tool would be deployed to or would monitor. Excludes user seats. */
  readonly monitoredAssetCount: number;
  readonly privilegedAccountCount: number;
  /** True when privilegedAccountCount was estimated rather than captured. */
  readonly privilegedAccountCountEstimated: boolean;
  readonly userSeatCount: number;

  readonly scaleClass: ScaleClass;
  /**
   * Whether any asset count was captured at all.
   *
   * Not the same question as "is the estate small", and the difference is the
   * whole reason this field exists. `scaleClass` has to return one of four
   * bands because products declare their support in those bands, so an empty
   * inventory comes back as `small`: the same answer a real 250-asset business
   * gets. The sizing rationale has always said so in prose ("an empty
   * inventory, not a small environment") and nothing downstream could read
   * prose, so every later stage treated a blank intake as a client.
   *
   * A blank intake is not a client with nothing to protect. It is an intake
   * nobody has filled in yet, and every figure derived from it is arithmetic on
   * zero rather than a finding.
   */
  readonly estateCaptured: boolean;
  readonly verbosityFactor: number;
  /** Every class with a non-zero count, in AssetClass declaration order. */
  readonly perAssetClass: readonly AssetClassSizing[];
  /** Hard rule 5: a number with no explanation does not ship. */
  readonly rationale: readonly string[];
}

/**
 * The committed assumptions with one scenario's overrides applied (§8.6).
 *
 * Pure, and non-destructive: the defaults are copied, never mutated, so two
 * scenarios sized in the same process cannot leak an override into each other.
 *
 * `retentionDays` replaces the *default* period only. Compliance still lengthens
 * it afterwards. An analyst deciding 30 days is enough does not exempt a PCI
 * client from requirement 10, and the rule that compliance can only lengthen
 * retention has to survive an override or it was never a rule.
 */
export function applySizingOverrides(
  assumptions: SizingAssumptions,
  overrides: SizingOverrides,
): SizingAssumptions {
  const assetClasses = { ...assumptions.assetClasses };
  // Tolerant of a bare `{}`: overrides arrive as stored JSON, and a scenario
  // written before this field existed has no `eventsPerSecond` at all.
  for (const [assetClass, eventsPerSecond] of Object.entries(overrides.eventsPerSecond ?? {})) {
    const base = assetClasses[assetClass as AssetClass];
    if (base === undefined || eventsPerSecond === undefined) continue;
    assetClasses[assetClass as AssetClass] = {
      ...base,
      eventsPerSecond,
      basis: `Analyst override for this client (default ${base.eventsPerSecond}: ${base.basis})`,
    };
  }

  return {
    ...assumptions,
    assetClasses,
    averageEventBytes: overrides.averageEventBytes ?? assumptions.averageEventBytes,
    peakFactor: overrides.peakFactor ?? assumptions.peakFactor,
    compressionRatio: overrides.compressionRatio ?? assumptions.compressionRatio,
    retention: {
      ...assumptions.retention,
      defaultDays: overrides.retentionDays ?? assumptions.retention.defaultDays,
    },
  };
}

/**
 * Rounds to a fixed number of decimal places. Sizing figures are reported, not
 * summed further, so rounding at the boundary keeps output stable and readable
 * without risking drift in the arithmetic above it.
 */
function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

/** Formats a number for a rationale string without locale dependence. */
function fmt(value: number, decimalPlaces = 2): string {
  return round(value, decimalPlaces).toString();
}

function resolveVerbosityFactor(
  inventory: AssetInventory,
  assumptions: SizingAssumptions,
): { factor: number; profile: 'quiet' | 'default' | 'chatty' } {
  const profile = inventory.verbosityOverride ?? 'default';
  return { factor: assumptions.verbosityFactors[profile], profile };
}

/**
 * Longest retention any selected framework demands, falling back to the
 * configured default. Compliance lengthens retention; it never shortens it.
 */
function resolveRetentionDays(
  profile: ClientProfile,
  assumptions: SizingAssumptions,
): { days: number; drivenBy: string | undefined } {
  let days = assumptions.retention.defaultDays;
  let drivenBy: string | undefined;

  for (const framework of profile.compliance) {
    const required = assumptions.retention.byFramework[framework];
    if (required !== undefined && required > days) {
      days = required;
      drivenBy = framework;
    }
  }

  return { days, drivenBy };
}

function resolveScaleClass(
  monitoredAssetCount: number,
  assumptions: SizingAssumptions,
): ScaleClass {
  const { smallMax, midMax, largeMax } = assumptions.scaleClassThresholds;
  if (monitoredAssetCount <= smallMax) return 'small';
  if (monitoredAssetCount <= midMax) return 'mid';
  if (monitoredAssetCount <= largeMax) return 'large';
  return 'enterprise';
}

/**
 * Derives ingest volume, storage and scale class from an inventory.
 *
 * Deterministic: asset classes are always walked in `AssetClass` declaration
 * order, so the floating-point sum is associative in practice. The same input
 * produces a byte-identical result.
 */
export function computeSizing(
  inventory: AssetInventory,
  profile: ClientProfile,
  assumptions: SizingAssumptions,
): SizingResult {
  const { factor: verbosityFactor, profile: verbosityProfile } = resolveVerbosityFactor(
    inventory,
    assumptions,
  );

  const perAssetClass: AssetClassSizing[] = [];
  let epsTotal = 0;
  let endpointCount = 0;
  let serverCount = 0;
  let monitoredAssetCount = 0;
  let userSeatCount = 0;

  for (const assetClass of AssetClassEnum.options) {
    const line = inventory[assetClass];
    const count = line?.count ?? 0;
    if (count === 0) continue;

    const assumption = assumptions.assetClasses[assetClass];
    const eventsPerSecond = count * assumption.eventsPerSecond * verbosityFactor;

    epsTotal += eventsPerSecond;
    if (assumption.role === 'endpoint') endpointCount += count;
    if (assumption.role === 'server') serverCount += count;
    if (assumption.monitored) monitoredAssetCount += count;
    if (assumption.role === 'saas_seat') userSeatCount += count;

    perAssetClass.push({
      assetClass,
      count,
      eventsPerSecondPerAsset: assumption.eventsPerSecond,
      eventsPerSecond: round(eventsPerSecond, 4),
    });
  }

  const gbPerDay = (epsTotal * SECONDS_PER_DAY * assumptions.averageEventBytes) / BYTES_PER_GB;
  const licensedGbPerDay = gbPerDay * assumptions.peakFactor;

  const { days: retentionDays, drivenBy: retentionDrivenBy } = resolveRetentionDays(
    profile,
    assumptions,
  );
  const storageTb = (gbPerDay * retentionDays * (1 - assumptions.compressionRatio)) / GB_PER_TB;

  // Privileged accounts drive PAM licensing, and analysts rarely capture them
  // on a first call. Estimating from IT headcount is defensible; pretending we
  // measured it is not, so the estimate is flagged in the result.
  const capturedPrivilegedAccounts = inventory.privilegedAccounts?.count;
  const privilegedAccountCountEstimated = capturedPrivilegedAccounts === undefined;
  const privilegedAccountCount = privilegedAccountCountEstimated
    ? Math.ceil(profile.itStaffCount * assumptions.privilegedAccountsPerItStaff)
    : capturedPrivilegedAccounts;

  const scaleClass = resolveScaleClass(monitoredAssetCount, assumptions);

  const rationale: string[] = [
    `${fmt(epsTotal)} EPS across ${plural(perAssetClass.length, 'asset class', 'asset classes')} at ${verbosityProfile} verbosity (×${assumptions.verbosityFactors[verbosityProfile]}).`,
    `${fmt(gbPerDay, 3)} GB/day = ${fmt(epsTotal)} EPS × 86,400 s × ${assumptions.averageEventBytes} bytes/event.`,
    `${fmt(licensedGbPerDay, 3)} GB/day licensed, applying a peak factor of ${assumptions.peakFactor} to the daily average.`,
    `${fmt(storageTb, 3)} TB at rest = ${fmt(gbPerDay, 3)} GB/day × ${retentionDays} days × ${fmt(1 - assumptions.compressionRatio, 2)} after compression.`,
    retentionDrivenBy === undefined
      ? `Retention of ${retentionDays} days is the configured default; no selected framework requires longer.`
      : `Retention of ${retentionDays} days is required by ${retentionDrivenBy}, longer than the ${assumptions.retention.defaultDays}-day default.`,
    `${plural(monitoredAssetCount, 'monitored asset')} puts this environment in the ${scaleClass} scale class.`,
    privilegedAccountCountEstimated
      ? `Privileged accounts not captured; estimated ${privilegedAccountCount} from ${profile.itStaffCount} IT staff × ${assumptions.privilegedAccountsPerItStaff}. Confirm before sizing PAM.`
      : `${plural(privilegedAccountCount, 'privileged account')} taken from the inventory as captured.`,
  ];

  const estateCaptured = perAssetClass.length > 0;
  if (!estateCaptured) {
    rationale.push(
      '⚠ No asset counts were captured, so every derived figure is zero. This is an empty ' +
        'inventory, not a small environment, and nothing below it is a recommendation yet.',
    );
  }

  return {
    estateCaptured,
    epsTotal: round(epsTotal, 2),
    gbPerDay: round(gbPerDay, 3),
    licensedGbPerDay: round(licensedGbPerDay, 3),
    storageTb: round(storageTb, 3),
    retentionDays,
    endpointCount,
    serverCount,
    monitoredAssetCount,
    privilegedAccountCount,
    privilegedAccountCountEstimated,
    userSeatCount,
    scaleClass,
    verbosityFactor,
    perAssetClass,
    rationale,
  };
}
