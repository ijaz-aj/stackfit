import type { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';

import { isAllowed, isAuthConfigured, parseAllowlist } from './allowlist';

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
 * Sessions are JWTs rather than database rows. No adapter, no schema change,
 * and nothing to migrate when the database moves from SQLite to Postgres —
 * which matters because the alternative would put an auth migration in the
 * middle of the hosting change.
 *
 * ⚠ `next-auth` is pinned to 4.24.15, the stable line, not the 5.x beta. The
 * v5 API suits the App Router better and this repo does not put a beta in the
 * authentication path — the same judgement recorded against Prisma 8's release
 * candidate. v4 is in maintenance, which means security fixes, and those are
 * the fixes that matter here.
 */

const allowlist = parseAllowlist(process.env.STACKFIT_ALLOWED_EMAILS);

/** Only the providers that are actually configured, so a partial setup is not a crash. */
function configuredProviders(): NextAuthOptions['providers'] {
  const providers: NextAuthOptions['providers'] = [];

  if ((process.env.GOOGLE_CLIENT_ID ?? '') !== '' && (process.env.GOOGLE_CLIENT_SECRET ?? '') !== '') {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }),
    );
  }

  if ((process.env.GITHUB_CLIENT_ID ?? '') !== '' && (process.env.GITHUB_CLIENT_SECRET ?? '') !== '') {
    providers.push(
      GithubProvider({
        clientId: process.env.GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
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
    signIn({ user }) {
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
 * false on a hosted instance — `requireAnalyst` asserts the production
 * configuration on every request before it consults this.
 */
export function authEnabled(): boolean {
  return isAuthConfigured(process.env) && allowlist.length > 0;
}
