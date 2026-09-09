// ClientProfile (PROJECT_SPEC §5.1) — everything the intake wizard collects
// about the organisation, as opposed to its asset counts.

import { z } from 'zod';

import { AssetInventory } from './asset-inventory.js';
import {
  CurrencyCode,
  DataSensitivity,
  DeploymentMode,
  FrameworkId,
  Industry,
  ProcurementBias,
  Region,
  RiskTolerance,
  SocPosture,
} from './enums.js';
import { NonNegativeMoney } from './money.js';
import { Slug } from './product.js';

export const Budget = z
  .object({
    /** Recurring ceiling. Null means "not stated", which is not the same as zero. */
    annualCap: NonNegativeMoney.nullable(),
    /** Capital / year-one ceiling for licences, services and hardware. */
    oneTimeCap: NonNegativeMoney.nullable(),
    currency: CurrencyCode,
    horizonYears: z.number().int().min(1).max(5).default(3),
  })
  .strict()
  .superRefine((budget, ctx) => {
    for (const key of ['annualCap', 'oneTimeCap'] as const) {
      const cap = budget[key];
      if (cap !== null && cap.currency !== budget.currency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key, 'currency'],
          message: `${key} is in ${cap.currency} but the budget currency is ${budget.currency}`,
        });
      }
    }
  });
export type Budget = z.infer<typeof Budget>;

export const ClientProfile = z
  .object({
    orgName: z.string().min(1),
    industry: Industry,
    /** A hint only: pre-selects frameworks, currency and labour rate, all overridable. */
    region: Region,
    employeeCount: z.number().int().nonnegative(),
    itStaffCount: z.number().int().nonnegative(),
    /** Zero is valid, common, and drives the ops-fit penalty hard (§7.3). */
    securityStaffFte: z.number().nonnegative(),
    hasSoc: SocPosture,
    riskTolerance: RiskTolerance,
    dataSensitivity: DataSensitivity,
    /** Ticked by the analyst. These are what promote a category to mandatory. */
    compliance: z.array(FrameworkId).default([]),
    budget: Budget,
    deploymentPreference: DeploymentMode,
    procurementBias: ProcurementBias,
    /** Product ids they already own and will keep; scored for integration fit. */
    retainedTools: z.array(Slug).default([]),
    /**
     * Product ids the analyst has ruled out for this client — an incumbent
     * relationship gone bad, a failed PoC, a vendor the board will not approve.
     * A §7.3 hard filter.
     *
     * This is a per-scenario judgement and not the vendor include/exclude list
     * that was ruled out for v1: every vendor stays eligible in the catalog,
     * and this only records what a particular client has already rejected.
     */
    excludedProducts: z.array(Slug).default([]),
  })
  .strict();
export type ClientProfile = z.infer<typeof ClientProfile>;

/** One saved scoping session: the profile plus the inventory it was sized from. */
export const Scenario = z
  .object({
    name: z.string().min(1),
    profile: ClientProfile,
    inventory: AssetInventory,
  })
  .strict();
export type Scenario = z.infer<typeof Scenario>;
