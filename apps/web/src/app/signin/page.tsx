import { SignInForm } from '@/components/signin-form';
import { authEnabled, configuredProviderIds } from '@/lib/auth';
import { redirect } from 'next/navigation';

/**
 * Sign-in, and the one page deliberately reachable without a session.
 *
 * `error` arrives from Auth.js when a sign-in is refused. The commonest cause
 * here is by far an address that is not on the allowlist — somebody signed in
 * correctly and is still not permitted — so that case says so, rather than
 * leaving a colleague to conclude the login is broken.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Nothing to sign in to on a local install with no providers configured.
  if (!authEnabled()) redirect('/');

  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-[420px] px-6 py-16">
      <h1 className="text-ink text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted mt-2 text-sm leading-snug">
        StackFit holds prospective clients&rsquo; asset inventories, so access is limited to named
        analysts.
      </p>

      {error !== undefined && (
        <div className="border-bad/40 bg-bad/10 mt-4 rounded border px-3 py-2">
          <p className="text-bad text-sm leading-snug">
            {error === 'AccessDenied'
              ? 'That account signed in successfully but is not on the access list. Ask whoever ' +
                'administers this instance to add your address.'
              : 'Sign-in did not complete. Try again; if it keeps failing, the provider ' +
                'configuration on this instance is likely wrong.'}
          </p>
        </div>
      )}

      <SignInForm providers={configuredProviderIds()} />
    </main>
  );
}
