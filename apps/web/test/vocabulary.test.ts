// One word for one thing, on every surface a client can see.
//
// The audit in docs/WEB-AUDIT.md found three nouns doing two jobs each. The
// object the URL, the database and the engine all call a *scenario* was called
// a "session" in 54 places of user-facing copy. The three things a client
// chooses between were "bundles", which is an internal word, and one of them
// was "Phase 2", which is also what the roadmap's own column is headed.
//
// None of that confused anyone for long. That is exactly why it survived: it
// is the kind of drift a reader silently absorbs and a client on a screen-share
// silently wonders about, and no test was ever going to fail because of it.
//
// So this is a lint, not a unit test. It reads the source of every component
// and page, pulls out the strings a user can actually read — JSX text, and the
// values of the props that render as text — and fails on a banned word. Code
// identifiers are deliberately out of scope: `session.server.ts`, NextAuth's
// own session, and the `sessions` variable in the command palette are all
// correct and none of them reaches a screen.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Props whose value is rendered to the reader as words. */
const TEXT_PROPS = ['title', 'hint', 'label', 'detail', 'aria-label', 'empty', 'placeholder'];

const BANNED: readonly { word: RegExp; instead: string }[] = [
  {
    word: /\bsessions?\b/i,
    instead: '"scenario" — what the URL, the database and the engine all call it',
  },
  {
    word: /\bbundles?\b/i,
    instead: '"option" — what a client calls the thing they are choosing between',
  },
  {
    word: /\bphase 2\b/i,
    instead: '"deferred" — the roadmap already uses "phase" for delivery sequencing',
  },
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'generated') continue;
      found.push(...sourceFiles(path));
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Strip comments before reading anything else.
 *
 * This repo comments heavily and explains its own history, so the prose
 * recording *why* a word was replaced necessarily contains that word. Those
 * comments are the point; they must not fail the lint they document.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/** Everything in this file a reader could actually end up looking at. */
function readableStrings(source: string): string[] {
  const code = withoutComments(source);
  const strings: string[] = [];

  // JSX text nodes: what sits between tags, minus anything interpolated.
  for (const match of code.matchAll(/>([^<>{}]+)</g)) {
    const text = match[1]?.trim();
    if (text !== undefined && /[A-Za-z]{3}/.test(text)) strings.push(text);
  }

  // The props that render as words, quoted or in a template literal.
  for (const prop of TEXT_PROPS) {
    const pattern = new RegExp(`\\b${prop}=(?:"([^"]*)"|\\{\`([^\`]*)\`\\}|\\{'([^']*)'\\})`, 'g');
    for (const match of code.matchAll(pattern)) {
      const value = match[1] ?? match[2] ?? match[3];
      if (value !== undefined && value.trim() !== '') strings.push(value);
    }
  }

  return strings;
}

describe('the words on screen', () => {
  const files = sourceFiles(SRC);

  it('has source to read, so this cannot pass by finding nothing', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((file) => file.endsWith('page.tsx'))).toBe(true);
  });

  for (const { word, instead } of BANNED) {
    it(`never shows the reader ${word.source}`, () => {
      const offences: string[] = [];

      for (const file of files) {
        for (const text of readableStrings(readFileSync(file, 'utf8'))) {
          if (word.test(text)) {
            offences.push(`${file.slice(SRC.length + 1)}: ${text.slice(0, 90)}`);
          }
        }
      }

      expect(offences, `use ${instead}`).toEqual([]);
    });
  }
});
