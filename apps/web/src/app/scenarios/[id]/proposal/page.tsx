import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProposalPreview } from '@/components/results/proposal-preview';
import { prisma } from '@/lib/db';
import { proposalFor } from '@/lib/proposal.server';
import { resultsFor } from '@/lib/results.server';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

/**
 * §8 — the proposal, previewed before it is sent.
 *
 * The spec asks for the HTML preview before the DOCX and PDF, and the reason is
 * the one that matters on a call: an analyst will not send a client a document
 * they have not read. The download links sit above the preview rather than
 * replacing it.
 */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = await prisma.scenario.findUnique({ where: { id } });
  if (row === null) notFound();

  const scenario = parseScenarioRow(row);
  if (isUnreadable(scenario)) {
    return (
      <main className="mx-auto w-full max-w-[700px] px-5 py-10">
        <h1 className="text-ink text-[15px] font-semibold">This session cannot be opened</h1>
        <p className="text-muted mt-2 text-[12px]">{scenario.problem}</p>
        <Link href="/" className="text-accent mt-4 inline-block text-[12px]">
          ← back to sessions
        </Link>
      </main>
    );
  }

  const result = resultsFor(scenario.profile, scenario.inventory, scenario.overrides);
  const document = proposalFor(scenario.profile, result);

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-3 px-5 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href={`/scenarios/${id}/results`} className="text-faint hover:text-ink text-[12px]">
            ← results
          </Link>
          <h1 className="text-ink text-[15px] font-semibold tracking-tight">Proposal</h1>
          <span className="text-faint text-[11px]">{scenario.profile.orgName}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/scenarios/${id}/proposal/docx`}
            className="border-line text-ink hover:bg-panel-raised rounded border px-2.5 py-1 text-[12px]"
          >
            Download DOCX
          </a>
          <a
            href={`/scenarios/${id}/proposal/xlsx`}
            className="border-line text-ink hover:bg-panel-raised rounded border px-2.5 py-1 text-[12px]"
          >
            Cost model (XLSX)
          </a>
        </div>
      </header>

      <p className="text-faint text-[11px] print:hidden">
        This is what the client receives. The DOCX is rendered from the same document, so what you
        read here is what they get — not a separate approximation of it.
      </p>

      <ProposalPreview document={document} />
    </main>
  );
}
