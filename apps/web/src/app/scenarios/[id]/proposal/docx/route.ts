import { notFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { requireAnalyst } from '@/lib/session.server';
import { proposalToDocx } from '@/lib/proposal-docx.server';
import { proposalFilename, proposalFor } from '@/lib/proposal.server';
import { resultsFor } from '@/lib/results.server';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

/**
 * §8's proposal as a Word document.
 *
 * A GET route rather than a server action: this returns a file, and a download
 * is a navigation. Read-only, so there is nothing here for the server-action
 * layer's authz seam to guard — it guards mutations.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  await requireAnalyst();
  const { id } = await params;

  const row = await prisma.scenario.findUnique({ where: { id } });
  if (row === null) notFound();

  const scenario = parseScenarioRow(row);
  if (isUnreadable(scenario)) {
    return new Response(`This session cannot be opened: ${scenario.problem}`, {
      status: 422,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const result = resultsFor(scenario.profile, scenario.inventory, scenario.overrides);
  const document = proposalFor(scenario.profile, result);
  const buffer = await proposalToDocx(document);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${proposalFilename(document, 'docx')}"`,
      'cache-control': 'no-store',
    },
  });
}
