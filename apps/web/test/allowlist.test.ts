// Who gets in.
//
// This is the one function in the authentication path that actually grants
// access, so it is tested for what it refuses rather than only for what it
// permits. Every case below is a way an internal portal holding prospective
// clients' asset inventories could have become readable by a stranger.

import { describe, expect, it } from 'vitest';

import {
  assertAuthConfiguredInProduction,
  isAllowed,
  isAuthConfigured,
  parseAllowlist,
} from '../src/lib/allowlist';

describe('parsing the allowlist', () => {
  it('reads a comma-separated list', () => {
    expect(parseAllowlist('a@example.com,b@example.com')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('tolerates the spacing a human actually types', () => {
    expect(parseAllowlist(' a@example.com , b@example.com ')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('lower-cases, so a capitalised address does not lock a colleague out', () => {
    expect(parseAllowlist('Analyst@Example.COM')).toEqual(['analyst@example.com']);
  });

  it('drops empty entries rather than admitting one', () => {
    // 'a@example.com,,' must not yield an empty string that then matches an
    // empty email. Trailing commas in a hand-edited env var are routine.
    expect(parseAllowlist('a@example.com,,')).toEqual(['a@example.com']);
    expect(parseAllowlist(',')).toEqual([]);
    expect(parseAllowlist('   ')).toEqual([]);
  });

  it('treats an unset variable as an empty list', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
  });
});

describe('deciding who may sign in', () => {
  const allowlist = parseAllowlist('analyst@example.com, lead@example.com');

  it('admits an address on the list', () => {
    expect(isAllowed('analyst@example.com', allowlist)).toBe(true);
  });

  it('admits it regardless of case or surrounding space', () => {
    expect(isAllowed('  Analyst@Example.com ', allowlist)).toBe(true);
  });

  it('refuses an address that is not on the list', () => {
    expect(isAllowed('stranger@example.com', allowlist)).toBe(false);
  });

  it('refuses a near miss rather than matching loosely', () => {
    // No substring, prefix or domain matching. "analyst@example.com.evil.tld"
    // contains an allowed address and must not be treated as one.
    expect(isAllowed('analyst@example.com.evil.tld', allowlist)).toBe(false);
    expect(isAllowed('notanalyst@example.com', allowlist)).toBe(false);
    expect(isAllowed('analyst@example.co', allowlist)).toBe(false);
    expect(isAllowed('@example.com', allowlist)).toBe(false);
  });

  it('refuses a provider that returned no email', () => {
    // An OAuth account without a verified email still authenticates
    // successfully. It must not authorise.
    expect(isAllowed(null, allowlist)).toBe(false);
    expect(isAllowed(undefined, allowlist)).toBe(false);
    expect(isAllowed('', allowlist)).toBe(false);
    expect(isAllowed('   ', allowlist)).toBe(false);
  });

  it('ADMITS NOBODY when the allowlist is empty', () => {
    // The most important assertion here. A missing or misspelled environment
    // variable is a configuration failure, and the safe reading of a
    // configuration failure in an access check is "no". Reading "no list" as
    // "everyone" would turn one typo in a hosting dashboard into a full data
    // exposure that looked, from the outside, like everything working.
    for (const email of ['analyst@example.com', 'anyone@anywhere.tld', '', null, undefined]) {
      expect(isAllowed(email, []), `${String(email)} got in through an empty allowlist`).toBe(false);
    }
  });
});

describe('whether authentication is configured', () => {
  const secret = { NEXTAUTH_SECRET: 'a-secret' };
  const google = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
  const github = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' };

  it('needs a secret and at least one provider', () => {
    expect(isAuthConfigured({ ...secret, ...google })).toBe(true);
    expect(isAuthConfigured({ ...secret, ...github })).toBe(true);
  });

  it('is not configured by a provider alone', () => {
    // Without a secret the session cookie cannot be signed, so a provider on
    // its own is not a working configuration.
    expect(isAuthConfigured({ ...google })).toBe(false);
  });

  it('is not configured by half a provider', () => {
    expect(isAuthConfigured({ ...secret, GOOGLE_CLIENT_ID: 'id' })).toBe(false);
    expect(isAuthConfigured({ ...secret, GITHUB_CLIENT_SECRET: 'secret' })).toBe(false);
  });

  it('treats an empty string as unset, which is how a host stores a blank field', () => {
    expect(isAuthConfigured({ NEXTAUTH_SECRET: '', ...google })).toBe(false);
    expect(isAuthConfigured({ ...secret, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' })).toBe(
      false,
    );
  });

  it('is unconfigured on a bare local install, which is allowed', () => {
    // Zero setup is a documented property of this repo: `pnpm dev` works with
    // no .env file at all. That stays true.
    expect(isAuthConfigured({})).toBe(false);
  });
});

describe('refusing to start a hosted instance with the door open', () => {
  const complete = {
    NODE_ENV: 'production',
    NEXTAUTH_SECRET: 'a-secret',
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    STACKFIT_ALLOWED_EMAILS: 'analyst@example.com',
  };

  it('starts when production is fully configured', () => {
    expect(() => assertAuthConfiguredInProduction(complete)).not.toThrow();
  });

  it('throws in production with no provider', () => {
    const { GOOGLE_CLIENT_ID: _id, GOOGLE_CLIENT_SECRET: _secret, ...rest } = complete;
    expect(() => assertAuthConfiguredInProduction(rest)).toThrow(/Refusing to start/);
  });

  it('throws in production with an empty allowlist', () => {
    // Configured providers plus nobody permitted is not a locked door, it is a
    // half-finished deployment, and it must not run.
    expect(() =>
      assertAuthConfiguredInProduction({ ...complete, STACKFIT_ALLOWED_EMAILS: '' }),
    ).toThrow(/STACKFIT_ALLOWED_EMAILS/);
  });

  it('says what the consequence would have been, not just what is missing', () => {
    // Whoever reads this is mid-deploy. "Set NEXTAUTH_SECRET" invites them to
    // silence it; naming the exposure tells them why not to.
    expect(() => assertAuthConfiguredInProduction({ NODE_ENV: 'production' })).toThrow(
      /expose every saved scoping session/,
    );
  });

  it('leaves development alone', () => {
    expect(() => assertAuthConfiguredInProduction({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertAuthConfiguredInProduction({})).not.toThrow();
  });
});
