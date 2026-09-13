import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { z } from 'zod';

import { isAllowed, isAuthConfigured, parseAllowlist } from './allowlist';
import { parseCredentialUsers, verifyCredentials } from './credentials';

/**
 * Sign-in for the hosted portal (docs/STATUS.md Q3, Q4).
 *
 * Q4 settled that this is hosted, shared and used by about five or six named
 * analysts, and Q3 deferred auth while requiring the seam. This is the seam
 * being used: nullable `ownerId` / `createdBy` on `Scenario`, and every
 * mutation already behind one server-action layer.
 *
 * **OAuth proves identity; the allowlist grants access.** They are separate
 * steps and separate files. A Google account proves somebody is who they say
 * they are and nothing whatsoever about whether they should be reading a
 * prospective client's asset inventory.
 *
 * The one exception is `STACKFIT_CREDENTIAL_USERS`, added so the portal can be
 * demonstrated to a client without handing them somebody's SSO. A credential
 * there is both halves at once, because the person who wrote the variable is
 * the person who would otherwise have written the allowlist. It is off unless
 * set, and `./credentials` is blunt about what it costs.
 *
 * Sessions are JWTs rather than database rows. No adapter, no schema change,
 * and nothing to migrate when the database moves from SQLite to Postgres,
 * which matters because the alternative would put an auth migration in the
 * middle of the hosting change.
 *
 * ⚠ `next-auth` is pinned to 4.24.15, the stable line, not the 5.x beta. The
 * v5 API suits the App Router better and this repo does not put a beta in the
 * authentication path. The same judgement recorded against Prisma 8's release
 * candidate. v4 is in maintenance, which means security fixes, and those are
 * the fixes that matter here.
 */

const allowlist = parseAllowlist(process.env.STACKFIT_ALLOWED_EMAILS);
const credentialUsers = parseCredentialUsers(process.env.STACKFIT_CREDENTIAL_USERS);

/**
 * What the login form is allowed to send.
 *
 * Hard rule 10: every external input is Zod-validated, and a login form is the
 * most external input there is. `authorize` receives whatever was posted, so
 * this is the boundary that turns it into two strings or into nothing.
 */
const CredentialsInput = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

/** Only the providers that are actually configured, so a partial setup is not a crash. */
function configuredProviders(): NextAuthOptions['providers'] {
  const providers: NextAuthOptions['providers'] = [];

  if (
    (process.env.GOOGLE_CLIENT_ID ?? '') !== '' &&
    (process.env.GOOGLE_CLIENT_SECRET ?? '') !== ''
  ) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }),
    );
  }

  if (
    (process.env.GITHUB_CLIENT_ID ?? '') !== '' &&
    (process.env.GITHUB_CLIENT_SECRET ?? '') !== ''
  ) {
    providers.push(
      GithubProvider({
        clientId: process.env.GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      }),
    );
  }

  // Last, and only if accounts were provisioned. See `./credentials` for why
  // this is the weakest door in the building and why it is still here.
  if (credentialUsers.length > 0) {
    providers.push(
      CredentialsProvider({
        name: 'Email and password',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        authorize(raw) {
          const parsed = CredentialsInput.safeParse(raw);
          if (!parsed.success) return null;

          const user = verifyCredentials(parsed.data.email, parsed.data.password, credentialUsers);
          if (user === null) return null;

          // `id` becomes `providerAccountId`, which the jwt callback below
          // turns into the analyst id stored against a saved session. The
          // address is the only stable identifier a credential has.
          return { id: user.email, email: user.email, name: user.email };
        },
      }),
    );
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: configuredProviders(),
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin', error: '/signin' },
  callbacks: {
    /**
     * The access decision. Returning false sends the visitor to the error page
     * rather than creating a session.
     *
     * Note what is *not* trusted here: `profile.email_verified`. An allowlist
     * of specific addresses already implies the account is one we expect, and
     * the providers in use verify addresses themselves. What matters is that
     * the address is on the list, checked exactly.
     */
    signIn({ user, account }) {
      // A credential is created by whoever administers the instance, so it is
      // the identity *and* the grant; there is no third party to distrust.
      // `authorize` already refused everything that did not match, and running
      // the allowlist again here would mean every demo account had to be
      // written into two environment variables to work.
      if (account?.provider === 'credentials') return true;

      return isAllowed(user.email, allowlist);
    },

    /** Carry the provider's stable account id into the token, for `ownerId`. */
    jwt({ token, account, profile }) {
      if (account !== null && account !== undefined) {
        token.analystId = `${account.provider}:${account.providerAccountId}`;
      }
      if (profile?.email !== undefined) token.email = profile.email;
      return token;
    },

    session({ session, token }) {
      const id = token.analystId;
      return {
        ...session,
        analystId: typeof id === 'string' ? id : null,
      };
    },
  },
};

/**
 * Whether this deployment enforces sign-in at all.
 *
 * False on a bare local install, which is deliberate: `pnpm dev` works with no
 * `.env` file, and that is a documented property of the repo. It cannot be
 * false on a hosted instance: `requireAnalyst` asserts the production
 * configuration on every request before it consults this.
 */
export function authEnabled(): boolean {
  // Either grant counts. An instance with credentials and no allowlist still
  // enforces sign-in; reading only the allowlist here would have made such an
  // instance redirect the sign-in page away and serve everything unauthenticated.
  return isAuthConfigured(process.env) && (allowlist.length > 0 || credentialUsers.length > 0);
}

/**
 * Which providers this deployment can actually complete a sign-in with.
 *
 * The sign-in page offered both buttons unconditionally. On an instance
 * configured with only one of them, the other was a dead control: it started an
 * OAuth flow that could not finish, and the visitor got an error page for doing
 * exactly what the screen invited them to do. A button that cannot work should
 * not be drawn.
 */
export function configuredProviderIds(): readonly ('google' | 'github')[] {
  const ids: ('google' | 'github')[] = [];
  if (
    (process.env.GOOGLE_CLIENT_ID ?? '') !== '' &&
    (process.env.GOOGLE_CLIENT_SECRET ?? '') !== ''
  ) {
    ids.push('google');
  }
  if (
    (process.env.GITHUB_CLIENT_ID ?? '') !== '' &&
    (process.env.GITHUB_CLIENT_SECRET ?? '') !== ''
  ) {
    ids.push('github');
  }
  return ids;
}

/**
 * Whether to draw the email-and-password form.
 *
 * Separate from `configuredProviderIds` because it is not a button: it is a
 * form with its own inputs, its own errors and its own place in the layout.
 */
export function credentialsEnabled(): boolean {
  return credentialUsers.length > 0;
}
