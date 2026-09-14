// The front door's copy, pinned where it is a decision rather than a phrasing.
//
// `public-route.test.ts` covers what the landing page must never *do* (touch
// the database, run the engine). This covers what it must never *say*, which is
// a smaller claim but the one that rots first: marketing copy is the part of a
// codebase nobody reviews twice, and the part a client reads first.
//
// Three things are asserted, and each of them is a decision somebody made on
// purpose and a later editor could undo without noticing:
//
//   1. The way in is called the same thing in all three places it appears.
//   2. It is not called "Sign in".
//   3. The counts in the copy are counted, not typed.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'page.tsx');
const source = readFileSync(PAGE, 'utf8');

/**
 * Strip comments first, for the reason `vocabulary.test.ts` and
 * `public-route.test.ts` both give: this repo explains its own decisions, so
 * the prose recording *why* the button is not called "Sign in" necessarily
 * contains the words "Sign in".
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('the way into the portal', () => {
  it('is named in exactly one place', () => {
    // The label was typed out three times: a text link in the masthead, and two
    // buttons in the closing card that pointed at the same route under two
    // different names. One constant is what stops them drifting again.
    const declarations = [...code.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]);

    expect(declarations).toEqual(['Open the portal']);
  });

  it('is reached through the shared component everywhere it appears', () => {
    // Three placements: masthead, hero, closing card. If a fourth link to
    // `/scenarios` is ever added by hand, this is what notices.
    const uses = code.match(/<PortalLink\b/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);

    // Nothing links to the portal any other way.
    expect(code).not.toMatch(/href="\/scenarios"/);
    expect(code).not.toMatch(/href="\/signin"/);
  });

  it('does not name the turnstile', () => {
    // "Sign in" describes a step that does not always happen: `authEnabled()`
    // is false on a local install and an analyst holding a session never sees a
    // form. A button labelled for it is a button that lies about where it goes.
    const labels = [...code.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1] ?? '');

    for (const label of labels) {
      expect(label.toLowerCase(), 'name the destination, not the gate').not.toMatch(
        /sign[- ]?in|log[- ]?in/,
      );
    }
  });

  it('does not talk about signing in anywhere on the page', () => {
    // This assertion used to be its exact inverse. It required two captions
    // reading "For named analysts. Sign-in is handled on the way through",
    // on the grounds that a button naming a destination should have something
    // beside it naming the audience, or the page is selling a door most readers
    // cannot open.
    //
    // That reasoning is right for a page with strangers on it, and this page has
    // none: it is the front of an internal tool and everyone reading it works
    // here. Warning a colleague about a password box they see once, and then
    // not again for the thirty days a session lasts, is noise about the one part
    // of the product that is not the product.
    //
    // The gate is untouched and is not what this asserts. `/scenarios` runs
    // `requireAnalyst()` like every other route, and `public-route.test.ts` is
    // what holds that. This only says the front page does not dwell on it.
    const rendered = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
    const text = (rendered.match(/>[^<>{}]*</g) ?? []).join(' ');

    // Word-bounded, and it has to be: the unbounded version failed on the
    // intake band's "Firewalls dominate log ingest", where `log[- ]?in` is
    // happily sitting inside "log in|gest". A lint on prose that also fires on
    // a sentence about log volumes would have been turned off within a week.
    expect(text, 'the landing page has started explaining the login again').not.toMatch(
      /\bsign[- ]?in\b|\blog[- ]?in\b|\bpassword\b/i,
    );
  });
});

describe('the counted figures', () => {
  it('counts the catalog rather than quoting it', () => {
    // Hard rule 2's habit, applied to marketing copy: a number typed into prose
    // is stale the first time someone adds a product, and this is the one page
    // where a stranger has no way to check it.
    for (const counted of ['productCount', 'categoryCount', 'frameworkCount', 'controlCount']) {
      expect(code, `${counted} is rendered, not hardcoded`).toContain(`{${counted}}`);
    }
  });

  it('labels the specimen figures as a worked example', () => {
    // The hero card shows real-looking money that is not live. Duplicated from
    // `public-route.test.ts` on purpose: that file guards the route's safety,
    // this one guards its copy, and the two travel separately.
    expect(source).toMatch(/Worked example/);
    expect(source).toMatch(/not a live quote/);
  });
});
