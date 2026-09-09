import { defineConfig } from 'vitest/config';

// One Vitest project per package. `pnpm test` runs all of them; `pnpm test:engine`
// (vitest run --project engine) runs just the fast engine unit tests.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'engine',
          root: './packages/engine',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'schema',
          root: './packages/schema',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        // Validates the committed data/ tree. Lives at the repo root because it
        // reads files, which package-level tests deliberately do not.
        test: {
          name: 'data',
          root: './',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
});
