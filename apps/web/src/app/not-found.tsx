import Link from 'next/link';

/**
 * 404.
 *
 * Reached most often by `notFound()` in the scenario routes. A session id that
 * no longer exists, usually because it was deleted in another tab. That is a
 * normal thing to happen rather than a fault, and the wording says so instead
 * of implying the analyst mistyped something.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[700px] px-6 py-10">
      <h1 className="text-ink text-lg font-semibold tracking-tight">Not found</h1>
      <p className="text-muted mt-2 text-sm leading-snug">
        There is no page here. If you followed a link to a scoping scenario, it has probably been
        deleted since the link was made.
      </p>
      <Link href="/scenarios" className="text-accent mt-4 inline-block text-sm">
        ← back to scenarios
      </Link>
    </main>
  );
}
