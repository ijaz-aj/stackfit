import { notFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { proposalToXlsx } from '@/lib/proposal-xlsx.server';
import { proposalFilename, proposalFor } from '@/lib/proposal.server';
import { resultsFor } from '@/lib/results.server';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

/** §8's raw cost model, for the analyst rather than the client. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
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
  const buffer = await proposalToXlsx(document);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${proposalFilename(document, 'xlsx')}"`,
      'cache-control': 'no-store',
    },
  });
}
