// Flat config (ESLint 9). Deliberately small: TypeScript recommended rules plus a
// few project guardrails. Prettier owns formatting, so eslint-config-prettier
// disables every stylistic rule that would fight it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.next/**', '**/node_modules/**'],
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
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
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
