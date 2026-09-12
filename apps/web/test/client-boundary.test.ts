// The server/client boundary, checked as a rule rather than discovered again.
//
// `cost-breakdown.tsx` is a server component. It imported a plain helper from
// `cost-charts.tsx`, which carries `'use client'`, and called it. Every export
// of a client module is a *client reference* once a server component imports
// it, so the call threw at render time and the results page fell through to the
// error boundary.
//
// Nothing existing caught it. `tsc` types a client reference as the function it
// stands for, so typecheck was clean. eslint has no rule for it. The charts'
// own tests import the same module directly, which is legal, so 533 tests were
// green against a page that would not render. It is a runtime-only violation
// that only shows up in the server render — which is to say, only in a browser.
//
// This is the rule instead: a module without `'use client'` may import
// components and types from one, and nothing else.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

// `readdirSync` recursively rather than a glob package: this repo does not have
// one as a direct dependency and a boundary test is not a reason to add one.
// `generated/` is the Prisma client, which is neither ours nor small.
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((entry) => /\.tsx?$/.test(entry) && !entry.split(path.sep).includes('generated'))
  .map((entry) => path.normalize(path.join(SRC, entry)));

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** A directive has to be the first statement, so the first 200 bytes settle it. */
function isClientModule(file: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(
    read(file).slice(0, 400),
  );
}

const clientModules = new Set(files.filter(isClientModule));

/** What a bare specifier in this app resolves to on disk, or null if nothing. */
function resolve(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (base === null) return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    const normalised = path.normalize(candidate);
    if (files.includes(normalised)) return normalised;
  }
  return null;
}

interface Import {
  readonly specifier: string;
  /** Named bindings, with `type`-only ones already dropped. */
  readonly values: readonly string[];
}

/**
 * Value imports, per statement.
 *
 * Type imports are erased by the compiler and never reach the client reference,
 * so both `import type { X }` and an inline `{ type X }` are dropped here.
 * Default and namespace imports are not parsed: this app has no default exports
 * outside Next's own route files, and `import * as` from a client module would
 * be its own conversation.
 */
function valueImports(source: string): Import[] {
  const found: Import[] = [];
  const pattern = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) continue; // `import type { … }`

    const values = match[2]!
      .split(',')
      .map((binding) => binding.trim())
      .filter((binding) => binding.length > 0 && !binding.startsWith('type '))
      // `Foo as Bar` — what matters is the exported name on the left.
      .map((binding) => binding.split(/\s+as\s+/)[0]!.trim());

    if (values.length > 0) found.push({ specifier: match[3]!, values });
  }
  return found;
}

/**
 * A React component, by the only convention that survives compilation: a
 * capital first letter. `SomeChart` may cross the boundary because React
 * renders a client reference as an element. `someHelper` may not, because
 * calling one throws.
 */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

describe('the server/client boundary', () => {
  it('finds both kinds of module, so the sweep below means something', () => {
    // A resolver that silently matched nothing would make every assertion here
    // vacuously true, which is how a boundary test quietly stops working.
    expect(files.length).toBeGreaterThan(30);
    expect(clientModules.size).toBeGreaterThan(5);
    expect(files.length - clientModules.size).toBeGreaterThan(10);
  });

  it('never lets a server module import a non-component value from a client one', () => {
    const violations: string[] = [];

    for (const file of files) {
      if (clientModules.has(file)) continue; // client → client is fine.

      for (const statement of valueImports(read(file))) {
        const target = resolve(file, statement.specifier);
        if (target === null || !clientModules.has(target)) continue;

        for (const name of statement.values) {
          if (isComponentName(name)) continue;
          violations.push(
            `${path.relative(SRC, file)} imports { ${name} } from '${statement.specifier}' ` +
              `(${path.relative(SRC, target)} is 'use client'). ` +
              `Calling it on the server throws; move it to a module with no directive.`,
          );
        }
      }
    }

    expect(violations, `\n${violations.join('\n')}\n`).toEqual([]);
  });
});
