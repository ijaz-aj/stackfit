import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content-Security-Policy with a per-request nonce (CONTRIBUTING.md hard rule 10).
 *
 * Next 16 renamed this convention from `middleware` to `proxy`: same runtime,
 * same matcher, new filename.
 *
 * Next injects the nonce into its own script tags when it sees one in the CSP
 * header, which is what makes `script-src` enforceable without `unsafe-inline`.
 * The cost is that every page renders dynamically — fine here, since every page
 * reads the database anyway.
 *
 * `style-src` still allows inline styles: Next and Tailwind both emit inline
 * <style> during hydration, and there is no nonce hook for them. Inline style
 * is a far smaller hole than inline script.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    `default-src 'self'`,
    // React Refresh compiles in the browser during development. In production
    // this is the whole point of the nonce.
    `script-src 'self' 'nonce-${nonce}' ${isDev ? "'unsafe-eval'" : "'strict-dynamic'"}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // Same-origin only. This tool talks to no third party, and a pre-sales tool
    // quietly posting a client's asset inventory somewhere would be a breach.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Everything except Next's own static output, which is hashed and immutable.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
