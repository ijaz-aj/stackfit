import { compareScenarios, type ChangeKind, type ValueChange } from '@stackfit/engine';
import Link from 'next/link';

import { Badge, Card } from '@/components/ui';
import { prisma } from '@/lib/db';
import { requireAnalyst } from '@/lib/session.server';
import { renderCell } from '@/lib/proposal.server';
import { resultsFor } from '@/lib/results.server';
import { isUnreadable, parseScenarioRow, type ScenarioRecord } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

/**
 * §11 phase 9 — two scenarios, diffable side by side.
 *
 * The two ids live in the query string rather than in client state, so a
 * particular comparison is a link an analyst can send to someone. Everything on
 * the page is derived on the server from two pipeline runs; nothing is
 * computed here, and the diff itself is an engine function so it can be tested
 * without a browser.
 */

/**
 * Only the three kinds that get a badge. "same" renders as plain text, so it
 * never reaches here — and with exactOptionalPropertyTypes, a tone of
 * `undefined` is not the same thing as no tone at all.
 */
function toneFor(kind: Exclude<ChangeKind, 'same'>): 'warn' | 'accent' {
  return kind === 'changed' ? 'accent' : 'warn';
}

function ChangeRow({ change }: { change: ValueChange }) {
  const changed = change.kind !== 'same';

  return (
    <tr className="border-line border-t">
      <td className="text-muted py-2 pr-3">{change.label}</td>
      <td className="tabular py-2 pr-3 text-right">
        {change.left === null ? <span className="text-faint">—</span> : renderCell(change.left)}
      </td>
      <td className="tabular py-2 pr-3 text-right">
        {change.right === null ? <span className="text-faint">—</span> : renderCell(change.right)}
      </td>
      <td
        className={`tabular py-2 text-right ${changed ? 'text-accent' : 'text-faint'}`}
      >
        {change.delta === null ? (changed ? 'changed' : '—') : renderCell(change.delta)}
      </td>
    </tr>
  );
}

