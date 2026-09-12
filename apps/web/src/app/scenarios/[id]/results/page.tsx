import { coverageOfBundle, type Bundle } from '@stackfit/engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AssumptionsPanel } from '@/components/results/assumptions';
import { BundleComparison } from '@/components/results/bundle-comparison';
import { CategoryCards } from '@/components/results/category-cards';
import { CostBreakdown } from '@/components/results/cost-breakdown';
import { CoverageMatrix } from '@/components/results/coverage-matrix';
import { GapAnalysis } from '@/components/results/gap-analysis';
import { SizingWorksheet } from '@/components/results/sizing-worksheet';
import { Badge } from '@/components/ui';
import { engineData, today } from '@/lib/config.server';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/format';
import { resultsFor } from '@/lib/results.server';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

const KINDS = ['essential', 'operable', 'recommended', 'ideal'] as const;

function bundleKindFrom(value: string | undefined): Bundle['kind'] {
  return KINDS.find((kind) => kind === value) ?? 'recommended';
}

/**
 * §8 — the results dashboard.
 *
 * Rendered on the server, because everything on it is derived from the engine
 * and none of it is worth shipping a copy of the catalog to the browser for.
 * The tier lives in the URL rather than in client state, so a particular view is
 * a link an analyst can send someone.
 *
 * Nothing here computes: every number is read off the pipeline result, and every
 * one of them arrives with the rationale that produced it (§11 phase 6's
 * definition of done).
 */
export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bundle?: string }>;
}) {
  const { id } = await params;
  const { bundle: requested } = await searchParams;

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

  const data = engineData();
  const result = resultsFor(scenario.profile, scenario.inventory, scenario.overrides);
  const kind = bundleKindFrom(requested);
  const bundle = result[kind];
  const coverage = coverageOfBundle(result, bundle);

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-5 py-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href={`/scenarios/${id}`} className="text-faint hover:text-ink text-[12px]">
            ← intake
          </Link>
          <h1 className="text-ink text-[15px] font-semibold tracking-tight">
            {scenario.profile.orgName}
          </h1>
          <span className="text-faint text-[11px]">
            {scenario.profile.industry} · {scenario.profile.employeeCount} staff ·{' '}
            {scenario.profile.budget.currency}
            {scenario.profile.compliance.length > 0 &&
              ` · ${scenario.profile.compliance.join(', ')}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {bundle.unfundedMandatory.length > 0 && (
            <Badge tone="bad">{bundle.unfundedMandatory.length} mandatory unfunded</Badge>
          )}
          {bundle.annualShortfall !== null && (
            <Badge tone="bad">shortfall {formatMoney(bundle.annualShortfall)}/yr</Badge>
          )}
          {bundle.oneTimeShortfall !== null && (
            <Badge tone="bad">setup shortfall {formatMoney(bundle.oneTimeShortfall)}</Badge>
          )}
          <Badge tone={bundle.withinAnnualCap ? 'good' : 'warn'}>
            {bundle.withinAnnualCap ? 'within budget' : 'over budget'}
          </Badge>
          {/* The implementation budget is a separate cap and runs out separately.
              It was computed and never shown, so a stack blocked by it looked
              simply unaffordable. */}
          {!bundle.withinOneTimeCap && <Badge tone="warn">over setup budget</Badge>}
        </div>
      </header>

      {/* Two independent caps, so two independent shortfalls. Showing only the
          annual one sent the analyst back for a bigger annual budget when the
          implementation budget was what had run out. */}
      {(bundle.annualShortfall !== null || bundle.oneTimeShortfall !== null) && (
        <div className="border-bad/40 bg-bad/10 rounded border px-3 py-2">
          <p className="text-bad text-[12px] leading-snug">
            The stated budget does not cover what compliance makes mandatory.
            {bundle.annualShortfall !== null && (
              <>
                {' '}
                Annual shortfall {formatMoney(bundle.annualShortfall)}/yr
                {bundle.minimumViableAnnual !== null && (
                  <>; the minimum viable annual budget is {formatMoney(bundle.minimumViableAnnual)}</>
                )}
                .
              </>
            )}
            {bundle.oneTimeShortfall !== null && (
              <>
                {' '}
                One-time shortfall {formatMoney(bundle.oneTimeShortfall)}
                {bundle.minimumViableOneTime !== null && (
                  <>
                    ; standing the mandatory set up costs at least{' '}
                    {formatMoney(bundle.minimumViableOneTime)}
                  </>
                )}
                . Implementation is a separate budget from the annual one, and a bigger annual
                budget will not fix it.
              </>
            )}{' '}
            This is reported rather than resolved by quietly recommending a stack that fails the
            obligation.
          </p>
        </div>
      )}

      <BundleComparison result={result} selectedKind={kind} scenarioId={id} />

      <CategoryCards result={result} bundle={bundle} />

      <CostBreakdown bundle={bundle} />

      <CoverageMatrix coverage={coverage} />

      <GapAnalysis coverage={coverage} />

      <SizingWorksheet
        scenarioId={id}
        sizing={result.sizing}
        // The coefficients this run actually used, so an overridden row shows
        // the number it was sized on rather than the default it replaced.
        assumptions={result.sizingAssumptions}
        defaults={data.sizingAssumptions}
        overrides={scenario.overrides}
      />

      <AssumptionsPanel
        result={result}
        bundle={bundle}
        fxAsOf={data.fx.asOf}
        msspConfidence={data.mssp.confidence}
        msspAsOf={data.mssp.asOf}
        today={today()}
      />
    </main>
  );
}
