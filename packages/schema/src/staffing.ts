// How many people it takes to run a client's stack (PROJECT_SPEC §7.2, people).
//
// Two different questions live here and are deliberately kept apart, because
// conflating them is the single easiest way to be confidently wrong by an order
// of magnitude:
//
//   ADMINISTRATION. Deploying, tuning, patching, upgrading and maintaining a
//   tool. Scales with the estate, sublinearly. This is what `opsBurden` on a
//   product has always meant.
//
//   MONITORING. Watching what the tool produces, around the clock. Scales with
//   shift coverage, not with the estate, and is the larger of the two by an
//   order of magnitude. On a managed engagement it is the thing being sold.
//
// Every coefficient below carries a mandatory `basis`, for the same reason the
// sizing coefficients do: a staffing number nobody can argue with is a number
// nobody can correct, and this one goes in front of a client.

import { z } from 'zod';

import { DeploymentMode } from './enums';

export const DeploymentModeEffort = z
  .object({
    mode: DeploymentMode,
    /**
     * Multiplier on a product's administration effort for this delivery mode.
     *
     * The same product is not the same job to run depending on who hosts it.
     * A vendor-hosted tenancy has no patching, no capacity planning, no
     * upgrade windows and no backup of the tool itself; an air-gapped
     * deployment has all of that plus manual content and threat-intel updates.
     */
    multiplier: z.number().positive().max(3),
    basis: z.string().min(1),
  })
  .strict();
export type DeploymentModeEffort = z.infer<typeof DeploymentModeEffort>;

export const AdministrationModel = z
  .object({
    /**
     * Exponent on the per-asset term. Below 1 it makes effort sublinear.
     *
     * 1.0 reproduces the flat linear model this replaced, which produced 15.5
     * FTE to administer a single SIEM across 50,000 assets. Published practice
     * is unambiguous that administration does not scale linearly: automation,
     * centralised policy and template inheritance mean the ten-thousandth
     * endpoint costs far less to bring under management than the hundredth.
     */
    scaleExponent: z.number().positive().max(1),
    /** Estate size at which the exponent leaves the per-asset term unchanged. */
    referenceAssets: z.number().positive(),
    byDeploymentMode: z.array(DeploymentModeEffort).min(1),
    basis: z.string().min(1),
  })
  .strict();
export type AdministrationModel = z.infer<typeof AdministrationModel>;

export const MonitoringModel = z
  .object({
    /** Hours in a year of continuous coverage. 24 x 365. */
    hoursPerYearOfCoverage: z.number().positive(),
    /**
     * Productive hours one FTE actually delivers in a year, after leave,
     * training, sickness and the part of the week that is not shift work.
     */
    productiveHoursPerFteYear: z.number().positive(),
    /**
     * Reference clients one staffed seat can carry.
     *
     * Published guidance puts genuine 24/7 coverage at roughly one analyst per
     * 50 to 100 small customers, degrading into alert backlog above that.
     */
    referenceClientsPerSeat: z.number().positive(),
    /** Monitored assets that define one "reference client" for that ratio. */
    referenceMonitoredAssets: z.number().positive(),
    /**
     * Exponent on a client's size relative to the reference client.
     *
     * Sublinear for the same reason administration is: a client ten times the
     * size does not generate ten times the triage once tuning and suppression
     * have been done, though they do generate more.
     */
    scaleExponent: z.number().positive().max(1),
    basis: z.string().min(1),
  })
  .strict();
export type MonitoringModel = z.infer<typeof MonitoringModel>;

export const StaffingModel = z
  .object({
    asOf: z.string().min(1),
    administration: AdministrationModel,
    monitoring: MonitoringModel,
    sources: z
      .array(z.object({ url: z.string().url(), asOf: z.string().min(1) }).strict())
      .min(1),
  })
  .strict()
  .superRefine((model, ctx) => {
    const seen = new Set<string>();
    for (const entry of model.administration.byDeploymentMode) {
      if (seen.has(entry.mode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['administration', 'byDeploymentMode'],
          message: `duplicate deployment mode "${entry.mode}"`,
        });
      }
      seen.add(entry.mode);
    }
    for (const mode of DeploymentMode.options) {
      if (!seen.has(mode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['administration', 'byDeploymentMode'],
          // Every mode must be stated. A missing one would silently default to
          // 1.0, which is the on-premises answer given to a SaaS deployment.
          message: `deployment mode "${mode}" has no effort multiplier`,
        });
      }
    }
  });
export type StaffingModel = z.infer<typeof StaffingModel>;
