import type { MetadataRoute } from 'next';

/**
 * robots.txt, and the counter-intuitive part is that it allows crawling.
 *
 * StackFit is an internal tool that happens to be reachable over the public
 * internet. Phase 18 gave it a landing page at `/` that explains, in plain
 * English and at length, what the company scopes, which vendors it prices, what
 * a stack costs a client to run, and where the way in is. That page is written
 * for a colleague. Filed by a search engine it is a reconnaissance document,
 * and the sign-in form it points at becomes a target somebody finds without
 * looking for it.
 *
 * So the requirement is "not in the index". The instinct is `Disallow: /`, and
 * **that is the wrong control for this requirement**, for a reason worth
 * writing down because it is the single commonest mistake in this area:
 *
 *   - `Disallow` is a request not to *fetch*. It is not a request not to
 *     *list*. A crawler that finds this host through an inbound link, a
 *     certificate-transparency log or somebody's shared URL is still entitled
 *     to put the bare address in its index, captioned with whatever anchor text
 *     the link carried. Disallowed URLs appear in results regularly, stripped
 *     of their description, which is worse than the page itself would have been
 *     because nobody can see what they are looking at to dismiss it.
 *   - Worse, a disallowed page is never fetched, so the `noindex` that would
 *     have removed it is never read. The two controls do not stack. Blocking
 *     the crawl actively defeats the de-indexing.
 *   - And a `Disallow` list is itself published. Naming the paths worth hiding
 *     in a file served to anyone who asks is the oldest own-goal on the web.
 *
 * The control that does the work is `X-Robots-Tag: noindex, nofollow`, served
 * on every response by `next.config.ts`. That header is honoured at the
 * response level, covers the DOCX, PDF and XLSX export routes which have no
 * `<head>` for a meta tag to live in, and leaks nothing. This file exists so
 * the crawler is permitted to fetch the page and actually read it.
 *
 * Nothing sensitive is exposed by that: every route except the three in
 * `test/public-route.test.ts` answers an unauthenticated request with a
 * redirect to sign-in, and the landing page is public by design.
 *
 * No `sitemap` entry, deliberately. A sitemap is an invitation to index, which
 * is the opposite of the intent, and there is nothing here to enumerate.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // Permitted to fetch, so that the noindex header is read. Not permitted
      // to keep: that part is the header's job, not this file's.
      allow: '/',
    },
  };
}
