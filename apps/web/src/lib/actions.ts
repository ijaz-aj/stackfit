'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { INDUSTRY_SHORT } from '@/components/wizard/labels';
import { engineData } from './config.server';
import { formatNumber } from './format';
import { prisma } from './db';
import { summariseEstimate, type EstimateSummary } from './estimate';
import { resultsFor } from './results.server';
import { requireAnalyst } from './session.server';
import {
  CreateScenarioInput,
  NEW_INVENTORY,
  NEW_PROFILE,
  ScenarioDraft,
  ScenarioId,
  SizingOverrideInput,
  profileFromPreset,
  uniqueScenarioName,
  isUnreadable,
  parseScenarioRow,
  type ScenarioRecord,
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
 *
 * Every one of these now opens with `requireAnalyst()`. A server action is a
 * POST endpoint with a generated URL, reachable by anyone who can read the
 * page source: gating the *page* that renders the form protects nothing at
 * all. This is the authz home Q3 described, and it is used rather than
 * described.
 */

export async function createScenario(formData: FormData): Promise<void> {
  const analyst = await requireAnalyst();

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

  // Two sessions from the same preset were both called "Retail chain, 40
  // stores", and the list shows nothing else that differs between them.
  const taken = await prisma.scenario.findMany({ select: { name: true } });
  const name = uniqueScenarioName(
    profile.orgName,
    taken.map((row) => row.name),
  );

  const created = await prisma.scenario.create({
    data: {
      name,
      profile: JSON.stringify(profile),
      inventory: JSON.stringify(inventory),
      // Null on a local install with no auth, which is the column's documented
      // meaning rather than a missing value.
      ownerId: analyst.id,
      createdBy: analyst.email,
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
 * be cheap and it has to be safe to call with a half-finished intake, which is
 * why the schema's defaults are sane rather than strict.
 */
export async function saveScenario(input: unknown): Promise<SaveResult> {
  await requireAnalyst();

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

/**
 * Clone a scenario (§11 phase 9).
 *
 * The whole point of cloning is to change one thing and see what it does, so
 * the copy carries everything: profile, inventory and the sizing overrides.
 * An override the analyst corrected on the call is part of what makes the two
 * runs comparable; dropping it would silently change a second variable.
 *
 * The copy is a new row rather than a version of the original: two scenarios
 * that can be opened, edited and compared independently is what phase 9 asks
 * for, and versioning is a different feature with a different UI.
 */
export async function cloneScenario(formData: FormData): Promise<void> {
  const analyst = await requireAnalyst();

  const parsed = ScenarioId.safeParse({ id: formData.get('id')?.toString() });
  if (!parsed.success) throw new Error('invalid scenario id');

  const source = await prisma.scenario.findUnique({ where: { id: parsed.data.id } });
  if (source === null) throw new Error('scenario not found');

  const takenNames = await prisma.scenario.findMany({ select: { name: true } });

  const created = await prisma.scenario.create({
    data: {
      name: uniqueScenarioName(
        `${source.name} (copy)`,
        takenNames.map((row) => row.name),
      ),
      profile: source.profile,
      inventory: source.inventory,
      overrides: source.overrides,
      // The copy belongs to whoever made it, not to whoever made the original.
      ownerId: analyst.id,
      createdBy: analyst.email,
    },
  });

  revalidatePath('/');
  redirect(`/scenarios/${created.id}`);
}

export async function deleteScenario(formData: FormData): Promise<void> {
  await requireAnalyst();

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
 * work, which they would if either wrote the whole row.
 */
export async function saveSizingOverrides(input: unknown): Promise<SaveResult> {
  await requireAnalyst();

  const parsed = SizingOverrideInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      savedAt: new Date().toISOString(),
      problem:
        issue === undefined ? 'invalid override' : `${issue.path.join('.')}: ${issue.message}`,
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
 * framework library. The client gets a summary, not a copy of the data tree.
 * The engine call itself is pure; `today` is read here, at the edge.
 */
export async function estimateScenario(input: unknown): Promise<EstimateResult> {
  await requireAnalyst();

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

/** One row in the command palette's results. */
export interface CommandTarget {
  readonly id: string;
  readonly name: string;
  /** Industry, headcount and currency, for telling two same-named rows apart. */
  readonly detail: string;
}

/**
 * Sessions matching what the analyst has typed into the command palette.
 *
 * A server action rather than a list shipped with the layout. The layout wraps
 * the sign-in page too, and baking every saved session's name into every page
 * would put a prospective client list in front of anyone who can load the
 * login screen. This way the query is gated by `requireAnalyst()` like every
 * other mutation, and nothing reaches the browser until somebody asks.
 *
 * Matching is a plain case-insensitive substring over the name and the
 * industry, done in SQL-free Prisma. Ranking beyond "starts with beats
 * contains" would be inventing relevance for a list that is fifty rows long.
 */
export async function searchSessions(query: unknown): Promise<readonly CommandTarget[]> {
  await requireAnalyst();

  const parsed = z.string().max(120).safeParse(query);
  if (!parsed.success) return [];
  const needle = parsed.data.trim().toLowerCase();

  const rows = await prisma.scenario.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 });

  return rows
    .map(parseScenarioRow)
    .filter((scenario): scenario is ScenarioRecord => !isUnreadable(scenario))
    .map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      detail:
        `${INDUSTRY_SHORT[scenario.profile.industry] ?? scenario.profile.industry} · ` +
        `${formatNumber(scenario.profile.employeeCount)} staff · ${scenario.profile.budget.currency}`,
    }))
    .filter(
      (target) =>
        needle === '' ||
        target.name.toLowerCase().includes(needle) ||
        target.detail.toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      const rank = (target: CommandTarget) =>
        target.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return rank(a) - rank(b);
    })
    .slice(0, 8);
}
