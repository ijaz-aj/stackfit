import Link from 'next/link';

import { Badge, Button, Card } from '@/components/ui';
import { cloneScenario, createScenario, deleteScenario } from '@/lib/actions';
import { engineData } from '@/lib/config.server';
import { prisma } from '@/lib/db';
import { requireAnalyst } from '@/lib/session.server';
import { formatNumber } from '@/lib/format';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

export default async function ScenariosPage() {
  await requireAnalyst();
  const { presets } = engineData();
  const rows = await prisma.scenario.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 });
  const scenarios = rows.map(parseScenarioRow);

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-ink text-[17px] font-semibold tracking-tight">Scoping sessions</h1>
        <p className="text-muted text-sm">
          Start from a preset and edit it on the call, or start blank. Everything saves as you type.
        </p>
      </section>

      <Card
        title="Start from a typical estate"
        hint="Analyst estimates of what an estate of this shape usually looks like — a starting point to edit, never an answer."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => (
            <form key={preset.id} action={createScenario}>
              <input type="hidden" name="presetId" value={preset.id} />
              <button
                type="submit"
                className="border-line hover:border-accent/60 hover:bg-accent/5 flex h-full w-full flex-col gap-1 rounded border p-3 text-left transition-colors"
              >
                <span className="text-ink text-base font-medium">{preset.name}</span>
                <span className="text-faint text-xs leading-snug">{preset.description}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Badge>{preset.profile.industry}</Badge>
                  <Badge>{formatNumber(preset.profile.employeeCount)} staff</Badge>
                  {preset.profile.compliance.length > 0 ? (
                    preset.profile.compliance.map((framework) => (
                      <Badge key={framework} tone="accent">
                        {framework}
                      </Badge>
                    ))
                  ) : (
                    <Badge>no compliance</Badge>
                  )}
                </span>
              </button>
            </form>
          ))}
        </div>

        <form action={createScenario} className="mt-3">
          <Button type="submit" variant="secondary">
            Start blank instead
          </Button>
        </form>
      </Card>

      <Card
        title="Saved sessions"
        hint={`${scenarios.length} of the most recent.`}
        action={
          scenarios.filter((scenario) => !isUnreadable(scenario)).length >= 2 ? (
            <Link href="/compare" className="text-accent text-sm">
              Compare two →
            </Link>
          ) : undefined
        }
      >
        {scenarios.length === 0 ? (
          <p className="text-faint text-sm">Nothing saved yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--color-line)]">
            {scenarios.map((scenario) => (
              <li key={scenario.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/scenarios/${scenario.id}`}
                    className="text-ink hover:text-accent block truncate text-base"
                  >
                    {scenario.name}
                  </Link>
                  {isUnreadable(scenario) ? (
                    <p className="text-bad text-xs">Cannot be opened — {scenario.problem}</p>
                  ) : (
                    <p className="text-faint text-xs">
                      {scenario.profile.industry} · {formatNumber(scenario.profile.employeeCount)}{' '}
                      staff · {scenario.profile.budget.currency}
                      {scenario.profile.compliance.length > 0 &&
                        ` · ${scenario.profile.compliance.join(', ')}`}
                    </p>
                  )}
                </div>
                <time className="text-faint tabular shrink-0 text-xs">
                  {scenario.updatedAt.slice(0, 16).replace('T', ' ')}
                </time>
                <form action={cloneScenario}>
                  <input type="hidden" name="id" value={scenario.id} />
                  <Button type="submit" variant="secondary">
                    Clone
                  </Button>
                </form>
                <form action={deleteScenario}>
                  <input type="hidden" name="id" value={scenario.id} />
                  <Button type="submit" variant="danger">
                    Delete
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
