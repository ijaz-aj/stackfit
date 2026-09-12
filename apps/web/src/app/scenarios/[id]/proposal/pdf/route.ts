import { notFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { requireAnalyst } from '@/lib/session.server';
import { proposalToPdf } from '@/lib/proposal-pdf.server';
import { proposalFilename, proposalFor } from '@/lib/proposal.server';
import { resultsFor } from '@/lib/results.server';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';
// react-pdf needs Node APIs (fonts, streams); it does not run on the edge.
export const runtime = 'nodejs';

/** §8's proposal as a PDF. The format that arrives looking the same everywhere. */
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
  const buffer = await proposalToPdf(document);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${proposalFilename(document, 'pdf')}"`,
      'cache-control': 'no-store',
    },
  });
}
