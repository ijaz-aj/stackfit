// Which routes are public, checked as a rule rather than trusted to memory.
//
// `/` became a public landing page. Until then every page and every route
// handler in this application called `requireAnalyst()`, and CONTRIBUTING.md
// hard rule 10 describes that as authz having exactly one home: "a server
// action is a POST endpoint with a generated URL, so gating the page that
// renders its form protects nothing. The gate has to be in the action."
//
// The moment one route is deliberately ungated, that rule stops being visible
// in the code. Nothing about `page.tsx` announces which side of the line it is
// on, and the next route added next to it is the one that quietly inherits the
// wrong answer. So the line is written down here, in both directions:
//
//   - the public routes are an explicit, short list; and
//   - every route that is not on it must call `requireAnalyst()`.
//
// The second half is the one that earns its keep. It fails on a *new* gated
// route that forgot the gate, which is the failure this repo has always been
// one forgetful commit away from.
//
// The landing page gets two extra assertions of its own, because "public" and
// "safe to be public" are different claims. It must not read the database, and
// it must not run the engine: `runPipeline` returns `attribution`, which holds
// our fee, our cost base and our margin, and a route a stranger can load is the
// last place that should be one destructure away.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/app');

/**
 * Routes that are public on purpose, each with the reason.
 *
 * Adding to this list should feel like a decision. That is the point of it
 * being a list rather than an absence.
 */
const PUBLIC_ROUTES: ReadonlyMap<string, string> = new Map([
  ['page.tsx', 'the landing page: the one route a stranger is meant to reach'],
  ['signin/page.tsx', 'the sign-in form itself, which cannot require being signed in'],
  ['api/auth/[...nextauth]/route.ts', "NextAuth's own handler, which performs the sign-in"],
]);

/**
 * Files under `app/` that are not routes: layouts, error boundaries, loading
 * states. None of them is a thing a URL resolves to on its own.
 */
const NOT_A_ROUTE = /(^|\/)(layout|error|global-error|not-found|loading|template)\.tsx$/;

const routeFiles = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .map((entry) => entry.split(path.sep).join('/'))
  .filter((entry) => /(^|\/)(page\.tsx|route\.ts)$/.test(entry))
  .filter((entry) => !NOT_A_ROUTE.test(entry))
  .sort();

function read(relative: string): string {
  return readFileSync(path.join(APP, relative), 'utf8');
}

/**
 * Strip comments before matching, for the reason `vocabulary.test.ts` gives:
 * this repo explains its own decisions, so the prose recording *why* a page
 * must never call `runPipeline` necessarily contains `runPipeline`.
 *
 * It caught this test on its first run. The landing page's own header comment
 * names all three forbidden symbols while explaining that it does not use them,
 * which is the comment doing its job and the assertion doing the wrong one.
 */
function code(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('the authz boundary', () => {
  it('found the routes, so this cannot pass by sweeping an empty directory', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(8);
    expect(routeFiles).toContain('page.tsx');
    expect(routeFiles).toContain('scenarios/page.tsx');
  });

  it('gates every route that is not deliberately public', () => {
    const ungated = routeFiles
      .filter((file) => !PUBLIC_ROUTES.has(file))
      .filter((file) => !code(file).includes('requireAnalyst'));

    expect(
      ungated,
      'every page and route handler calls requireAnalyst(), or is listed in PUBLIC_ROUTES with a reason',
    ).toEqual([]);
  });

  it('keeps the public list honest: nothing on it calls requireAnalyst', () => {
    // A route on the list that gates anyway is not a bug, but it does mean the
    // list is lying about why it exists, and the reason beside it is wrong.
    const contradictions = [...PUBLIC_ROUTES.keys()]
      .filter((file) => routeFiles.includes(file))
      .filter((file) => code(file).includes('requireAnalyst'));

    expect(
      contradictions,
      'listed as public but gates anyway — remove it from PUBLIC_ROUTES',
    ).toEqual([]);
  });
});

describe('the landing page, which is public', () => {
  const source = code('page.tsx');

  it('never reads the database', () => {
    // No client name, no estate, no scenario reaches a page with no gate on it.
    expect(source).not.toMatch(/\bprisma\b/);
    expect(source).not.toMatch(/from '@\/lib\/db'/);
  });

  it('never runs the engine', () => {
    // `runPipeline` carries `attribution`: our fee, our cost base, our margin.
    // The figures on this page are a written-out worked example for exactly
    // this reason.
    expect(source).not.toMatch(/\brunPipeline\b/);
    expect(source).not.toMatch(/\bresultsFor\b/);
    expect(source).not.toMatch(/\battribution\b/);
  });

  it('says its example is an example', () => {
    // The specimen shows real-looking money. A reader who takes it for a live
    // quote has been misled by the page, which is the one thing this product
    // spends its whole design avoiding. Read from the rendered source rather
    // than `code()`: this string is content, not a comment about content.
    expect(read('page.tsx')).toMatch(/Worked example/);
  });
});
