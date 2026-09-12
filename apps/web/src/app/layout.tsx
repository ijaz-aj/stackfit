import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'StackFit — security stack advisor',
  description: 'Size an environment, recommend a security stack, and cost it over three years.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-line bg-panel sticky top-0 z-20 border-b">
          <div className="flex items-center gap-4 px-5 py-2.5">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-ink text-[15px] font-semibold tracking-tight">StackFit</span>
              <span className="text-faint text-[11px]">security solution advisor</span>
            </Link>
            <span className="border-line text-faint ml-auto rounded border px-2 py-0.5 text-[11px]">
              figures are indicative — not a quote
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
