'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { INDUSTRY_SHORT } from '@/components/wizard/labels';
import { engineData } from './config.server';
import { formatMoney, formatNumber } from './format';
import { prisma } from './db';
import { summariseEstimate, type EstimateSummary } from './estimate';
import { planGapClosure } from '@stackfit/engine';
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

/**
 * Raise the budget to what closes the addressable gaps, and report what
 * actually happened.
 *
 * The verification is the point, and it is why this does not simply write the
 * caps and redirect. Raising a cap re-runs the whole selection, and the engine
 * can reach a different stack at the larger budget. A button that promised
 * "gaps closed" and left the client to discover otherwise would be exactly the
 * kind of confident wrongness this product cannot afford, so the plan states a
 * budget, the action applies it, and the result is read back off a real run.
 *
 * Controls no product claims are never counted as closed, at any budget. They
 * are reported before and after and the figures below exclude them.
 */
export interface GapClosureResult {
  readonly ok: boolean;
  readonly problem?: string;
  /** Coverage before and after, read from two real pipeline runs. */
  readonly before?: { readonly coveragePercent: number | null; readonly gaps: number };
  readonly after?: { readonly coveragePercent: number | null; readonly gaps: number };
  readonly appliedAnnualCap?: string;
  readonly appliedOneTimeCap?: string;
  /** Gaps that remain because no purchase closes them. */
  readonly stillOpen?: readonly string[];
}

const GapClosureInput = z.object({ id: z.string().min(1) }).strict();

export async function applyGapClosure(input: unknown): Promise<GapClosureResult> {
  await requireAnalyst();

  const parsed = GapClosureInput.safeParse(input);
  if (!parsed.success) return { ok: false, problem: 'invalid request' };

  const row = await prisma.scenario.findUnique({ where: { id: parsed.data.id } });
  if (row === null) return { ok: false, problem: 'no such scenario' };

  const scenario = parseScenarioRow(row);
  if ('problem' in scenario) return { ok: false, problem: scenario.problem };

  const before = resultsFor(scenario.profile, scenario.inventory, scenario.overrides);
  const plan = planGapClosure(
    before.recommended,
    before.coverage,
    scenario.profile.budget,
    before.phase2,
  );

  /*
   * Only ever claims the budget-blocked subset. A gap needing a deferred
   * category or a product swap does not move for money, and offering to fix it
   * here would be a button that runs, reports success, and changes nothing.
   */
  if (plan.closeableByBudget === 0) {
    return {
      ok: false,
      problem:
        plan.needDeferredCategory > 0 || plan.needProductSwap > 0
          ? `No gap here is blocked by budget. ${plan.needDeferredCategory} need a category year one deferred on weight, and ${plan.needProductSwap} need a different product inside a category already funded. Neither moves for money.`
          : plan.unclosableGaps.length > 0
            ? 'Nothing here can be closed by a purchase. These controls need policy, process or evidence.'
            : 'There are no gaps to close.',
    };
  }

  /*
   * Only ever raises. A plan cheaper than the stated budget must not quietly
   * cut what the client told us they had to spend: the budget is their
   * statement, not ours, and lowering it would change the recommendation on a
   * fact we were not given.
   */
  const raised = {
    ...scenario.profile.budget,
    annualCap:
      scenario.profile.budget.annualCap === null ||
      plan.requiredAnnualCap.amountMinor > scenario.profile.budget.annualCap.amountMinor
        ? plan.requiredAnnualCap
        : scenario.profile.budget.annualCap,
    oneTimeCap:
      scenario.profile.budget.oneTimeCap === null ||
      plan.requiredOneTimeCap.amountMinor > scenario.profile.budget.oneTimeCap.amountMinor
        ? plan.requiredOneTimeCap
        : scenario.profile.budget.oneTimeCap,
  };

  const profile = { ...scenario.profile, budget: raised };
  const after = resultsFor(profile, scenario.inventory, scenario.overrides);

  /*
   * Dry run first, and only commit if it demonstrably helped.
   *
   * Whether a gap is held open by the budget or by the year-one scope cannot
   * be known before running it: `phase2` holds both the categories the budget
   * blocked and the ones the weight gate deferred. So this runs the larger
   * budget, checks it actually bought something, and leaves the scenario
   * untouched when it did not. A button that raised a client's budget and
   * changed nothing would be worse than one that refused.
   */
  const closedGaps = after.coverage.gaps.length < before.coverage.gaps.length;
  const fundedMandates =
    after.recommended.unfundedMandatory.length < before.recommended.unfundedMandatory.length;

  if (!closedGaps && !fundedMandates) {
    return {
      ok: false,
      problem:
        `Raising the budget to ${formatMoney(raised.annualCap)}/yr changes nothing: the same ` +
        `${before.coverage.gaps.length} controls stay open. These gaps are held by the year-one ` +
        'scope rather than by money, so the budget has been left alone. Pulling a Phase 2 ' +
        'category forward, or choosing a different product inside a funded category, is what ' +
        'moves them.',
    };
  }

  await prisma.scenario.update({
    where: { id: parsed.data.id },
    data: { profile: JSON.stringify(profile) },
  });

  revalidatePath(`/scenarios/${parsed.data.id}/results`);
  revalidatePath(`/scenarios/${parsed.data.id}`);

  return {
    ok: true,
    before: {
      coveragePercent: before.coverage.summary.coveragePercent,
      gaps: before.coverage.gaps.length,
    },
    after: {
      coveragePercent: after.coverage.summary.coveragePercent,
      gaps: after.coverage.gaps.length,
    },
    appliedAnnualCap: formatMoney(raised.annualCap),
    appliedOneTimeCap: formatMoney(raised.oneTimeCap),
    stillOpen: after.coverage.unclosableGaps,
  };
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
