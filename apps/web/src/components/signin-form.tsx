'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

import { Button, Field, TextInput } from '@/components/ui';

const LABELS: Readonly<Record<string, string>> = {
  google: 'Continue with Google',
  github: 'Continue with GitHub',
};

/**
 * The ways in.
 *
 * A client component because `signIn` runs in the browser, but *which* ways
 * exist comes from the server: this offered both OAuth buttons
 * unconditionally, so on an instance configured with only one, the other
 * started a flow that could not finish and handed the visitor an error for
 * doing what the screen invited.
 */
export function SignInForm({
  providers,
  credentials,
}: {
  providers: readonly string[];
  credentials: boolean;
}) {
  if (providers.length === 0 && !credentials) {
    return (
      <p className="text-warn mt-6 text-sm leading-snug">
        No sign-in provider is configured on this instance, so there is no way in from here. Whoever
        administers it needs to set one.
      </p>
    );
  }

  return (
    <div className="mt-7 flex flex-col gap-5">
      {credentials && <PasswordForm />}

      {credentials && providers.length > 0 && (
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="bg-line h-px flex-1" />
          <span className="text-faint text-2xs uppercase">or</span>
          <span className="bg-line h-px flex-1" />
        </div>
      )}

      {providers.length > 0 && (
        <div className="flex flex-col gap-2">
          {providers.map((provider) => (
            <Button
              key={provider}
              type="button"
              variant="secondary"
              onClick={() => void signIn(provider, { callbackUrl: '/' })}
            >
              {LABELS[provider] ?? `Continue with ${provider}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Email and password.
 *
 * `redirect: false` so a refusal renders here, in place, instead of bouncing
 * to `/signin?error=...` and losing the address the analyst already typed.
 *
 * One message for every failure, deliberately. Saying "no such account" would
 * turn this form into a way to find out who has one.
 */
function PasswordForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/',
    });

    if (result?.ok === true) {
      // Deliberately not `result.url`. Auth.js builds that from NEXTAUTH_URL,
      // which defaults to localhost:3000 when unset, so a misconfigured
      // instance answers a successful sign-in by sending the analyst to
      // another host entirely. There is one destination here and it is known.
      window.location.assign('/');
      return;
    }

    setError('That email and password combination was not recognised.');
    setSubmitting(false);
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="signin-email">
        <TextInput
          id="signin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="analyst@example.com"
        />
      </Field>

      <Field label="Password" htmlFor="signin-password">
        <TextInput
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
      </Field>

      {error !== null && (
        <p role="alert" className="text-bad text-sm leading-snug">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
