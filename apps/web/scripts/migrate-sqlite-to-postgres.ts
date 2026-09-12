/*
 * One-off: copy saved scoping sessions out of the old SQLite file into Postgres.
 *
 * The app moved to Postgres in every environment, because a serverless host
 * discards its filesystem between invocations and a SQLite file there is not
 * slow, it is gone. Local databases did not move themselves, so anything saved
 * before the switch is still sitting in `apps/web/stackfit.db` and is invisible
 * to the running app.
 *
 * Read-only on the SQLite side and idempotent on the Postgres side: it upserts
 * by id, so running it twice copies the same rows to the same place rather than
 * duplicating them. The old file is never modified or deleted; delete it
 * yourself once you are satisfied the rows arrived.
 *
 * `node:sqlite` rather than a dependency. It is built into Node 22 and later,
 * which is what this repo already requires, and adding `better-sqlite3` back
 * for a script that should be run once and then forgotten is the wrong trade.
 *
 *   DATABASE_URL="postgresql://..." npx tsx scripts/migrate-sqlite-to-postgres.ts
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { prisma } from '../src/lib/db';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly profile: string;
  readonly inventory: string;
  readonly overrides: string;
  readonly ownerId: string | null;
  readonly createdBy: string | null;
  readonly createdAt: number | string;
  readonly updatedAt: number | string;
}

/**
 * SQLite stores Prisma `DateTime` as milliseconds since the epoch, and returns
 * it as a number. A string turns up if the column was ever written by something
 * other than Prisma. Both are accepted; an unreadable one becomes the current
 * time rather than failing the whole migration, because a slightly wrong
 * timestamp on a recovered row is better than no row.
 */
function toDate(value: number | string): Date {
  const parsed = typeof value === 'number' ? new Date(value) : new Date(Number(value) || value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dbPath = resolve(process.argv[2] ?? join(here, '..', 'stackfit.db'));

  if (!existsSync(dbPath)) {
    console.log(`No SQLite file at ${dbPath}. Nothing to migrate, which is the normal case.`);
    return;
  }

  const sqlite = new DatabaseSync(dbPath, { readOnly: true });
  const rows = sqlite
    .prepare(
      'SELECT id, name, profile, inventory, overrides, ownerId, createdBy, createdAt, updatedAt FROM Scenario',
    )
    .all() as unknown as Row[];
  sqlite.close();

  if (rows.length === 0) {
    console.log(`${dbPath} holds no saved sessions.`);
    return;
  }

  console.log(`Found ${rows.length} session(s) in ${dbPath}.\n`);

  let copied = 0;
  for (const row of rows) {
    const data = {
      name: row.name,
      profile: row.profile,
      inventory: row.inventory,
      overrides: row.overrides,
      ownerId: row.ownerId,
      createdBy: row.createdBy,
      createdAt: toDate(row.createdAt),
      updatedAt: toDate(row.updatedAt),
    };

    await prisma.scenario.upsert({
      where: { id: row.id },
      create: { id: row.id, ...data },
      update: data,
    });
    copied += 1;
    console.log(`  ${row.id.padEnd(28)} ${row.name}`);
  }

  // Read back, for the same reason the seed does: a migration that cannot prove
  // its own work is a migration that lies.
  const ids = rows.map((row) => row.id);
  const written = await prisma.scenario.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const missing = ids.filter((id) => !written.some((entry) => entry.id === id));

  if (missing.length > 0) {
    throw new Error(
      `Copied ${copied} but only ${written.length} read back. Missing: ${missing.join(', ')}`,
    );
  }

  console.log(
    `\n${copied} session(s) copied and read back. The SQLite file is untouched; delete it once ` +
      'you are satisfied.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
