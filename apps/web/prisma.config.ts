import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads the datasource URL from here rather than from the schema.
 *
 * There is no default any more. It used to fall back to a local SQLite file so
 * that `pnpm db:push` worked on a fresh clone with no `.env`, which was worth
 * it while SQLite was the real database. Now that the app is Postgres
 * everywhere, a silent fallback would point the CLI at a different engine from
 * the one the app uses, and `db:push` would cheerfully create a schema in a
 * file nobody reads.
 *
 * The message is long because this is the first thing a new clone hits.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local and point it ' +
        'at a Postgres instance; a Neon branch is free and takes about a minute. Then run ' +
        '`pnpm --filter @stackfit/web db:push` to create the schema and `pnpm --filter ' +
        '@stackfit/web seed` for the demo sessions.',
    );
  }
  return url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: databaseUrl() },
});
