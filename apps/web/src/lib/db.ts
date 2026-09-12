import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

/**
 * `DATABASE_URL`, required, with no fallback.
 *
 * It used to fall back to a local SQLite file, which made a fresh clone work
 * with no setup and was the right trade while SQLite was the real database. It
 * is the wrong one now: a missing variable on a host would open a scratch
 * database on a disk that is discarded between requests, the app would appear
 * to work, and saved sessions would vanish with no error anywhere. Refusing is
 * the smaller failure, and it surfaces on the first request rather than on the
 * first lost scenario.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. This app stores saved scoping sessions in Postgres; there is no ' +
        'local fallback, because a fallback is how a deployment quietly loses data. Copy ' +
        'apps/web/.env.example to apps/web/.env.local and point it at a Postgres instance (a ' +
        'Neon branch is free and takes a minute), then run `pnpm --filter @stackfit/web db:push`.',
    );
  }
  return url;
}

// Next's dev server re-evaluates modules on every edit, and a serverless host
// re-enters this module on every cold start. Without this, each one opens
// another connection pool against the same database.
const globalForPrisma = globalThis as unknown as { stackfitPrisma?: PrismaClient };

function connect(): PrismaClient {
  const existing = globalForPrisma.stackfitPrisma;
  if (existing !== undefined) return existing;

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
  if (process.env.NODE_ENV !== 'production') globalForPrisma.stackfitPrisma = client;
  return client;
}

/**
 * The one Prisma client, connected on first use rather than on import.
 *
 * The laziness is not a micro-optimisation, it is what lets the app build
 * without a database. `next build` imports every route to collect its
 * configuration, so a client constructed at module scope made `DATABASE_URL` a
 * *build-time* requirement: the build failed with "Failed to collect
 * configuration for /" and the connection error three frames down. A build
 * that cannot run without a live database is a build that cannot run in CI, in
 * a container image, or in any host that builds before the environment is
 * attached.
 *
 * A Proxy rather than a `getPrisma()` function so that the nine call sites stay
 * as they are: `prisma.scenario.findMany(...)` reads the same and connects on
 * the property access. Methods are bound to the real client, because Prisma's
 * delegates rely on their own `this`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = connect() as unknown as Record<string | symbol, unknown>;
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
