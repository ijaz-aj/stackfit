// Flat config (ESLint 9). Deliberately small: TypeScript recommended rules plus a
// few project guardrails. Prettier owns formatting, so eslint-config-prettier
// disables every stylistic rule that would fight it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/node_modules/**',
      // Prisma writes its client into the app's source tree; it is generated
      // code held to the generator's standards, not this repo's.
      'apps/web/src/generated/**',
      // Editor tooling, not this repo's source: agent helpers and vendored
      // third-party skills. They are CommonJS scripts run by Node directly, so
      // every `require`, `process` and `console` in them is a `no-undef` error
      // under this config's browser/ESM assumptions — 170 of them, which is
      // enough noise to make `pnpm lint` useless as a signal. Nothing here
      // ships, and `.claude/skills/` is gitignored besides.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // No default exports outside Next.js route files (CONTRIBUTING.md convention).
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'No default exports (CONTRIBUTING.md convention). Next.js route files override this locally.',
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Next.js discovers pages, layouts, configs, metadata routes and middleware
    // by default export. This is the override CONTRIBUTING.md's convention
    // already anticipated. `robots`, `sitemap` and `manifest` are the metadata
    // routes: ordinary modules by their filename, public endpoints by their
    // behaviour, and Next will not find them under any other export name.
    files: [
      'apps/web/src/app/**/{page,layout,loading,error,global-error,not-found,template,default,route,robots,sitemap,manifest}.tsx',
      'apps/web/src/app/**/{page,layout,loading,error,global-error,not-found,template,default,route,robots,sitemap,manifest}.ts',
      'apps/web/src/proxy.ts',
      'apps/web/*.config.{ts,mjs}',
      'apps/web/prisma.config.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Config and script files run in Node and legitimately use default exports.
    files: ['*.config.{js,mjs,ts}', 'scripts/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
);
