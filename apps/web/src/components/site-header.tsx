'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AnalystMenu } from '@/components/analyst-menu';
import { CommandPalette } from '@/components/command-palette';

/**
 * The application header.
 *
 * A client component for one reason: it has to know which page it is on, so
 * that it can decline to render on the two pages that are not the application.
 *
 * `/signin`: a nav bar above a login form offers a wordmark the card already
 * carries, a command palette that searches scenarios the visitor cannot read,
 * and a link to a page that will bounce them straight back here.
 *
 * `/`: public, and every control in this header is for someone already inside.
 * The palette searches a database the visitor has no right to; "Indicative
 * figures, not a quote" is a caveat about figures that are not on that page;
 * the wordmark links into the gated half of the app; and the About link now
 * points at a route that would bounce them to sign-in. `/` is a door with a
 * card on it and needs none of that. It used to be a landing page carrying its
 * own masthead, which is why this rule reads as if something were being
 * replaced — nothing is any more, and that is the intent.
 *
 * Done here rather than with a route group, which is the more idiomatic answer
 * but means moving every other page in the app into a second group to get two
 * pages out of this one.
 */
const BARE_PAGES = new Set(['/signin', '/']);

export function SiteHeader({ analystEmail }: { analystEmail: string | null }) {
  const pathname = usePathname();
  if (BARE_PAGES.has(pathname)) return null;

  return (
    <header className="border-line bg-panel/90 sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="flex items-center gap-4 px-6 py-3">
        <Link
          href="/scenarios"
          className="flex items-baseline gap-2 rounded"
          aria-label="StackFit, back to scenarios"
        >
          <span className="text-ink text-lg font-semibold tracking-tight">StackFit</span>
          <span className="text-faint hidden text-xs sm:inline">security solution advisor</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {/*
            The only route to `/about`, which is why it is here rather than
            left to whoever remembers the URL.

            That page was `/` and public until the deployment was taken off the
            open web; behind the gate it has no inbound link at all unless one
            is drawn. Quiet, because it is reference material an analyst reads
            once, not a place they work.
          */}
          <Link
            href="/about"
            className="text-muted hover:text-ink hidden text-xs transition-colors duration-(--duration-quick) sm:inline"
          >
            About
          </Link>
          <CommandPalette />
          {/*
            Load-bearing, not decoration. This is what stops a screenshot of
            indicative figures being read as a quote, so it stays visible at
            every width rather than being the thing that drops on mobile.

            And it is now weighted like it. It was `text-faint` inside a
            `border-line` hairline: 11.5px of the palette's quietest grey behind
            its most decorative rule, which made the one element on the page
            with legal consequence the least visible thing on it. A screenshot
            of this header was a screenshot of some numbers.

            `text-muted` is UST's own grey at 4.64:1, on their pale cyan, inside
            the border weight WCAG reserves for things you have to be able to
            see. Still quiet — it is a caveat, not a banner — but it now
            survives a photograph of a laptop screen, which is the form this
            actually leaves the room in.
          */}
          <span className="border-line-strong bg-panel-raised text-muted rounded-(--radius-control) border px-2 py-1 text-xs font-medium">
            Indicative figures, not a quote
          </span>
          {analystEmail !== null && <AnalystMenu email={analystEmail} />}
        </div>
      </div>
    </header>
  );
}
