import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Wizard } from '@/components/wizard/wizard';
import { currencyByRegion, engineData } from '@/lib/config.server';
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
      <main className="mx-auto w-full max-w-[700px] px-6 py-10">
        <h1 className="text-ink text-lg font-semibold">This scenario cannot be opened</h1>
        <p className="text-muted mt-2 text-sm">{scenario.problem}</p>
        <p className="text-faint mt-4 text-xs">
          It was almost certainly saved before a schema change. The row is still in the database and
          nothing has been discarded.
        </p>
        <Link href="/" className="text-accent mt-4 inline-block text-sm">
          ← back to scenarios
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
      // Three rates and a date. The budget step needs them to offer a
      // conversion when the analyst changes the scenario currency.
      fx={data.fx}
      currencyByRegion={currencyByRegion()}
    />
  );
}
