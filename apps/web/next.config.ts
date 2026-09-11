import type { NextConfig } from 'next';

/**
 * Security headers (CONTRIBUTING.md hard rule 10).
 *
 * The Content-Security-Policy is set per-request in `src/proxy.ts`, because
 * it carries a per-request nonce and a static header cannot. Everything here is
 * request-independent and belongs in one place instead.
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // No feature this app uses needs any of these, and a scoping tool asking for
  // a microphone is exactly the sort of thing worth making impossible.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // Harmless over http, correct the moment this is hosted.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // The workspace packages ship raw TypeScript (no build step), so Next has to
  // compile them like app code.
  transpilePackages: ['@stackfit/engine', '@stackfit/schema', '@stackfit/data'],

  // better-sqlite3 is a native module and Prisma's client loads its own runtime
  // files; neither survives being bundled.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-better-sqlite3', 'better-sqlite3'],

  // Next 16 no longer runs ESLint during a build, which suits this repo: one
  // flat config at the root lints everything (`pnpm lint`), rather than a
  // second and different set of rules inside the app.
  typescript: { ignoreBuildErrors: false },

  // Next writes its own AGENTS.md and CONTRIBUTING.md into the app on first run. This
  // repo already has one CONTRIBUTING.md, at the root, and a second half-copy of
  // someone else's conventions inside apps/web is exactly the kind of quiet
  // duplication it warns about.
  agentRules: false,


  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
