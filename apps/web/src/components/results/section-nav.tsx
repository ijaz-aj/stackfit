'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Where you are in the results page, and how to get somewhere else.
 *
 * The page is fourteen thousand pixels tall and holds eight panels. The only
 * way to reach the assumptions was to scroll past every chart, every category
 * card and a 240-row coverage matrix, and the only way to know how much was
 * left was to keep going. On a call that is not navigation, it is an apology.
 *
 * Scroll-spy rather than a plain anchor list, because a list of links tells you
 * where you can go and a highlighted one tells you where you are. The second is
 * what makes a long document feel finite.
 *
 * `IntersectionObserver` with a top-weighted root margin: a section counts as
 * current once its heading reaches the upper third of the viewport, which is
 * where a reader's eye actually sits, rather than when it first appears at the
 * bottom edge.
 */
export interface ResultsSection {
  readonly id: string;
  readonly label: string;
}

export function SectionNav({ sections }: { sections: readonly ResultsSection[] }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const seen = new Map<string, boolean>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);
        // The first section still on screen wins. Taking the last would make
        // the highlight jump ahead of the reader on a tall panel.
        const active = sections.find((section) => seen.get(section.id) === true);
        if (active !== undefined) setCurrent(active.id);
      },
      { rootMargin: '-72px 0px -66% 0px', threshold: 0 },
    );

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    /*
      Hidden below `xl` rather than stacked. There is no width for it on a
      laptop, and a horizontal strip of eight labels above the content would
      cost more room than it saves. The page is fully usable without it: every
      target is a heading you can still scroll to.
    */
    // `print:hidden`: a list of anchors with no page numbers is dead weight on
    // paper, and it was taking a 180px column of every printed page.
    <nav
      aria-label="Sections of this result"
      className="sticky top-20 hidden h-fit xl:block print:hidden"
    >
      <p className="text-faint mb-3 text-2xs tracking-wide uppercase">On this page</p>
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => {
          const active = section.id === current;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'border-line block border-l py-1.5 pl-3 text-xs transition-colors duration-(--duration-instant)',
                  active
                    ? 'border-accent text-ink'
                    : 'text-faint hover:border-line-control hover:text-muted',
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
