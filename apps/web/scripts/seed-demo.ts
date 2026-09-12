/**
 * Demo scoping sessions (PROJECT_SPEC §11 phase 10).
 *
 * A cold start lands on an empty sessions list, which is correct and tells a
 * first-time reader nothing. This puts four sessions in front of them that
 * between them exercise every part of the portal: a clean result, a budget that
 * cannot buy compliance, two currencies, and a pair built to be compared.
 *
 * Everything here comes from `data/presets/`. Nothing is invented: the counts
 * are the same analyst estimates the intake wizard offers, and the one figure
 * this file chooses for itself, the raised implementation budget on the fourth
 * session, is named and explained below.
 *
 * Idempotent. Rows are upserted under fixed ids, so running it twice changes
 * nothing and it can never touch a session an analyst actually saved.
 */

import type { ClientProfile, ScenarioPreset } from '@stackfit/schema';

import { engineData } from '../src/lib/config.server';
import { prisma } from '../src/lib/db';
import { profileFromPreset } from '../src/lib/scenario';

interface DemoSession {
  readonly id: string;
  readonly presetId: string;
  /** Why this one is in the demo set. Printed, so the run explains itself. */
  readonly shows: string;
  /** Renames the session where the preset's own name would not fit the story. */
  readonly name?: string;
  readonly amend?: (profile: ClientProfile) => ClientProfile;
}

/** INR 30,00,000. See `DEMO_SESSIONS` for why this number and not another. */
const RAISED_ONE_TIME_CAP = 300_000_000;

const DEMO_SESSIONS: readonly DemoSession[] = [
  {
    id: 'demo-hospital-300-beds',
    presetId: 'hospital-300-beds',
    shows: 'the whole dashboard on a large estate, 13 categories funded, no shortfall',
  },
  {
    id: 'demo-bank-60-branches',
    presetId: 'bank-60-branches',
    shows:
      'three frameworks at once, priced in INR, compare it with the hospital to see the currency guard',
  },
  {
    id: 'demo-retail-40-stores',
    presetId: 'retail-chain-40-stores',
    shows: 'a budget that cannot buy compliance: seven mandatory categories unfunded',
  },
  {
    id: 'demo-retail-40-stores-funded',
    presetId: 'retail-chain-40-stores',
    name: 'Retail chain, 40 stores, implementation funded',
    // The preset's own annual cap is untouched. Only the one-time cap moves,
    // because on this estate the one-time cap is what was actually binding:
    // two thirds of the annual budget was going unspent. INR 30,00,000 is the
    // smallest round figure that visibly changes the answer rather than a
    // number picked to flatter the tool.
    shows:
      'the same client with a larger implementation budget, the other half of the compare demo',
    amend: (profile) => ({
      ...profile,
      budget: {
        ...profile.budget,
        oneTimeCap: { amountMinor: RAISED_ONE_TIME_CAP, currency: profile.budget.currency },
      },
    }),
  },
];

function presetOrThrow(presets: readonly ScenarioPreset[], id: string): ScenarioPreset {
  const preset = presets.find((candidate) => candidate.id === id);
  if (preset === undefined) {
    throw new Error(
      `seed: no preset "${id}" in data/presets. The demo sessions are built from the committed ` +
        'presets, so a renamed preset has to be renamed here too.',
    );
  }
  return preset;
}

async function main(): Promise<void> {
  const { presets } = engineData();

  for (const session of DEMO_SESSIONS) {
    const preset = presetOrThrow(presets, session.presetId);
    const base = profileFromPreset(preset);
    const amended = session.amend === undefined ? base : session.amend(base);
    const profile: ClientProfile = { ...amended, orgName: session.name ?? amended.orgName };

    const data = {
      name: profile.orgName,
      profile: JSON.stringify(profile),
      inventory: JSON.stringify(preset.inventory),
    };

    // Upsert rather than create: re-running must not pile up duplicates, and
    // must not need the database emptied first.
    await prisma.scenario.upsert({
      where: { id: session.id },
      update: data,
      create: { id: session.id, ...data, overrides: '{}' },
    });

    console.log(`  ${profile.orgName}\n    ${session.shows}`);
  }

  /*
   * Read back what was just written, from a fresh query, and fail loudly if it
   * is not there.
   *
   * This ran once, reported four sessions ready, and they were readable over
   * HTTP a moment later. Some minutes afterwards all four were gone from the
   * file while every other row survived, and the only reason anyone noticed was
   * a 404 on a page nobody was looking for. The mechanism is still open (see
   * docs/STATUS.md); what is not open is that a seed which cannot prove its own
   * work is a seed that lies.
   *
   * Cheap, and it turns a silent class of failure into an exit code.
   */
  const ids = DEMO_SESSIONS.map((session) => session.id);
  const written = await prisma.scenario.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const missing = ids.filter((id) => !written.some((row) => row.id === id));

  if (missing.length > 0) {
    throw new Error(
      `seed wrote ${ids.length} sessions but only ${written.length} read back. ` +
        `Missing: ${missing.join(', ')}. Stop the dev server and run this again: a second ` +
        'connection to the same SQLite file is the suspect.',
    );
  }

  console.log(
    `\n${DEMO_SESSIONS.length} demo sessions written and read back. Start the app with \`pnpm dev\`.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
