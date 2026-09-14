import { join } from 'node:path';

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
  /*
   * Keep an internal tool out of the public index.
   *
   * This is a security header here, not an SEO setting. StackFit holds
   * prospective clients' asset inventories and is deployed to a public
   * hostname; since Phase 18 it also has a landing page that describes, in
   * detail and in plain English, what it does, which vendors it prices and
   * where the way in is. Written for a colleague that page is documentation.
   * Indexed, it is a reconnaissance document, and the sign-in form it points at
   * becomes something people find without looking.
   *
   * Set as a *header* rather than as `metadata.robots` in the layout for one
   * concrete reason: a `<meta>` tag needs a `<head>`, and the four export
   * routes under `scenarios/[id]/proposal/` return a DOCX, a PDF and an XLSX.
   * Those are precisely the responses that must never be cached by a third
   * party, and precisely the ones a meta tag cannot reach. One header on
   * `/:path*` covers every route in the application, including the ones nobody
   * remembers to check.
   *
   * `nofollow` as well as `noindex`, so a crawler that reaches the landing page
   * does not walk its links into the gated half of the app and collect a
   * directory of redirects. `src/app/robots.ts` deliberately permits the fetch
   * that lets this header be read; the reasoning is written out there.
   */
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  /*
   * The committed data has to travel with the deployment, and nothing else
   * makes it.
   *
   * `data/` holds the catalog, the framework library and eleven config files,
   * and `config.server.ts` reads them with `readFileSync` at a path it builds
   * at runtime. A deployment only uploads the files Next's tracer can *see*,
   * and a tracer works by following static imports: a path assembled from
   * `import.meta.url` and four `..` segments is invisible to it.
   *
   * Measured, not assumed. A standalone build before this change produced a
   * bundle containing `apps/` and `node_modules/` and no `data/` directory at
   * all, which on a serverless host is every catalog-loading page returning 500
   * on ENOENT. `next start` never catches it, because it runs from a working
   * copy where the files happen to be on disk.
   *
   * `outputFileTracingRoot` is the monorepo root, so the traced layout mirrors
   * the repo and `config.server.ts` finds the tree from the deployed working
   * directory.
   *
   * To check this without deploying, add `output: 'standalone'` here, build,
   * and count the YAML under `.next/standalone`. It was 0 before this block and
   * 35 after. `next start` proves nothing either way: it runs from a working
   * copy where the files are on disk regardless.
   */
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  outputFileTracingIncludes: {
    '/**': ['../../data/**/*.yaml'],
  },
  // The workspace packages ship raw TypeScript (no build step), so Next has to
  // compile them like app code.
  transpilePackages: ['@stackfit/engine', '@stackfit/schema', '@stackfit/data'],

  // Prisma's client loads its own runtime files and `pg` opens sockets; neither
  // survives being bundled.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],

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
