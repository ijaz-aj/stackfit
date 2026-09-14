// The front door's copy, pinned where it is a decision rather than a phrasing.
//
// `public-route.test.ts` covers what each route may *do* and how much the
// public door may *say*. This covers what the way in is *called*, which is a
// smaller claim but the one that rots first: marketing copy is the part of a
// codebase nobody reviews twice, and the part a client reads first.
//
// The label is now on two routes that never render together — the door at `/`
// and `/about` behind the gate — which is exactly the condition under which two
// names for one destination appear. It survived one such split already: before
// this, `/` carried "Sign in" in its masthead and both "Open the portal" and
// "Sign in" in its closing card, three controls pointing at `/scenarios` under
// two names.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const FILES = {
  component: join(SRC, 'components', 'portal-link.tsx'),
  door: join(SRC, 'app', 'page.tsx'),
  about: join(SRC, 'app', 'about', 'page.tsx'),
} as const;

/**
 * Strip comments first, for the reason `vocabulary.test.ts` and
 * `public-route.test.ts` both give: this repo explains its own decisions, so
 * the prose recording *why* the button is not called "Sign in" necessarily
 * contains the words "Sign in".
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

const everywhere = Object.values(FILES).map(code).join('\n');

describe('the way into the portal', () => {
  it('is named in exactly one place', () => {
    const declarations = [...everywhere.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);

    expect(declarations).toEqual(['Open the portal']);
  });

  it('is reached through the shared component on both routes', () => {
    for (const [name, file] of Object.entries(FILES)) {
      if (name === 'component') continue;
      expect(code(file), `${name} draws the CTA by hand`).toMatch(/<PortalLink\b/);
    }

    // Nothing links to the portal or the sign-in form any other way.
    expect(everywhere).not.toMatch(/href="\/scenarios"/);
    expect(everywhere).not.toMatch(/href="\/signin"/);
  });

  it('does not name the turnstile', () => {
    // "Sign in" describes a step that does not always happen: `authEnabled()`
    // is false on a local install and an analyst holding a session never sees a
    // form. A button labelled for it is a button that lies about where it goes.
    const labels = [...everywhere.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1] ?? '');

    for (const label of labels) {
      expect(label.toLowerCase(), 'name the destination, not the gate').not.toMatch(
        /sign[- ]?in|log[- ]?in/,
      );
    }
  });

  it('tells a stranger at the door who the portal is for', () => {
    // The button names the destination; the door has to name the audience, or
    // it is quietly selling a way in to someone who has no account. This is the
    // door's entire disclosure and it should stay.
    expect(readFileSync(FILES.door, 'utf8')).toMatch(/limited to named analysts/i);
  });
});

describe('the counted figures on /about', () => {
  it('counts the catalog rather than quoting it', () => {
    // Hard rule 2's habit, applied to prose: a number typed into a sentence is
    // stale the first time someone adds a product.
    const about = code(FILES.about);
    for (const counted of ['productCount', 'categoryCount', 'frameworkCount', 'controlCount']) {
      expect(about, `${counted} is rendered, not hardcoded`).toContain(`{${counted}}`);
    }
  });

  it('names the categories rather than quoting the schema at the reader', () => {
    // These rendered the raw enum — `vulnerability_management`, `ngfw` — in
    // monospace, directly under a sentence calling them "categories, from SIEM
    // to deception". `CATEGORY_LABELS` is what the wizard and the dashboard
    // already read.
    expect(code(FILES.about)).toContain('CATEGORY_LABELS[category]');
  });
});
