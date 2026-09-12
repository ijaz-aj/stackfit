'use client';

import { signIn } from 'next-auth/react';

const LABELS: Readonly<Record<string, string>> = {
  google: 'Continue with Google',
  github: 'Continue with GitHub',
};

/**
 * The provider buttons.
 *
 * A client component because `signIn` runs in the browser, but the *list* comes
 * from the server: it offered both buttons unconditionally, so on an instance
 * configured with only one, the other started an OAuth flow that could not
 * finish and handed the visitor an error for doing what the screen invited.
 */
export function SignInForm({ providers }: { providers: readonly string[] }) {
  if (providers.length === 0) {
    return (
      <p className="text-warn mt-6 text-sm leading-snug">
        No sign-in provider is configured on this instance, so there is no way in from here. Whoever
        administers it needs to set one.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => void signIn(provider, { callbackUrl: '/' })}
          className="border-line text-ink hover:bg-panel-raised hover:border-line-strong rounded border px-3 py-2 text-base transition-colors"
        >
          {LABELS[provider] ?? `Continue with ${provider}`}
        </button>
      ))}
    </div>
  );
}
