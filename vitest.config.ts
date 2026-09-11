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
      {
        // PROJECT_SPEC §3: "UI gets smoke tests only". These cover the app's
        // logic — defaults, the storage boundary, the money boundary and the
        // estimate projection — and deliberately not its JSX, which would need
        // a DOM, a component library of test helpers, and would assert layout
        // rather than behaviour.
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
});
