import { redirect } from 'next/navigation';

import { SignInForm } from '@/components/signin-form';
import { authEnabled, configuredProviderIds, credentialsEnabled } from '@/lib/auth';

/**
 * Sign-in, and the one page deliberately reachable without a session.
 *
 * Centred on its own ground rather than sitting under the application header,
 * because there is nothing to navigate to yet and a nav bar above an empty
 * page reads as a screen that failed to load. The card carries the wordmark
 * instead, which is the one thing a visitor landing here cold needs.
 *
 * `error` arrives from Auth.js when a sign-in is refused. The commonest cause
 * here is by far an address that is not on the allowlist: somebody signed in
 * correctly and is still not permitted, so that case says so, rather than
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="surface px-7 py-8 shadow-(--shadow-lifted)">
          <div className="flex items-baseline gap-2">
            <span className="text-ink text-xl font-semibold tracking-tight">StackFit</span>
            <span className="text-faint text-xs">security solution advisor</span>
          </div>

          <h1 className="text-ink mt-6 text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted mt-1.5 text-sm leading-snug">
            StackFit holds prospective clients&rsquo; asset inventories, so access is limited to
            named analysts.
          </p>

          {error !== undefined && (
            <div
              role="alert"
              className="border-bad/40 bg-bad/10 mt-5 rounded-(--radius-control) border px-3 py-2.5"
            >
              <p className="text-bad text-sm leading-snug">
                {error === 'AccessDenied'
                  ? 'That account signed in successfully but is not on the access list. Ask ' +
                    'whoever administers this instance to add your address.'
                  : 'Sign-in did not complete. Try again; if it keeps failing, the provider ' +
                    'configuration on this instance is likely wrong.'}
              </p>
            </div>
          )}

          <SignInForm providers={configuredProviderIds()} credentials={credentialsEnabled()} />
        </div>

        {/*
          The same disclaimer the application header carries. Someone screenshots
          this screen too, and it costs a line.
        */}
        <p className="text-faint mt-5 text-center text-xs">
          Budgetary estimates for scoping. Indicative figures, not a quote.
        </p>
      </div>
    </main>
  );
}
