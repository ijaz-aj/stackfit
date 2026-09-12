'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Route-level error boundary.
 *
 * Without one, a throw anywhere in a server component reaches Next's default
 * page: a stack trace in development, and in production a bare "Application
 * error" with no route back. Neither is something to put in front of an analyst
 * mid-call with a client.
 *
 * Two deliberate choices about what the reader is told.
 *
 * `error.message` is NOT rendered. It can carry a database path, a query
 * fragment or a row's contents, and this application holds a prospective
 * client's asset inventory. Next already redacts the message in production
 * builds, but relying on that would mean the development build leaks and the
 * decision lives in someone else's release notes rather than in this file.
 *
 * `error.digest` IS rendered. It is a hash Next also writes to the server log,
 * so it is the one string that turns "it broke" into a line an engineer can
 * find. It reveals nothing on its own.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server log is the record; this is the browser half of the same
    // correlation id, so a report from an analyst can be matched to it.
    console.error('[stackfit] route error', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-[700px] px-5 py-10">
      <h1 className="text-ink text-lg font-semibold tracking-tight">Something broke</h1>
      <p className="text-muted mt-2 text-sm leading-snug">
        This page could not be built. Nothing was saved or changed by the attempt — the scoping
        session is intact and the intake it was derived from is untouched.
      </p>

      {error.digest !== undefined && (
        <p className="text-faint mt-3 text-xs leading-snug">
          Reference <code className="text-muted">{error.digest}</code>. Quote it when reporting
          this; the same string is in the server log against the failure.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="border-line text-ink hover:bg-panel-raised rounded border px-2.5 py-1 text-sm"
        >
          Try again
        </button>
        <Link href="/" className="text-accent text-sm">
          ← back to sessions
        </Link>
      </div>
    </main>
  );
}
