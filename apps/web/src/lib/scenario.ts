import { AssetInventory, ClientProfile, Slug, type ScenarioPreset } from '@stackfit/schema';
import { z } from 'zod';

/**
 * Scenario shapes and defaults. Pure — no React, no database, no filesystem —
 * so the rules about what a valid intake looks like can be tested without
 * standing anything up.
 */

/**
 * A brand new intake.
 *
 * §9 requires every wizard step to be skippable with sane defaults, which means
 * these values have to be defensible on their own: an analyst who fills in
 * nothing but the estate should still get a sensible answer. India and INR
 * because that is the first release's primary region (docs/STATUS.md, Q1);
 * zero security staff because it is the most common honest answer and the one
 * that changes the recommendation most.
 */
export const NEW_PROFILE: ClientProfile = {
  orgName: 'New client',
  industry: 'other',
  region: 'in',
  employeeCount: 100,
  itStaffCount: 3,
  securityStaffFte: 0,
  hasSoc: 'none',
  riskTolerance: 'medium',
  dataSensitivity: 'internal',
  compliance: [],
  budget: { annualCap: null, oneTimeCap: null, currency: 'INR', horizonYears: 3 },
  deploymentPreference: 'hybrid',
  procurementBias: 'no_preference',
  retainedTools: [],
  excludedProducts: [],
};

/** An empty estate means "not asked yet", which sizing already reads as zero. */
export const NEW_INVENTORY: AssetInventory = { networkVendors: [] };

/** What the client sends when it saves. Validated server-side; never trusted. */
export const ScenarioDraft = z
  .object({
    id: z.string().min(1).max(64),
    profile: ClientProfile,
    inventory: AssetInventory,
  })
  .strict();
export type ScenarioDraft = z.infer<typeof ScenarioDraft>;

export const CreateScenarioInput = z
  .object({
    /** Seed the new scenario from an intake preset, if the analyst picked one. */
    presetId: Slug.optional(),
  })
  .strict();
export type CreateScenarioInput = z.infer<typeof CreateScenarioInput>;

export const ScenarioId = z.object({ id: z.string().min(1).max(64) }).strict();

export interface ScenarioRecord {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly profile: ClientProfile;
  readonly inventory: AssetInventory;
}

export interface UnreadableScenario {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly problem: string;
}

export interface ScenarioRow {
  readonly id: string;
  readonly name: string;
  readonly profile: string;
  readonly inventory: string;
  readonly updatedAt: Date;
}

/**
 * A stored row back into a scenario.
 *
 * Deliberately total: a row that no longer parses — written before a schema
 * change, say — is reported as unreadable rather than thrown, because one bad
 * row must not take out the list of every other scenario.
 */
export function parseScenarioRow(row: ScenarioRow): ScenarioRecord | UnreadableScenario {
  const base = { id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString() };

  let rawProfile: unknown;
  let rawInventory: unknown;
  try {
    rawProfile = JSON.parse(row.profile);
    rawInventory = JSON.parse(row.inventory);
  } catch (error) {
    return { ...base, problem: `stored JSON is malformed: ${(error as Error).message}` };
  }

  const profile = ClientProfile.safeParse(rawProfile);
  if (!profile.success) {
    return { ...base, problem: `profile does not match the current schema: ${issueOf(profile.error)}` };
  }

  const inventory = AssetInventory.safeParse(rawInventory);
  if (!inventory.success) {
    return {
      ...base,
      problem: `inventory does not match the current schema: ${issueOf(inventory.error)}`,
    };
  }

  return { ...base, profile: profile.data, inventory: inventory.data };
}

export function isUnreadable(
  scenario: ScenarioRecord | UnreadableScenario,
): scenario is UnreadableScenario {
  return 'problem' in scenario;
}

function issueOf(error: z.ZodError): string {
  const first = error.issues[0];
  return first === undefined ? 'unknown' : `${first.path.join('.') || '(root)'} ${first.message}`;
}

/** A preset's contribution to a new scenario. The client's name stays theirs. */
export function profileFromPreset(preset: ScenarioPreset): ClientProfile {
  return { ...preset.profile, orgName: preset.name };
}

/**
 * Changing the scenario currency re-labels the budget caps; it does not convert
 * them.
 *
 * The analyst types a cap in the client's own currency, so a currency change
 * almost always means "I picked the wrong code", not "convert my number". A
 * silent conversion would change a figure the analyst typed, which is the one
 * thing the money rules are there to prevent.
 */
export function withCurrency(profile: ClientProfile, currency: ClientProfile['budget']['currency']): ClientProfile {
  const { annualCap, oneTimeCap } = profile.budget;
  return {
    ...profile,
    budget: {
      ...profile.budget,
      currency,
      annualCap: annualCap === null ? null : { ...annualCap, currency },
      oneTimeCap: oneTimeCap === null ? null : { ...oneTimeCap, currency },
    },
  };
}
