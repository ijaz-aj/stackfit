'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Where you are in the results page, and how to get somewhere else.
 *
 * The page is fifteen thousand pixels tall and holds ten panels. The only way
 * to reach the assumptions was to scroll past every chart, every category card
 * and a 240-row coverage matrix, and the only way to know how much was left was
 * to keep going. On a call that is not navigation, it is an apology.
 *
 * ## Two presentations, and why they are two components
 *
 * This was one component, `hidden xl:block`, which meant the only navigation on
 * the longest page in the application was gated at 1280px. The Gotcha in
 * CONTRIBUTING.md says what that is worth: this machine reports 1254 CSS pixels
 * on a 1568-pixel panel because Windows scales at 125%, so `xl:` rules here
 * "were written, shipped and never once rendered". The rail was being demoed on
 * a laptop that never drew it.
 *
 * The original objection to a fallback stands and is not dismissed: "a
 * horizontal strip of eight labels above the content would cost more room than
 * it saves." So the fallback is not a strip. It is one sticky row that states
 * the section you are in and opens to the same list — the cost of a line, not
 * of a column, and it earns the line by answering "where am I" without being
 * opened at all.
 *
 * They are two exports rather than one because **`position: sticky` can only
 * travel inside its containing block**, and the two need different ones. The
 * rail belongs in the grid's second column, whose row is as tall as the panels.
 * The jump bar does not: put it in that grid and it becomes a grid row of its
 * own and sticks for the height of itself before scrolling away with the page.
 * That was measured rather than reasoned — with both in the grid,
 * `grid-template-rows` read back as `50.85px 14920.2px`, and the bar's `top`
 * went to -10875 on a scroll that should have pinned it. It therefore renders
 * in `main`, above the grid, where the containing block is the whole document.
 *
 * The cost is two `IntersectionObserver`s over the same ten elements, because
 * the page is a server component and cannot hold the state to share. Only one
 * of the two is ever displayed; the other's observer watches elements from a
 * `display:none` subtree. Ten targets, one callback each per crossing — not
 * worth a client boundary around the whole page to avoid.
 */
export interface ResultsSection {
  readonly id: string;
  readonly label: string;
}

/**
 * Scroll-spy. A list of links tells you where you can go; a highlighted one
 * tells you where you are, and the second is what makes a long document feel
 * finite.
 *
 * A top-weighted root margin: a section counts as current once its heading
 * reaches the upper third of the viewport, which is where a reader's eye
 * actually sits, rather than when it first appears at the bottom edge.
 */
function useCurrentSection(sections: readonly ResultsSection[]): string {
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

  return current;
}

/**
 * Below `xl`: one sticky row, opening to the list. Renders in `main`, above the
 * grid — see the note on containing blocks above.
 *
 * A native `<details>` rather than a popover built from a button and state:
 * Escape, Enter, Space and the expanded/collapsed announcement are all the
 * platform's, and there is no focus trap to get wrong. It is controlled only so
 * that choosing a section can close it — an anchor that leaves the panel hanging
 * open covers the heading it just scrolled to.
 */
export function SectionJump({ sections }: { sections: readonly ResultsSection[] }) {
  const current = useCurrentSection(sections);
  const [open, setOpen] = useState(false);
  const currentLabel = sections.find((section) => section.id === current)?.label ?? '';

  return (
    /*
      A `nav` landmark, so this is reachable by the same jump a screen reader
      uses for the rail. Only ever one of the two is in the accessibility tree:
      below `xl` the rail is `display:none`, at `xl` this is, and a landmark
      inside a `display:none` subtree is not exposed. Same label on both on
      purpose — it is the same navigation, drawn to fit.
    */
    <nav aria-label="Sections of this result" className="xl:hidden print:hidden">
      <details
        open={open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="border-line bg-panel/95 sticky top-[3.25rem] z-10 rounded-(--radius-control) border shadow-(--shadow-surface) backdrop-blur-sm"
      >
        <summary className="text-muted flex list-none items-center gap-2 px-3 py-2 text-xs [&::-webkit-details-marker]:hidden">
          <span className="text-faint shrink-0 tracking-wide uppercase">On this page</span>
          {/* The current section, stated without opening anything. This is the
              row's whole justification: a fallback that only offered a menu
              would be a menu, and the rail it replaces answered "where am I"
              for free. */}
          <span className="text-ink min-w-0 flex-1 truncate font-medium">{currentLabel}</span>
          <span
            aria-hidden
            className={cn(
              'text-faint shrink-0 transition-transform duration-(--duration-quick)',
              open && 'rotate-180',
            )}
          >
            ▾
          </span>
        </summary>

        {/*
          Column count climbs with width, because this renders across everything
          below 1280px and one setting cannot serve both ends of that. Ten labels
          in three columns at 1200px is 400px of empty row per link and four rows
          of open panel; the same three columns on a 390px phone is the right
          answer. Five columns at `lg` puts the whole list in two rows.
        */}
        <ul className="border-line grid grid-cols-2 gap-x-2 gap-y-0.5 border-t px-2 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sections.map((section) => {
            const active = section.id === current;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block truncate rounded-(--radius-control) px-2 py-1.5 text-xs transition-colors duration-(--duration-instant)',
                    active
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-muted hover:bg-panel-raised hover:text-ink',
                  )}
                >
                  {section.label}
                </a>
              </li>
            );
          })}
        </ul>
      </details>
    </nav>
  );
}

/**
 * At `xl` and above: the rail, in the grid's second column.
 *
 * `print:hidden`: a list of anchors with no page numbers is dead weight on
 * paper, and it was taking a 180px column of every printed page.
 */
export function SectionRail({ sections }: { sections: readonly ResultsSection[] }) {
  const current = useCurrentSection(sections);

  return (
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
