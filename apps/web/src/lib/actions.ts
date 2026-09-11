'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { engineData } from './config.server';
import { prisma } from './db';
import { summariseEstimate, type EstimateSummary } from './estimate';
import { resultsFor } from './results.server';
import {
  CreateScenarioInput,
  NEW_INVENTORY,
  NEW_PROFILE,
  ScenarioDraft,
  ScenarioId,
  SizingOverrideInput,
  profileFromPreset,
} from './scenario';

/**
 * Every mutation in the app goes through this file (docs/STATUS.md, Q3).
 *
 * There is no auth in v1, and this is the seam where it goes when there is:
 * one place that knows who is asking and what they may change, rather than a
 * check scattered across every route.
 *
 * Arguments arrive from the browser, so every one of them is parsed through Zod
 * before it reaches the database or the engine (hard rule 10). Nothing here
 * builds SQL; Prisma is the only way in.
 */

export async function createScenario(formData: FormData): Promise<void> {
  const parsed = CreateScenarioInput.safeParse({
    presetId: formData.get('presetId')?.toString() || undefined,
  });
  if (!parsed.success) throw new Error('invalid preset');

  const { presets } = engineData();
  const preset =
    parsed.data.presetId === undefined
      ? undefined
      : presets.find((candidate) => candidate.id === parsed.data.presetId);

  if (parsed.data.presetId !== undefined && preset === undefined) {
    throw new Error(`unknown preset: ${parsed.data.presetId}`);
  }

  const profile = preset === undefined ? NEW_PROFILE : profileFromPreset(preset);
  const inventory = preset === undefined ? NEW_INVENTORY : preset.inventory;

  const created = await prisma.scenario.create({
    data: {
      name: profile.orgName,
      profile: JSON.stringify(profile),
      inventory: JSON.stringify(inventory),
    },
  });

  revalidatePath('/');
  redirect(`/scenarios/${created.id}`);
}

export interface SaveResult {
  readonly ok: boolean;
  readonly savedAt: string;
  readonly problem?: string;
}

/**
 * Continuous save (§9). Called on a debounce as the analyst types, so it has to
 * be cheap and it has to be safe to call with a half-finished intake — which is
 * why the schema's defaults are sane rather than strict.
 */
export async function saveScenario(input: unknown): Promise<SaveResult> {
  const parsed = ScenarioDraft.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      savedAt: new Date().toISOString(),
      problem: issue === undefined ? 'invalid draft' : `${issue.path.join('.')}: ${issue.message}`,
    };
  }

  const { id, profile, inventory } = parsed.data;
  await prisma.scenario.update({
    where: { id },
    data: {
      name: profile.orgName,
      profile: JSON.stringify(profile),
      inventory: JSON.stringify(inventory),
    },
  });

  // The list page shows names and timestamps; the wizard route does not need
  // re-rendering, since the client already holds what it just sent.
  revalidatePath('/');
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deleteScenario(formData: FormData): Promise<void> {
  const parsed = ScenarioId.safeParse({ id: formData.get('id')?.toString() });
  if (!parsed.success) throw new Error('invalid scenario id');

  await prisma.scenario.delete({ where: { id: parsed.data.id } });
  revalidatePath('/');
}

/**
 * Save one client's corrections to the sizing coefficients (§8.6).
 *
 * Writes only the overrides column. The wizard's autosave writes only profile
 * and inventory, so two tabs open on one scenario cannot undo each other's
 * work — which they would if either wrote the whole row.
 */
export async function saveSizingOverrides(input: unknown): Promise<SaveResult> {
  const parsed = SizingOverrideInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      savedAt: new Date().toISOString(),
      problem: issue === undefined ? 'invalid override' : `${issue.path.join('.')}: ${issue.message}`,
    };
  }

  await prisma.scenario.update({
    where: { id: parsed.data.id },
    data: { overrides: JSON.stringify(parsed.data.overrides) },
  });

  revalidatePath(`/scenarios/${parsed.data.id}/results`);
  return { ok: true, savedAt: new Date().toISOString() };
}

export interface EstimateResult {
  readonly ok: boolean;
  readonly summary?: EstimateSummary;
  readonly problem?: string;
}

/**
 * Run the engine over an unsaved draft and hand back what the sidebar shows.
 *
 * On the server because it needs the catalog, eleven config files and the
 * framework library — the client gets a summary, not a copy of the data tree.
 * The engine call itself is pure; `today` is read here, at the edge.
 */
export async function estimateScenario(input: unknown): Promise<EstimateResult> {
  const parsed = ScenarioDraft.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      problem: issue === undefined ? 'invalid draft' : `${issue.path.join('.')}: ${issue.message}`,
    };
  }

  const result = resultsFor(parsed.data.profile, parsed.data.inventory);
  return { ok: true, summary: summariseEstimate(result) };
}
