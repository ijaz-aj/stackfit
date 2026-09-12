import { fileURLToPath } from 'node:url';

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
        // logic, defaults, the storage boundary, the money boundary and the
        // estimate projection, and deliberately not its JSX, which would need
        // a DOM, a component library of test helpers, and would assert layout
        // rather than behaviour.
        // The `@/` alias Next resolves from tsconfig paths. Vitest does not read
        // those, and the app's own components use it, so without this a test
        // that imports a component fails to resolve rather than failing to pass.
        resolve: {
          alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
        },
        test: {
          name: 'web',
          root: './apps/web',
          // Node by default; the chart smoke tests opt into jsdom per file,
          // because Recharts measures a container and there is no other way to
          // observe an axis label outside a browser.
          environment: 'node',
          include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
        },
      },
    ],
  },
});
