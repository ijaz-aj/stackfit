import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Wizard } from '@/components/wizard/wizard';
import { engineData } from '@/lib/config.server';
import { prisma } from '@/lib/db';
import { requireAnalyst } from '@/lib/session.server';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnalyst();
  const { id } = await params;

  const row = await prisma.scenario.findUnique({ where: { id } });
  if (row === null) notFound();

  const scenario = parseScenarioRow(row);
  if (isUnreadable(scenario)) {
    return (
      <main className="mx-auto w-full max-w-[700px] px-5 py-10">
        <h1 className="text-ink text-[15px] font-semibold">This session cannot be opened</h1>
        <p className="text-muted mt-2 text-[12px]">{scenario.problem}</p>
        <p className="text-faint mt-4 text-[11px]">
          It was almost certainly saved before a schema change. The row is still in the database and
          nothing has been discarded.
        </p>
        <Link href="/" className="text-accent mt-4 inline-block text-[12px]">
          ← back to sessions
        </Link>
      </main>
    );
  }

  const data = engineData();

  return (
    <Wizard
      key={scenario.id}
      scenario={{ id: scenario.id, profile: scenario.profile, inventory: scenario.inventory }}
      // Only what the steps actually render. The catalog, the rate cards and the
      // control lists stay on the server; the browser gets names and counts.
      frameworks={[...data.frameworks.values()].map((framework) => ({
        id: framework.id,
        name: framework.name,
        version: framework.version,
        sourceQuality: framework.sourceQuality,
        commonIn: framework.commonIn,
        controlCount: framework.controls.length,
      }))}
      products={data.catalog.map((product) => ({
        id: product.id,
        name: product.name,
        vendor: product.vendor,
        category: product.category,
      }))}
      // The one piece of configuration the browser does get: thirty coefficients,
      // so the ingest readout can update on the keystroke instead of waiting for
      // a round trip.
      sizingAssumptions={data.sizingAssumptions}
    />
  );
}
