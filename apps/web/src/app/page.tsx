import type { Metadata } from 'next';

import { PortalLink } from '@/components/portal-link';

/**
 * The door, and the only thing in this application a stranger can read.
 *
 * **What used to be here was a landing page**, and it was good at its job:
 * seven bands explaining what the company scopes, how the engine answers, which
 * vendors are in the catalog, what a stack costs a client to run, and where the
 * way in is. Written for a colleague, that is documentation. Read by anybody
 * else, it is a reconnaissance document with a login form at the bottom of it.
 * It now lives at `/about`, behind `requireAnalyst()`, which is where a page
 * written for colleagues belongs. This is what replaced it.
 *
 * **Note what this did *not* need to be traded against.** The instinct is that
 * hiding the copy makes the deployment harder to find, and it does not: every
 * TLS certificate Vercel issues is published to Certificate Transparency logs
 * within minutes, and bots read those continuously. The hostname is public
 * knowledge whatever this page says. So the goal here is not obscurity, which
 * was never available. It is that **finding the host teaches you nothing and
 * gives you nothing to work with** — no product names, no client figures, no
 * description of what is worth stealing, and no argument for spending another
 * minute on it.
 *
 * Three rules for anyone editing this file, and they are the whole reason it is
 * a separate route rather than a branch inside the old page:
 *
 * 1. **It imports nothing that reads anything.** No database, no `engineData()`,
 *    no engine. The catalog counts that used to be here were harmless in
 *    themselves and are gone on principle: the public surface should be a
 *    surface, not a query.
 * 2. **It says nothing a reader could use.** No vendor names, no figures, no
 *    frameworks, no architecture. "An internal tool" is the entire disclosure.
 * 3. **It stays short.** Every sentence added here is a sentence published.
 *
 * `test/public-route.test.ts` holds the first of those to the code.
 *
 * Not indexed either, though that is belt to this braces: `X-Robots-Tag:
 * noindex, nofollow` is served on every response by `next.config.ts`.
 */
export const metadata: Metadata = {
  title: 'StackFit',
  // Deliberately flat. A meta description is the one piece of copy written to
  // be repeated somewhere else, and there is nothing here worth repeating.
  description: 'Internal tool. Access is limited to named analysts.',
};

/**
 * Static, and nothing to revalidate.
 *
 * The page it replaced had `revalidate = 86_400` because it rendered
 * `today()` into a pricing disclaimer, and a build left alone for a season
 * would have gone on asserting its prices were checked the morning it
 * compiled. Nothing here is dated, read, or computed, so it can be built once
 * and served from the edge forever.
 */
export default function DoorPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        {/*
          The same card, the same width and the same ground as `/signin`, which
          is where this sends people. A door and the lock behind it should not
          look like two different buildings.
        */}
        <div className="surface flex flex-col items-start gap-5 px-7 py-8 shadow-(--shadow-lifted)">
          <div className="flex items-baseline gap-2">
            <span className="text-ink text-xl font-semibold tracking-tight">StackFit</span>
            <span className="text-faint text-xs">security solution advisor</span>
          </div>

          {/*
            One sentence, and note what it stopped saying.

            The draft explained that the tool "holds prospective clients' asset
            inventories, so access is limited to named analysts" — which is the
            line `/signin` has always carried, and which is exactly right when
            the reader is a colleague who cannot get in and deserves to know
            why. On a page anyone who reads a Certificate Transparency log can
            reach, it is also a note about what is worth taking. It tells a
            targeted reader to keep going, and tells a credential-stuffing bot
            nothing it was not going to try anyway, which is the wrong trade in
            both directions.

            So it says what the tool is, which is what somebody sent the link
            needs in order to know they are in the right place, and stops.
          */}
          <p className="text-muted text-sm leading-relaxed">
            An internal tool for security solution scoping and budgeting. Access is limited to named
            analysts.
          </p>

          <PortalLink tone="solid" />
        </div>

        {/*
          The same line `/signin` carries, for the same reason: somebody
          screenshots this screen too, and it costs a line.
        */}
        <p className="text-faint mt-5 text-center text-xs">
          Budgetary estimates for scoping. Indicative figures, not a quote.
        </p>
      </div>
    </main>
  );
}
