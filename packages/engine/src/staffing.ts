// How many people it takes to run a client's stack, and the working behind it.
//
// This is the number a client challenges in the room, so every function here
// returns its own arithmetic alongside its answer rather than a bare figure
// with prose written about it somewhere else. If the two can drift apart, they
// will, and the one on the slide is the one that gets quoted back.
//
// Two questions, kept apart. Conflating them is the easiest way in this product
// to be wrong by an order of magnitude, and it is a mistake with a direction:
// it always understates.
//
//   ADMINISTRATION. Deploy, tune, patch, upgrade, maintain. Scales with the
//   estate, sublinearly. A fraction of an FTE per tool.
//
//   MONITORING. Watching what the tools produce, around the clock. Scales with
//   shift coverage, not with the estate. Larger by an order of magnitude, and
//   on a managed engagement it is the thing being sold.
//
// Pure: no fs, no clock, no randomness.

import type { DeploymentMode, Product, StaffingModel } from '@stackfit/schema';

/** One line of arithmetic, as it should be read out. */
export interface StaffingTerm {
  readonly label: string;
  readonly value: number;
  readonly explanation: string;
}

export interface AdministrationFte {
  readonly fte: number;
  /** The figure before the deployment-mode multiplier, for comparison. */
  readonly beforeDeploymentMode: number;
  readonly deploymentMode: DeploymentMode;
  readonly deploymentMultiplier: number;
  readonly terms: readonly StaffingTerm[];
  readonly workingOut: string;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Effort to administer one product for one client.
 *
 *   fte = (base + perThousand × (assets / reference) ^ exponent) × modeMultiplier
 *
 * The exponent is what changed. It used to be absent, which is the same as 1,
 * and a linear per-asset term asked for 15.5 FTE to administer a single SIEM
 * across 50,000 assets. Published practice is consistent that administration
 * does not scale linearly, because automation, central policy and template
 * inheritance mean the ten-thousandth endpoint is far cheaper to bring under
 * management than the hundredth.
 *
 * Anchored so a reference-sized estate is unchanged: at `referenceAssets` the
 * scale factor is exactly 1, whatever the exponent, so every `opsBurden`
 * coefficient in the catalog still means what its author intended.
 */
export function administrationFte(
  product: Product,
  monitoredAssetCount: number,
  deploymentMode: DeploymentMode,
  model: StaffingModel,
): AdministrationFte {
  const { scaleExponent, referenceAssets, byDeploymentMode } = model.administration;
  const { baseFte, ftePerThousandAssets } = product.opsBurden;

  /*
   * Zero assets is a real input: `estateCaptured` false means a blank intake,
   * and `0 ** 0.75` is 0, which is correct here. The base term still stands,
   * because a tool nobody has pointed at anything still has to be stood up and
   * kept running.
   */
  const scaleFactor = monitoredAssetCount <= 0 ? 0 : (monitoredAssetCount / referenceAssets) ** scaleExponent;
  const variable = ftePerThousandAssets * scaleFactor;
  const beforeDeploymentMode = baseFte + variable;

  const modeEntry = byDeploymentMode.find((entry) => entry.mode === deploymentMode);
  // The schema requires every mode, so a miss means config and enum diverged.
  // Falling back to 1 is the on-premises answer, which is the conservative one.
  const deploymentMultiplier = modeEntry?.multiplier ?? 1;
  const fte = beforeDeploymentMode * deploymentMultiplier;

  const terms: StaffingTerm[] = [
    {
      label: 'Base effort',
      value: baseFte,
      explanation: `${baseFte} FTE to run ${product.name} at all, before any estate scaling.`,
    },
    {
      label: 'Estate scaling',
      value: round(variable, 3),
      explanation:
        `${ftePerThousandAssets} FTE per ${referenceAssets.toLocaleString()} assets, scaled by ` +
        `(${monitoredAssetCount.toLocaleString()} / ${referenceAssets.toLocaleString()}) ^ ${scaleExponent} = ` +
        `${round(scaleFactor, 3)}. The exponent is below 1 because administration does not scale ` +
        'linearly: automation and central policy make the ten-thousandth endpoint far cheaper ' +
        'to bring under management than the hundredth.',
    },
    {
      label: 'Delivery mode',
      value: deploymentMultiplier,
      explanation:
        modeEntry?.basis ??
        'No multiplier configured for this mode; treated as on-premises, which is the dearer reading.',
    },
  ];

  const workingOut =
    `${round(fte, 2)} FTE = (${baseFte} base + ${ftePerThousandAssets} per ` +
    `${referenceAssets.toLocaleString()} assets × ${round(scaleFactor, 3)}) × ${deploymentMultiplier} ` +
    `for ${deploymentMode.replace('_', '-')} delivery. This is the effort to *administer* the tool: ` +
    'deploy, tune, patch, upgrade. It is not the effort to monitor what it produces, which is a ' +
    'separate and much larger figure.';

  return {
    fte,
    beforeDeploymentMode,
    deploymentMode,
    deploymentMultiplier,
    terms,
    workingOut,
  };
}

export interface MonitoringFte {
  /** FTE of real headcount this client consumes from a 24/7 rota. */
  readonly fte: number;
  /** FTE required to keep one seat staffed around the clock. */
  readonly ftePerSeat: number;
  /** This client's size relative to the reference client. */
  readonly clientWeight: number;
  readonly terms: readonly StaffingTerm[];
  readonly workingOut: string;
}

/**
 * Headcount a client consumes from a round-the-clock rota.
 *
 * Unlike administration, this is arithmetic over published figures rather than
 * a coefficient somebody chose:
 *
 *   8,760 hours of coverage / 1,800 productive hours per FTE = 4.87 FTE a seat
 *
 * That is the number that makes a 24/7 rota impossible to staff with three
 * people, and it is why published guidance puts a minimum viable in-house 24/7
 * SOC at 8 to 12 headcount. An MSSP does not sell that seat to one client:
 * published guidance puts genuine coverage at roughly one seat per 50 to 100
 * small customers, so a reference client consumes about 0.065 FTE.
 */
export function monitoringFte(monitoredAssetCount: number, model: StaffingModel): MonitoringFte {
  const {
    hoursPerYearOfCoverage,
    productiveHoursPerFteYear,
    referenceClientsPerSeat,
    referenceMonitoredAssets,
    scaleExponent,
  } = model.monitoring;

  const ftePerSeat = hoursPerYearOfCoverage / productiveHoursPerFteYear;
  const clientWeight =
    monitoredAssetCount <= 0 ? 0 : (monitoredAssetCount / referenceMonitoredAssets) ** scaleExponent;
  const fte = (ftePerSeat * clientWeight) / referenceClientsPerSeat;

  const terms: StaffingTerm[] = [
    {
      label: 'One 24/7 seat',
      value: round(ftePerSeat, 2),
      explanation:
        `${hoursPerYearOfCoverage.toLocaleString()} hours of continuous coverage divided by ` +
        `${productiveHoursPerFteYear.toLocaleString()} productive hours per FTE per year. ` +
        'This is why a round-the-clock rota cannot be staffed by three people, and it is the ' +
        'figure behind the published 8 to 12 headcount for a minimum viable in-house 24/7 SOC.',
    },
    {
      label: 'This client, relative to a reference client',
      value: round(clientWeight, 3),
      explanation:
        `(${monitoredAssetCount.toLocaleString()} / ${referenceMonitoredAssets.toLocaleString()} ` +
        `assets) ^ ${scaleExponent}. Sublinear because a client ten times the size generates more ` +
        'triage, but not ten times more once tuning and suppression have been done.',
    },
    {
      label: 'Clients a seat carries',
      value: referenceClientsPerSeat,
      explanation:
        'Published MSSP guidance puts genuine 24/7 coverage at roughly one analyst seat per 50 ' +
        'to 100 small customers, degrading into alert backlog above that. This is the midpoint.',
    },
  ];

  const workingOut =
    `${round(fte, 3)} FTE = ${round(ftePerSeat, 2)} FTE per 24/7 seat × ${round(clientWeight, 3)} ` +
    `(this client against a reference client) ÷ ${referenceClientsPerSeat} clients a seat carries. ` +
    'This is our people watching their estate around the clock, and it is separate from the ' +
    'effort to administer the tools.';

  return { fte, ftePerSeat, clientWeight, terms, workingOut };
}