function ChangeTable({
  rows,
  leftName,
  rightName,
  firstHeading,
}: {
  rows: readonly ValueChange[];
  leftName: string;
  rightName: string;
  firstHeading: string;
}) {
  if (rows.length === 0) {
    return <p className="text-faint text-sm">No differences.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="text-faint text-left text-2xs tracking-wide uppercase">
            <th className="py-2 pr-3 font-medium">{firstHeading}</th>
            <th className="max-w-[24ch] py-2 pr-3 text-right font-medium" title={leftName}>
              {leftName}
            </th>
            <th className="max-w-[24ch] py-2 pr-3 text-right font-medium" title={rightName}>
              {rightName}
            </th>
            {/* Never the column that gets squeezed: it is the answer. */}
            <th className="w-[18ch] py-2 text-right font-medium whitespace-nowrap">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ChangeRow key={row.label} change={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  await requireAnalyst();
  const { left: leftId, right: rightId } = await searchParams;

  const rows = await prisma.scenario.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 });
  const scenarios = rows.map(parseScenarioRow);
  // A predicate, not a plain filter: TypeScript does not narrow a union on a
  // negated type guard, and every field read below lives on the readable half.
  const readable = scenarios.filter(
    (scenario): scenario is ScenarioRecord => !isUnreadable(scenario),
  );

  const leftRow = readable.find((scenario) => scenario.id === leftId);
  const rightRow = readable.find((scenario) => scenario.id === rightId);

  if (leftRow === undefined || rightRow === undefined || leftRow.id === rightRow.id) {
    return (
      <main className="mx-auto flex w-full max-w-[900px] flex-col gap-4 px-6 py-6">
        <header className="flex items-baseline gap-3">
          <Link href="/" className="text-faint hover:text-ink text-sm">
            ← sessions
          </Link>
          <h1 className="text-ink text-lg font-semibold tracking-tight">Compare</h1>
        </header>

        <Card
          title="Pick two sessions"
          hint="Clone a session, change one thing, and compare the two. Both must be readable and they must be different."
        >
          {readable.length < 2 ? (
            <p className="text-faint text-sm">
              At least two readable sessions are needed. Clone one from the sessions list.
            </p>
          ) : (
            <form className="flex flex-wrap items-end gap-2" method="get">
              <label className="flex flex-col gap-1">
                <span className="text-faint text-xs">Left</span>
                <select
                  name="left"
                  defaultValue={leftId ?? readable[0]?.id}
                  className="border-line bg-panel text-ink rounded border px-2 py-1 text-sm"
                >
                  {readable.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-faint text-xs">Right</span>
                <select
                  name="right"
                  defaultValue={rightId ?? readable[1]?.id}
                  className="border-line bg-panel text-ink rounded border px-2 py-1 text-sm"
                >
                  {readable.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="border-line text-ink hover:bg-panel-raised rounded border px-3 py-1 text-sm"
              >
                Compare
              </button>
            </form>
          )}
        </Card>
      </main>
    );
  }

  const leftResult = resultsFor(leftRow.profile, leftRow.inventory, leftRow.overrides);
  const rightResult = resultsFor(rightRow.profile, rightRow.inventory, rightRow.overrides);

  const comparison = compareScenarios(
    {
      name: leftRow.name,
      profile: leftRow.profile,
      inventory: leftRow.inventory,
      sizing: leftResult.sizing,
      bundle: leftResult.recommended,
      coverage: leftResult.coverage,
    },
    {
      name: rightRow.name,
      profile: rightRow.profile,
      inventory: rightRow.inventory,
      sizing: rightResult.sizing,
      bundle: rightResult.recommended,
      coverage: rightResult.coverage,
    },
  );

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href="/" className="text-faint hover:text-ink text-sm">
            ← sessions
          </Link>
          <h1 className="text-ink text-lg font-semibold tracking-tight">
            {comparison.leftName} vs {comparison.rightName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/scenarios/${leftRow.id}/results`} className="text-accent text-xs">
            {comparison.leftName} results
          </Link>
          <span className="text-faint text-xs">·</span>
          <Link href={`/scenarios/${rightRow.id}/results`} className="text-accent text-xs">
            {comparison.rightName} results
          </Link>
        </div>
      </header>

      {comparison.currencyMismatch !== null && (
        <div className="border-bad/40 bg-bad/10 rounded border px-3 py-2">
          <p className="text-bad text-sm leading-snug">
            These scenarios are priced in different currencies —{' '}
            {comparison.currencyMismatch.left} against {comparison.currencyMismatch.right}. Every
            money figure is shown in its own currency and no difference is calculated, because
            subtracting one from the other would produce a number that looks like an answer.
          </p>
        </div>
      )}

      <Card title="What changed" hint="Stated, not interpreted. What it means is the analyst's call.">
        <ul className="flex flex-col gap-1">
          {comparison.summary.map((line) => (
            <li key={line} className="text-muted text-sm leading-snug">
              {line}
            </li>
          ))}
        </ul>
      </Card>

      {/*
        Full width, not a two-column grid.
        
        Side by side, each table got about 520px while its own `min-w` was
        620px, so `overflow-x-auto` clipped the right-hand Difference column
        mid-number: ₹3,760,217 rendered as "₹3,760" and looked like a complete
        figure. A money column that silently drops three digits is worse than
        one that is missing — the reader has no way to tell they are reading a
        number a thousand times too small.
        
        These tables carry two scenario names as column headers and are wide by
        nature. Stacking them is what makes the numbers fit.
      */}
      <div className="flex flex-col gap-3">
        <Card title="Inputs that differ" hint="Everything else is identical between the two.">
          <ChangeTable
            rows={comparison.inputs}
            leftName={comparison.leftName}
            rightName={comparison.rightName}
            firstHeading="Field"
          />
        </Card>

        <Card title="What it cost" hint="Spend is procurement. Total annual cost includes the people.">
          <ChangeTable
            rows={comparison.headlines}
            leftName={comparison.leftName}
            rightName={comparison.rightName}
            firstHeading="Measure"
          />
        </Card>
      </div>

      <Card title="The stack, category by category">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="text-faint text-left text-2xs tracking-wide uppercase">
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">{comparison.leftName}</th>
                <th className="py-2 pr-3 font-medium">{comparison.rightName}</th>
                <th className="py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {comparison.categories.map((change) => (
                <tr key={change.category} className="border-line border-t">
                  <td className="text-muted py-2 pr-3">{change.categoryLabel}</td>
                  <td className="py-2 pr-3">
                    {change.left === null ? (
                      <span className="text-faint">not funded</span>
                    ) : (
                      <>
                        {change.left.productName}{' '}
                        <span className="text-faint">{change.left.tierName}</span>
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {change.right === null ? (
                      <span className="text-faint">not funded</span>
                    ) : (
                      <>
                        {change.right.productName}{' '}
                        <span className="text-faint">{change.right.tierName}</span>
                      </>
                    )}
                  </td>
                  <td className="py-2">
                    {change.kind === 'same' ? (
                      <span className="text-faint text-xs">same</span>
                    ) : (
                      <Badge tone={toneFor(change.kind)}>
                        {change.kind === 'changed'
                          ? 'different product'
                          : change.kind === 'only-left'
                            ? `only ${comparison.leftName}`
                            : `only ${comparison.rightName}`}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Compliance coverage"
        hint="Covered means a selected product claims the control, not that a product of the right kind is present."
      >
        <ChangeTable
          rows={comparison.coverage}
          leftName={comparison.leftName}
          rightName={comparison.rightName}
          firstHeading="Framework"
        />
      </Card>
    </main>
  );
}
