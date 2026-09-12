// Telling two scoping sessions apart.
//
// The list shows a name, an industry, a headcount and a currency. For two
// sessions started from the same preset all four are identical, so the only
// thing distinguishing them was a timestamp — next to a Delete button.

import { describe, expect, it } from 'vitest';

import { uniqueScenarioName } from '../src/lib/scenario';

describe('naming a new session', () => {
  it('leaves the name alone when nothing else is using it', () => {
    // The common case is one session per client, and it must never see a
    // suffix.
    expect(uniqueScenarioName('Acme Health', [])).toBe('Acme Health');
    expect(uniqueScenarioName('Acme Health', ['Other client'])).toBe('Acme Health');
  });

  it('numbers the second one from 2, not 1', () => {
    // The existing session is implicitly the first, which is how a person
    // numbers a second copy of something.
    expect(uniqueScenarioName('Acme Health', ['Acme Health'])).toBe('Acme Health (2)');
  });

  it('keeps counting past the second', () => {
    expect(uniqueScenarioName('Acme Health', ['Acme Health', 'Acme Health (2)'])).toBe(
      'Acme Health (3)',
    );
  });

  it('fills a gap rather than always taking the highest number', () => {
    // (2) was deleted. Reusing it is better than jumping to (4) and leaving a
    // list that looks like it lost something.
    expect(uniqueScenarioName('Acme Health', ['Acme Health', 'Acme Health (3)'])).toBe(
      'Acme Health (2)',
    );
  });

  it('compares case-insensitively and ignores surrounding space', () => {
    // "acme health" and "Acme Health" are the same client to everyone except a
    // string comparison.
    expect(uniqueScenarioName('Acme Health', ['  acme health  '])).toBe('Acme Health (2)');
    expect(uniqueScenarioName('  Acme Health  ', ['Acme Health'])).toBe('Acme Health (2)');
  });

  it('handles the clone convention, which had the same collision', () => {
    // Cloning one session twice produced two rows both called "… (copy)".
    expect(uniqueScenarioName('Acme Health (copy)', ['Acme Health', 'Acme Health (copy)'])).toBe(
      'Acme Health (copy) (2)',
    );
  });

  it('never returns a name that is already taken', () => {
    const taken = ['Dup', ...Array.from({ length: 50 }, (_, index) => `Dup (${index + 2})`)];
    const result = uniqueScenarioName('Dup', taken);
    expect(taken.map((name) => name.toLowerCase())).not.toContain(result.toLowerCase());
  });
});
