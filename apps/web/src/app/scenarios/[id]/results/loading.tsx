import { LoadingAnnouncement, SkeletonCard, SkeletonLine } from '@/components/skeleton';

/**
 * Shown while the pipeline runs (measured 1.4–5.6s on the demo estates).
 *
 * Laid out like the real page (header, bundle comparison, the category grid,
 * then the full-width panels) so the content lands into the shape already on
 * screen instead of pushing it around.
 */
export default function ResultsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-6 py-4">
      <LoadingAnnouncement>Running the recommendation engine.</LoadingAnnouncement>

      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <SkeletonLine className="h-3 w-16" />
          <SkeletonLine className="h-4 w-48" />
        </div>
        <SkeletonLine className="h-4 w-32" />
      </header>

      <SkeletonCard rows={4} />

      <div className="grid gap-3 lg:grid-cols-2">
        <SkeletonCard rows={5} />
        <SkeletonCard rows={5} />
      </div>

      <SkeletonCard rows={6} />
      <SkeletonCard rows={4} />
    </main>
  );
}
