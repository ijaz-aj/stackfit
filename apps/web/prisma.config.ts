import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads the datasource URL from here rather than from the schema, so
 * the default lives in exactly one place and `pnpm db:push` works on a fresh
 * clone with no `.env` file at all.
 *
 * `DATABASE_URL` overrides it, which is how this points at Postgres once the
 * portal is hosted (PROJECT_SPEC §11 phase 10).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./stackfit.db',
  },
});
