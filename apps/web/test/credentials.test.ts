// Password sign-in, tested for what it refuses.
//
// The allowlist tests next door exist because that function is the one that
// grants access to an OAuth identity. This one *is* the whole check for a
// credential login: nothing else stands between a posted form and a session,
// so every way a malformed variable could admit a stranger belongs here.

import { describe, expect, it } from 'vitest';

import {
  credentialsConfigured,
  parseCredentialUsers,
  verifyCredentials,
} from '../src/lib/credentials';

describe('parsing the credential list', () => {
  it('reads one account', () => {
    expect(parseCredentialUsers('analyst@example.com:hunter2')).toEqual([
      { email: 'analyst@example.com', password: 'hunter2' },
    ]);
  });

  it('reads several, comma or newline separated', () => {
    expect(parseCredentialUsers('a@example.com:one,b@example.com:two')).toHaveLength(2);
    expect(parseCredentialUsers('a@example.com:one\nb@example.com:two')).toHaveLength(2);
  });

  it('lower-cases the address, so a capitalised one still signs in', () => {
    expect(parseCredentialUsers('Analyst@Example.COM:pw')[0]?.email).toBe('analyst@example.com');
  });

  it('leaves the password exactly as written', () => {
    // Lower-casing a password would silently weaken every account.
    expect(parseCredentialUsers('a@example.com:PaSsWoRd')[0]?.password).toBe('PaSsWoRd');
  });

  it('splits at the first colon, so a password may contain one', () => {
    expect(parseCredentialUsers('a@example.com:pa:ss')[0]?.password).toBe('pa:ss');
  });

  it('drops an entry with an empty password rather than creating one', () => {
    // 'a@example.com:' is a truncated line in a hand-edited variable. Accepting
    // it would be an account whose password is the empty string.
    expect(parseCredentialUsers('a@example.com:')).toEqual([]);
  });

  it('drops an entry with no colon and one with no address', () => {
    expect(parseCredentialUsers('a@example.com')).toEqual([]);
    expect(parseCredentialUsers(':pw')).toEqual([]);
  });

  it('drops blank entries left by trailing separators', () => {
    expect(parseCredentialUsers('a@example.com:pw,,')).toHaveLength(1);
    expect(parseCredentialUsers(',')).toEqual([]);
  });

  it('is empty when unset, which is what keeps this feature off by default', () => {
    expect(parseCredentialUsers(undefined)).toEqual([]);
    expect(parseCredentialUsers('')).toEqual([]);
  });
});

describe('verifying a sign-in', () => {
  const users = parseCredentialUsers('analyst@example.com:correct-horse');

  it('accepts the right pair', () => {
    expect(verifyCredentials('analyst@example.com', 'correct-horse', users)).not.toBeNull();
  });

  it('accepts a differently-cased address', () => {
    expect(verifyCredentials('Analyst@Example.com', 'correct-horse', users)).not.toBeNull();
  });

  it('refuses the wrong password', () => {
    expect(verifyCredentials('analyst@example.com', 'correct-horses', users)).toBeNull();
  });

  it('refuses a password differing only in case', () => {
    expect(verifyCredentials('analyst@example.com', 'Correct-Horse', users)).toBeNull();
  });

  it('refuses an unknown address', () => {
    expect(verifyCredentials('nobody@example.com', 'correct-horse', users)).toBeNull();
  });

  it('refuses empty and missing input', () => {
    expect(verifyCredentials('analyst@example.com', '', users)).toBeNull();
    expect(verifyCredentials('', '', users)).toBeNull();
    expect(verifyCredentials(undefined, undefined, users)).toBeNull();
  });

  it('refuses everything when no accounts exist', () => {
    // The empty list must behave like the empty allowlist: it admits nobody,
    // including a caller who passes empty strings that would otherwise match.
    expect(verifyCredentials('analyst@example.com', 'correct-horse', [])).toBeNull();
    expect(verifyCredentials('', '', [])).toBeNull();
  });
});

describe('whether the instance offers passwords at all', () => {
  it('is false with no variable, and false with an unusable one', () => {
    expect(credentialsConfigured({})).toBe(false);
    expect(credentialsConfigured({ STACKFIT_CREDENTIAL_USERS: '' })).toBe(false);
    expect(credentialsConfigured({ STACKFIT_CREDENTIAL_USERS: 'a@example.com:' })).toBe(false);
  });

  it('is true once one account parses', () => {
    expect(credentialsConfigured({ STACKFIT_CREDENTIAL_USERS: 'a@example.com:pw' })).toBe(true);
  });
});
