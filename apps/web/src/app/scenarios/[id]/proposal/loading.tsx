import { LoadingAnnouncement, SkeletonCard, SkeletonLine } from '@/components/skeleton';

/** The pipeline, then the document model, then seven rendered sections. */
export default function ProposalLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-3 px-6 py-4">
      <LoadingAnnouncement>Building the proposal.</LoadingAnnouncement>

      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <SkeletonLine className="h-4 w-56" />
        <SkeletonLine className="h-4 w-40" />
      </header>

      <SkeletonCard rows={8} />
    </main>
  );
}
