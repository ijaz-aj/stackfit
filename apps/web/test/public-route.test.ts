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
// `/` gets extra assertions of its own, because "public" and "safe to be
// public" are different claims. It must read nothing at all, and it must not
// run the engine: `runPipeline` returns `attribution`, which holds our fee, our
// cost base and our margin, and a route a stranger can load is the last place
// that should be one destructure away.
//
// It was a landing page for a day. It is now a door, and the assertions below
// grew a word budget to keep it one — see the second describe block.

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
  ['page.tsx', 'the door: a wordmark, one sentence and the way in, and nothing else'],
  ['signin/page.tsx', 'the sign-in form itself, which cannot require being signed in'],
  ['api/auth/[...nextauth]/route.ts', "NextAuth's own handler, which performs the sign-in"],
  ['robots.ts', 'robots.txt, which a crawler fetches before it is anybody at all'],
]);

/**
 * Files under `app/` that are not routes: layouts, error boundaries, loading
 * states. None of them is a thing a URL resolves to on its own.
 */
const NOT_A_ROUTE = /(^|\/)(layout|error|global-error|not-found|loading|template)\.tsx$/;

/*
 * What resolves to a URL under `app/`.
 *
 * `page.tsx` and `route.ts` are the obvious two. Next's *metadata* routes are
 * the ones worth naming explicitly: `robots.ts`, `sitemap.ts` and `manifest.ts`
 * are ordinary modules by their filename and public endpoints by their
 * behaviour, and a sweep that only looked for pages and handlers would let one
 * be added with no gate and no entry on the list above. Listed here so that
 * adding one is a decision, which is the whole point of this file.
 */
const ROUTE_FILE = /(^|\/)(page\.tsx|route\.ts|robots\.ts|sitemap\.ts|manifest\.ts)$/;

const routeFiles = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .map((entry) => entry.split(path.sep).join('/'))
  .filter((entry) => ROUTE_FILE.test(entry))
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

// The door at `/` and the page that used to be there.
//
// `/` was a seven-band landing page explaining what the company scopes, which
// vendors it prices and what a stack costs a client to run. That is
// documentation for a colleague and reconnaissance for anybody else, so it
// moved to `/about` behind the gate, and `/` became a wordmark, one sentence
// and the way in.
//
// Obscurity was never the point and was never available: Vercel publishes every
// certificate it issues to Certificate Transparency logs, which bots read
// continuously, so the hostname is public whatever the page says. The point is
// that arriving at it teaches you nothing.
//
// These assertions are what stop that eroding one helpful sentence at a time.

describe('the door, which is public', () => {
  const source = code('page.tsx');

  it('reads nothing at all', () => {
    // Not just "no database". The catalog counts that used to be here were
    // harmless in themselves, and are gone on principle: the public surface
    // should be a surface, not a query. `engineData` is the loader they came
    // through, and it reads the filesystem.
    expect(source).not.toMatch(/\bprisma\b/);
    expect(source).not.toMatch(/from '@\/lib\/db'/);
    expect(source).not.toMatch(/\bengineData\b/);
  });

  it('never runs the engine', () => {
    // `runPipeline` carries `attribution`: our fee, our cost base, our margin.
    expect(source).not.toMatch(/\brunPipeline\b/);
    expect(source).not.toMatch(/\bresultsFor\b/);
    expect(source).not.toMatch(/\battribution\b/);
  });

  it('stays short enough that nobody can hide a paragraph in it', () => {
    // A budget, deliberately crude. Every sentence added to this file is a
    // sentence published to anyone who finds the host, and the failure mode is
    // not one bad commit — it is somebody helpfully restoring "just the
    // summary", then "just the counts", a year apart. Rendered text only:
    // the comments explaining all of this are long and should be.
    const rendered = read('page.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
    const words = (rendered.match(/>[^<>{}]*</g) ?? []).join(' ').split(/\s+/).filter(Boolean);

    expect(words.length, 'the door has grown copy — is it still just a door?').toBeLessThan(90);
  });

  it('names no vendor, no framework and no figure', () => {
    // The three things the old page said that were worth reading, and the three
    // a stranger should not be handed.
    const rendered = read('page.tsx');
    for (const leak of [
      /CrowdStrike|Wazuh|Sentinel|Nessus|Microsoft/i,
      /HIPAA|PCI|NIST|ISO 27001/i,
      /\$[\d,]{4,}/,
    ]) {
      expect(rendered, `the door mentions ${leak.source}`).not.toMatch(leak);
    }
  });
});

describe('the page that moved behind the gate', () => {
  it('says its example is an example', () => {
    // The specimen shows real-looking money. A reader who takes it for a live
    // quote has been misled by the page, which is the one thing this product
    // spends its whole design avoiding. Still asserted after the move: being
    // behind a login does not make an indicative figure a quote.
    expect(read('about/page.tsx')).toMatch(/Worked example/);
  });
});
