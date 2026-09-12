import { LoadingAnnouncement, SkeletonCard, SkeletonLine } from '@/components/skeleton';

/** Two pipeline runs rather than one, so this page has further to go. */
export default function CompareLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-6 py-4">
      <LoadingAnnouncement>Running both scenarios to compare them.</LoadingAnnouncement>

      <header className="flex items-baseline gap-3">
        <SkeletonLine className="h-3 w-16" />
        <SkeletonLine className="h-4 w-64" />
      </header>

      <SkeletonCard rows={3} />
      <div className="grid gap-3 lg:grid-cols-2">
        <SkeletonCard rows={4} />
        <SkeletonCard rows={4} />
      </div>
      <SkeletonCard rows={6} />
    </main>
  );
}
