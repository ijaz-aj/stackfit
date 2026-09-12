import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AnalystMenu } from '@/components/analyst-menu';
import { currentAnalyst } from '@/lib/session.server';

import './globals.css';

export const metadata: Metadata = {
  title: 'StackFit — security stack advisor',
  description: 'Size an environment, recommend a security stack, and cost it over three years.',
};

/**
 * `dark` rather than relying on the CSS alone, so the browser paints its own
 * chrome — scrollbars, form controls, the address bar on mobile — to match
 * instead of flashing white on first paint.
 */
export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0e13',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const analyst = await currentAnalyst();

  return (
    <html lang="en">
      <body className="min-h-screen">
        {/*
          First in the tab order and invisible until focused. The results page is
          thirty-odd interactive elements deep; without this a keyboard user tabs
          the whole header and every card on every navigation to reach what they
          came for.
        */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <header className="border-line bg-panel/90 sticky top-0 z-20 border-b backdrop-blur-sm">
          <div className="flex items-center gap-4 px-5 py-2.5">
            <Link
              href="/"
              className="flex items-baseline gap-2 rounded"
              aria-label="StackFit — back to sessions"
            >
              <span className="text-ink text-lg font-semibold tracking-tight">StackFit</span>
              <span className="text-faint hidden text-xs sm:inline">security solution advisor</span>
            </Link>

            <div className="ml-auto flex items-center gap-2.5">
              {/*
                Load-bearing, not decoration. This is what stops a screenshot of
                indicative figures being read as a quote, so it stays visible at
                every width rather than being the thing that drops on mobile.
              */}
              <span className="border-line text-faint rounded border px-2 py-0.5 text-xs">
                figures are indicative — not a quote
              </span>
              {analyst !== null && analyst.email !== null && <AnalystMenu email={analyst.email} />}
            </div>
          </div>
        </header>

        {/* The skip link's target, and the landmark a screen reader jumps to. */}
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
