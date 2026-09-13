import Link from 'next/link';

import { DeleteSession } from '@/components/delete-session';
import { Badge, Button, Card } from '@/components/ui';
import { When } from '@/components/when';
import { frameworkLabel, INDUSTRY_SHORT } from '@/components/wizard/labels';
import { cloneScenario, createScenario } from '@/lib/actions';
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
  const openable = scenarios.filter((scenario) => !isUnreadable(scenario)).length;

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-8">
      <section className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-semibold">Scoping scenarios</h1>
        <p className="text-muted text-sm">
          Start from a preset and edit it on the call, or start blank. Everything saves as you type.
        </p>
      </section>

      <Card
        title="Start from a typical estate"
        hint="Analyst estimates, to edit on the call. Never an answer."
        action={
          <form action={createScenario}>
            <Button type="submit" variant="secondary">
              Start blank
            </Button>
          </form>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => (
            <form key={preset.id} action={createScenario} className="contents">
              <input type="hidden" name="presetId" value={preset.id} />
              {/*
                The card *is* the button.

                It was one before as well, but nothing said so: a flat rectangle
                with a one-pixel border and a colour change on hover, which is
                the same treatment the non-clickable cards on this page get. Six
                of them side by side read as a table of information rather than
                as six choices, and the first thing an analyst has to do on this
                screen is choose one.

                Three things say "press me" now: the surface sits raised rather
                than outlined, it lifts a pixel under the pointer, and the
                pointer's arrival is acknowledged by a word that only exists to
                be acknowledged. None of them is decoration; a control that does
                not respond to the pointer is a control people click twice.
              */}
              <button
                type="submit"
                className="group border-line bg-panel-raised/40 hover:border-accent/50 hover:bg-panel-raised focus-visible:border-accent/50 flex h-full w-full flex-col gap-2 rounded-(--radius-card) border p-4 text-left transition-[transform,border-color,background-color,box-shadow] duration-(--duration-quick) hover:-translate-y-px hover:shadow-(--shadow-lifted)"
              >
                <span className="text-ink text-base font-semibold">{preset.name}</span>
                <span className="text-faint flex-1 text-xs leading-relaxed">
                  {preset.description}
                </span>

                <span className="border-line mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2.5">
                  {/*
                    Industry and headcount were badges too, which put four or
                    five pills on every card and left the compliance frameworks
                    with no way to stand out. They are the one fact here that
                    changes the recommendation, so they keep the pill and the
                    accent; the rest is context and reads as text.
                  */}
                  <span className="text-muted text-xs">
                    {INDUSTRY_SHORT[preset.profile.industry] ?? preset.profile.industry} ·{' '}
                    {formatNumber(preset.profile.employeeCount)} staff
                  </span>
                  <span className="ml-auto flex flex-wrap justify-end gap-1">
                    {preset.profile.compliance.length > 0 ? (
                      preset.profile.compliance.map((framework) => (
                        <Badge key={framework} tone="accent">
                          {frameworkLabel(framework)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-faint text-xs">no compliance</span>
                    )}
                  </span>
                </span>

                <span className="text-faint group-hover:text-accent text-2xs transition-colors">
                  Open this estate →
                </span>
              </button>
            </form>
          ))}
        </div>
      </Card>

      <Card
        title="Saved scenarios"
        hint={
          scenarios.length === 0
            ? undefined
            : `The ${scenarios.length} most recently edited, newest first.`
        }
        action={
          openable >= 2 ? (
            <Link href="/compare" className="text-accent text-sm">
              Compare two →
            </Link>
          ) : undefined
        }
      >
        {scenarios.length === 0 ? (
          <p className="text-faint text-sm">
            Nothing saved yet. Pick an estate above and it will appear here.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {scenarios.map((scenario) => (
              /*
                The row is the target.

                Before this, the two things a row *offered* were Clone and
                Delete: two full-weight buttons, one of them red, on every
                line. Opening the session is what an analyst came to do and it
                was the only action with no affordance at all, just a name that
                happened to be a link. Meanwhile the destructive action had the
                loudest treatment on the page and sat on all twelve rows.

                So: the row lights up under the pointer and carries a chevron,
                the name is the link and has room to be one, and both buttons
                go quiet until they are wanted. Delete keeps its confirmation
                step and finds its colour on hover, which is where a warning is
                useful. It is not hidden until hover, because that hides it from
                a keyboard and from touch entirely.
              */
              <li
                key={scenario.id}
                className="group hover:bg-panel-raised/60 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-(--radius-control) px-2 py-2.5 transition-colors duration-(--duration-instant)"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/scenarios/${scenario.id}`}
                    className="text-ink group-hover:text-accent flex items-center gap-1.5 truncate text-base font-medium transition-colors"
                  >
                    <span className="truncate">{scenario.name}</span>
                    <span
                      aria-hidden
                      className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      →
                    </span>
                  </Link>
                  {isUnreadable(scenario) ? (
                    <p className="text-bad mt-0.5 text-xs">Cannot be opened. {scenario.problem}</p>
                  ) : (
                    <p className="text-faint mt-0.5 text-xs">
                      {INDUSTRY_SHORT[scenario.profile.industry] ?? scenario.profile.industry} ·{' '}
                      {formatNumber(scenario.profile.employeeCount)} staff ·{' '}
                      {scenario.profile.budget.currency}
                      {scenario.profile.compliance.length > 0 &&
                        ` · ${scenario.profile.compliance.map(frameworkLabel).join(', ')}`}
                    </p>
                  )}
                </div>

                <When iso={scenario.updatedAt} />

                {/*
                  `ml-auto` and wrapping so this cluster drops to its own line
                  rather than off the side of a phone. Delete's confirmation
                  expands this to roughly 435px, which does not fit a 390px
                  screen on the same line as the name.
                */}
                <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
                  <form action={cloneScenario}>
                    <input type="hidden" name="id" value={scenario.id} />
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                      Clone
                    </Button>
                  </form>
                  <DeleteSession id={scenario.id} name={scenario.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
