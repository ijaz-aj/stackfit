import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AnalystMenu } from '@/components/analyst-menu';
import { currentAnalyst } from '@/lib/session.server';

import './globals.css';

/*
 * Two typefaces, both self-hosted by `next/font` at build time.
 *
 * Self-hosting is not incidental here: the Content-Security-Policy allows
 * `font-src 'self'` and nothing else, so a stylesheet link to a font CDN would
 * be blocked. `next/font` downloads the files during the build and serves them
 * from this origin, which satisfies the policy without loosening it.
 *
 * Inter, because the interface was on the system stack — which is what an
 * application looks like before anybody chose a typeface. Inter was drawn for
 * screen UI at small sizes, which is the entire range this app lives in, and
 * its tall x-height keeps an 11px label legible where a system serif-ish
 * fallback would not.
 *
 * JetBrains Mono for figures. Every number in this tool sits in a column that
 * has to align, and its zero is slashed — the difference between a zero and an
 * capital O matters in a table of prices and product ids.
 */
const sans = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  // The full variable range, so a heading can go heavier than the body without
  // loading a second file.
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500'],
});

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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
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
          <div className="flex items-center gap-4 px-6 py-3">
            <Link
              href="/"
              className="flex items-baseline gap-2 rounded"
              aria-label="StackFit — back to sessions"
            >
              <span className="text-ink text-lg font-semibold tracking-tight">StackFit</span>
              <span className="text-faint hidden text-xs sm:inline">security solution advisor</span>
            </Link>

            <div className="ml-auto flex items-center gap-3">
              {/*
                Load-bearing, not decoration. This is what stops a screenshot of
                indicative figures being read as a quote, so it stays visible at
                every width rather than being the thing that drops on mobile.
              */}
              <span className="border-line text-faint rounded border px-2 py-1 text-xs">
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
