'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AnalystMenu } from '@/components/analyst-menu';
import { CommandPalette } from '@/components/command-palette';

/**
 * The application header.
 *
 * A client component for one reason: it has to know which page it is on, so
 * that it can decline to render on `/signin`. A nav bar above a login form
 * offers a wordmark the card already carries, a command palette that searches
 * sessions the visitor cannot read, and a link to a page that will bounce them
 * straight back here.
 *
 * Done here rather than with a route group, which is the more idiomatic answer
 * but means moving every other page in the app into a second group to get one
 * page out of this one.
 */
export function SiteHeader({ analystEmail }: { analystEmail: string | null }) {
  const pathname = usePathname();
  if (pathname === '/signin') return null;

  return (
    <header className="border-line bg-panel/90 sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="flex items-center gap-4 px-6 py-3">
        <Link
          href="/"
          className="flex items-baseline gap-2 rounded"
          aria-label="StackFit, back to scenarios"
        >
          <span className="text-ink text-lg font-semibold tracking-tight">StackFit</span>
          <span className="text-faint hidden text-xs sm:inline">security solution advisor</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <CommandPalette />
          {/*
            Load-bearing, not decoration. This is what stops a screenshot of
            indicative figures being read as a quote, so it stays visible at
            every width rather than being the thing that drops on mobile.
          */}
          <span className="border-line text-faint rounded border px-2 py-1 text-xs">
            Indicative figures, not a quote
          </span>
          {analystEmail !== null && <AnalystMenu email={analystEmail} />}
        </div>
      </div>
    </header>
  );
}
