'use client';

import { useEffect } from 'react';

/**
 * The last boundary: a throw in the root layout itself.
 *
 * `error.tsx` sits inside the layout, so it cannot catch the layout failing.
 * This one replaces the whole document, which is why it renders its own
 * `<html>` and `<body>`, and why it cannot use the app's stylesheet or
 * components, since the failure may be in whatever loads them. The styling is
 * inline and minimal on purpose.
 *
 * Same rule as the route boundary: the digest is shown, the message is not.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[stackfit] global error', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1115',
          color: '#e6e8ec',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: '32rem', padding: '1.25rem' }}>
          <h1 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>StackFit could not start</h1>
          <p style={{ fontSize: '12px', lineHeight: 1.5, color: '#9aa1ad' }}>
            The application failed before any page could be rendered. No scoping scenario was
            changed.
          </p>
          {error.digest !== undefined && (
            <p style={{ fontSize: '11px', color: '#6b7280' }}>
              Reference <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '0.75rem',
              padding: '0.25rem 0.625rem',
              fontSize: '12px',
              color: '#e6e8ec',
              background: 'transparent',
              border: '1px solid #2a2f3a',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
