import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { assertAuthConfiguredInProduction } from './allowlist';
import { authEnabled, authOptions } from './auth';

/**
 * The one place that answers "who is asking, and may they".
 *
 * Every page and every server action goes through this. Scattering the check
 * would mean the next route added is the one that forgets it, which is the
 * failure mode Q3's "one home for authz" was written to avoid.
 */
export interface Analyst {
  /** Stable per-provider id, or null on a local install with no auth. */
  readonly id: string | null;
  readonly email: string | null;
  readonly name: string | null;
}

/** The local single-user identity, used only when auth is not configured. */
const LOCAL_ANALYST: Analyst = { id: null, email: null, name: null };

/**
 * Require a signed-in analyst, or redirect to sign-in.
 *
 * On a bare local install (no OAuth configured, which `pnpm dev` allows by
 * design) this returns the local identity rather than redirecting. That
 * cannot happen in production: `auth.ts` refuses to start an unconfigured
 * production build at all, so there is no path where this quietly waves
 * somebody through on a hosted instance.
 */
export async function requireAnalyst(): Promise<Analyst> {
  // Checked here, per request, rather than at module load. `next build` runs
  // with NODE_ENV=production and no secrets, they are injected at runtime on
  // every host worth using, so asserting at import time failed the build
  // instead of the deployment, which is the wrong thing to break.
  //
  // This also makes the guard unbypassable: it sits in the function every page
  // and every action calls, not in a module a new route might forget to
  // import.
  assertAuthConfiguredInProduction(process.env);

  if (!authEnabled()) return LOCAL_ANALYST;

  const session = await getServerSession(authOptions);
  if (session === null) redirect('/signin');

  const analystId = (session as { analystId?: string | null }).analystId ?? null;
  return {
    id: analystId,
    email: session.user?.email ?? null,
    name: session.user?.name ?? null,
  };
}

/** The current analyst without redirecting. For rendering a header, not for gating. */
export async function currentAnalyst(): Promise<Analyst | null> {
  if (!authEnabled()) return LOCAL_ANALYST;

  const session = await getServerSession(authOptions);
  if (session === null) return null;

  const analystId = (session as { analystId?: string | null }).analystId ?? null;
  return {
    id: analystId,
    email: session.user?.email ?? null,
    name: session.user?.name ?? null,
  };
}
