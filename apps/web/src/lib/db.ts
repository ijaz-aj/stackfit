import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from '@/generated/prisma/client';

/**
 * The one Prisma client.
 *
 * Zero setup by default: no `DATABASE_URL`, no `.env`, just a SQLite file next
 * to the app. The same variable is what points this at Postgres when the portal
 * is hosted.
 */
const databaseUrl = process.env.DATABASE_URL ?? 'file:./stackfit.db';

// Next's dev server re-evaluates modules on every edit. Without this the app
// would open a new SQLite handle per hot reload until it ran out of them.
const globalForPrisma = globalThis as unknown as { stackfitPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.stackfitPrisma ??
  new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.stackfitPrisma = prisma;
}
