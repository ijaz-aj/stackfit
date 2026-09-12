'use client';

import { signIn } from 'next-auth/react';

/**
 * The provider buttons.
 *
 * A client component because `signIn` runs in the browser. It offers both
 * providers unconditionally rather than reading configuration: a button for an
 * unconfigured provider is a dead end, but reading env on the client is worse,
 * and an instance configures the one its analysts actually use.
 */
export function SignInForm() {
  return (
    <div className="mt-5 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void signIn('google', { callbackUrl: '/' })}
        className="border-line text-ink hover:bg-panel-raised rounded border px-3 py-2 text-sm"
      >
        Continue with Google
      </button>
      <button
        type="button"
        onClick={() => void signIn('github', { callbackUrl: '/' })}
        className="border-line text-ink hover:bg-panel-raised rounded border px-3 py-2 text-sm"
      >
        Continue with GitHub
      </button>
    </div>
  );
}
