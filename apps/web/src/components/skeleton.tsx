import { cn } from '@/lib/cn';

/**
 * Loading placeholders.
 *
 * Not decoration. A results page runs the whole pipeline — sizing, costing,
 * scoring, portfolio, coverage — against a 65-product catalog, and measured
 * between 1.4 and 5.6 seconds. Until now it rendered nothing at all for that
 * time: the browser sat on the previous page, then the new one appeared whole.
 * A click with no acknowledgement for five seconds is the single worst
 * interaction in the app, and on a call it is the one that makes an analyst
 * click again.
 *
 * These are shaped like the content that replaces them, at the same sizes, so
 * the layout does not jump when the real thing lands. A generic spinner would
 * be less work and would tell the reader nothing about what is coming.
 *
 * `aria-hidden` throughout, with one polite live region at the top of each
 * loading file: a screen reader should hear "loading results" once, not read
 * out forty empty boxes.
 */

export function SkeletonLine({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-3', className)} />;
}

/** A card with a heading and some rows, matching the real `Card`'s geometry. */
export function SkeletonCard({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <section aria-hidden className={cn('surface', className)}>
      <header className="border-line border-b px-4 py-2.5">
        <SkeletonLine className="h-3.5 w-40" />
        <SkeletonLine className="mt-1.5 h-2.5 w-64 max-w-full" />
      </header>
      <div className="flex flex-col gap-2.5 p-4">
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonLine
            key={index}
            // Uneven widths: a stack of identical bars reads as a broken
            // component, varied ones read as text that has not arrived.
            className={index % 3 === 0 ? 'w-11/12' : index % 3 === 1 ? 'w-full' : 'w-4/5'}
          />
        ))}
      </div>
    </section>
  );
}

/** The announcement a screen reader actually needs, once per page. */
export function LoadingAnnouncement({ children }: { children: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {children}
    </p>
  );
}
