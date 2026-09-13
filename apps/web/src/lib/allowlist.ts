import { credentialsConfigured } from './credentials';

/**
 * Who is allowed in (docs/STATUS.md Q3, Q4).
 *
 * The portal is hosted, shared and used by a handful of named analysts, so
 * membership is an explicit list rather than "anyone with a Google account".
 * An OAuth provider proves *who* somebody is; it says nothing about whether
 * they should be here, and conflating the two is how an internal tool ends up
 * readable by anyone on the internet with a valid login.
 *
 * Pure and separate from the Auth.js wiring on purpose: this is the one
 * decision in the authentication path that actually grants access, and it is
 * worth being able to test it exhaustively without standing up a provider.
 */

/**
 * Parse the configured allowlist.
 *
 * Comma-separated, because it lives in one environment variable on a host that
 * offers no better shape. Lower-cased and trimmed so that a stray space or a
 * capitalised address in the config does not silently lock a colleague out.
 */
export function parseAllowlist(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Whether this email may sign in.
 *
 * **An empty allowlist admits nobody.** That is the whole design: a missing or
 * misspelled environment variable is a configuration failure, and the safe
 * reading of a configuration failure in an access check is "no". The
 * alternative, treating "no list" as "everyone", turns one typo in a hosting
 * dashboard into a full data exposure, and it would fail silently, because
 * everything would appear to work.
 *
 * Comparison is case-insensitive on the whole address. That is not strictly
 * correct, the local part of an email address is case-sensitive per RFC 5321,
 * but every provider this portal accepts normalises case, and an analyst typing
 * their own address with a capital letter is far more likely than two
 * colleagues whose addresses differ only in case.
 */
export function isAllowed(email: string | null | undefined, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false;
  if (email === null || email === undefined) return false;

  const normalised = email.trim().toLowerCase();
  if (normalised.length === 0) return false;

  return allowlist.includes(normalised);
}

/**
 * Whether authentication is configured at all.
 *
 * Zero setup is a documented property of this repo, `pnpm dev` works with no
 * `.env` file, and demanding OAuth credentials to run the tests or open the
 * app locally would end that. So an unconfigured install runs in single-user
 * local mode.
 *
 * `assertAuthConfiguredInProduction` is what stops that convenience becoming a
 * hole: the same unconfigured state that is fine on a laptop is a refusal to
 * start on a host.
 */
export function isAuthConfigured(env: Record<string, string | undefined>): boolean {
  const hasSecret = (env.NEXTAUTH_SECRET ?? '').length > 0;
  const hasGoogle =
    (env.GOOGLE_CLIENT_ID ?? '').length > 0 && (env.GOOGLE_CLIENT_SECRET ?? '').length > 0;
  const hasGithub =
    (env.GITHUB_CLIENT_ID ?? '').length > 0 && (env.GITHUB_CLIENT_SECRET ?? '').length > 0;

  return hasSecret && (hasGoogle || hasGithub || credentialsConfigured(env));
}

/**
 * Refuse to run a hosted instance with the door open.
 *
 * Throws rather than warns. A warning in a deployment log is read by nobody,
 * and the failure it describes (a shared portal holding prospective clients'
 * asset inventories, reachable by anyone with the URL) is not one to leave
 * running while somebody notices.
 */
export function assertAuthConfiguredInProduction(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== 'production') return;

  // Either gate is enough, because they grant access to different things. The
  // allowlist is what admits an OAuth identity; a provisioned credential is
  // its own grant. What must never pass is *neither*, which is the state a
  // missing variable produces.
  const hasGrant =
    parseAllowlist(env.STACKFIT_ALLOWED_EMAILS).length > 0 || credentialsConfigured(env);
  if (isAuthConfigured(env) && hasGrant) return;

  throw new Error(
    'Refusing to start: authentication is not configured. This build is production, and an ' +
      'unauthenticated instance would expose every saved scoping session, including client ' +
      'asset inventories, to anyone with the URL. Set NEXTAUTH_SECRET, at least one OAuth ' +
      'provider (GOOGLE_CLIENT_ID/SECRET, GITHUB_CLIENT_ID/SECRET, or STACKFIT_CREDENTIAL_USERS), ' +
      'and a non-empty STACKFIT_ALLOWED_EMAILS unless STACKFIT_CREDENTIAL_USERS carries the grant.',
  );
}
