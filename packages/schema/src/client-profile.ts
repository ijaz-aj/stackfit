// ClientProfile (PROJECT_SPEC §5.1). Everything the intake wizard collects
// about the organisation, as opposed to its asset counts.

import { z } from 'zod';

import { AssetInventory } from './asset-inventory';
import {
  ClientEnvironment,
  CurrencyCode,
  DataSensitivity,
  DeploymentConstraint,
  FrameworkId,
  Industry,
  ProcurementBias,
  Region,
  RiskTolerance,
  DeliveryModel,
} from './enums';
import { NonNegativeMoney } from './money';
import { Slug } from './product';

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
    /**
     * Zero is valid and common. It binds hard on `client_operated` engagements
     * and is close to irrelevant on `mssp_managed` ones, where the people
     * running the stack are ours.
     */
    securityStaffFte: z.number().nonnegative(),
    /** How much of the stack we operate. See `DeliveryModel`. */
    deliveryModel: DeliveryModel,
    riskTolerance: RiskTolerance,
    dataSensitivity: DataSensitivity,
    /** Ticked by the analyst. These are what promote a category to mandatory. */
    compliance: z.array(FrameworkId).default([]),
    budget: Budget,
    /**
     * What the client runs today. A fact, captured on the call. Not a wish.
     * `not_asked` is the honest answer when it did not come up, and is the only
     * value that lets the estate's asset counts speak instead.
     */
    environment: ClientEnvironment,
    /** A delivery model their procurement policy forbids outright. */
    deploymentConstraint: DeploymentConstraint.default('none'),
    procurementBias: ProcurementBias,
    /** Product ids they already own and will keep; scored for integration fit. */
    retainedTools: z.array(Slug).default([]),
    /**
     * Product ids the analyst has ruled out for this client. An incumbent
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

/**
 * Scoping sessions saved before the environment split still parse.
 *
 * They carry `deploymentPreference`, where `hybrid` *meant* "no strong
 * preference". That was the wizard's own wording for it. Mapping it to
 * `hybrid` would silently change what those clients said, so it maps to
 * `not_asked`, which is what it actually meant. The other three values carried
 * their plain meaning and are kept.
 *
 * Without this every stored scenario would read as unparseable the moment the
 * schema changed, and `parseScenarioRow` would report a database of unreadable
 * rows rather than a migration nobody performed.
 */
const LEGACY_ENVIRONMENT: Readonly<Record<string, ClientEnvironment>> = {
  cloud: 'cloud',
  on_prem: 'on_prem',
  air_gapped: 'air_gapped',
  hybrid: 'not_asked',
};

/**
 * Sessions saved before `hasSoc` became `deliveryModel` still parse.
 *
 * The old field asked what monitoring the client already had. The new one asks
 * who will operate the stack we recommend, and they are not the same question,
 * so this is a reading of the old answer rather than a rename.
 *
 * `outsourced` and `24x7` are the two that need care. A client who said their
 * monitoring was outsourced was, on this tool, describing us, so it reads as
 * `mssp_managed`. A client with a round-the-clock rota of their own is the one
 * case where they genuinely run it, so it reads as `client_operated`, and so
 * does `none`: nobody watching is not evidence that we were engaged to watch,
 * and reading it as managed would quietly upgrade every old row into a sale.
 * `business_hours` reads as `co_managed`, a team that carries part of it.
 *
 * Every mapping loses something, because the old field could not express what
 * the new one is for. That is the cost of having asked the wrong question for
 * as long as we did, and it is better paid here, once, in a stated table than
 * by a database of rows nobody can open.
 */
const LEGACY_DELIVERY: Readonly<Record<string, DeliveryModel>> = {
  outsourced: 'mssp_managed',
  business_hours: 'co_managed',
  '24x7': 'client_operated',
  none: 'client_operated',
};

export type ClientProfile = z.infer<typeof ClientProfile>;

/**
 * `ClientProfile`, but tolerant of the pre-split shape.
 *
 * Used only where a *persisted* profile is read back. Everything else (the
 * wizard, the presets, the engine) speaks the current shape, so the migration
 * lives at the one boundary that can encounter an old one rather than being
 * spread across every parse in the repo.
 */
export const StoredClientProfile = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) return value;
  let row = value as Record<string, unknown>;

  if ('deploymentPreference' in row) {
    const { deploymentPreference, ...rest } = row;
    // An unrecognised legacy value is left to fail validation rather than being
    // guessed at: a profile nobody can read is safer than one silently invented.
    const migrated =
      typeof deploymentPreference === 'string'
        ? LEGACY_ENVIRONMENT[deploymentPreference]
        : undefined;
    row = migrated === undefined ? rest : { ...rest, environment: migrated };
  }

  if ('hasSoc' in row) {
    const { hasSoc, ...rest } = row;
    const migrated = typeof hasSoc === 'string' ? LEGACY_DELIVERY[hasSoc] : undefined;
    row = migrated === undefined ? rest : { ...rest, deliveryModel: migrated };
  }

  return row;
}, ClientProfile);

/** One saved scoping session: the profile plus the inventory it was sized from. */
export const Scenario = z
  .object({
    name: z.string().min(1),
    profile: ClientProfile,
    inventory: AssetInventory,
  })
  .strict();
export type Scenario = z.infer<typeof Scenario>;
