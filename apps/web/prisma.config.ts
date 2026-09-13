// Must be first: it loads .env.local / .env, which the Prisma CLI does not.
import './scripts/load-env';

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
    // `generate` is the one command here that never opens a connection: it
    // reads the schema and writes TypeScript. It has to run on the deployment
    // host, because the generated client is gitignored and so is absent from a
    // fresh checkout, and it runs as part of `next build`. Demanding a URL for
    // it would make building the app require a database, which docs/DEPLOY.md
    // records as deliberately untrue and which the lazy client exists to avoid.
    //
    // Narrow on purpose. Every command that does connect still gets the error
    // below rather than a placeholder pointing at nothing, which is the failure
    // the comment above this function is about.
    if (process.argv.includes('generate')) return 'postgresql://generate-only';

    throw new Error(
      'DATABASE_URL is not set, and apps/web/.env.local and apps/web/.env were both checked. ' +
        'Copy apps/web/.env.example to apps/web/.env.local and point it at a Postgres instance: ' +
        '`docker compose up -d` gives you one locally, or a Neon branch is free and takes about ' +
        'a minute.',
    );
  }
  return url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: databaseUrl() },
});
