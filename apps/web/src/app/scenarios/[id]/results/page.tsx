import { coverageOfBundle, type Bundle } from '@stackfit/engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AssumptionsPanel } from '@/components/results/assumptions';
import { BundleComparison } from '@/components/results/bundle-comparison';
import { CategoryCards } from '@/components/results/category-cards';
import { CostBreakdown } from '@/components/results/cost-breakdown';
import { Engagement } from '@/components/results/engagement';
import { Staffing } from '@/components/results/staffing';
import { CoverageMatrix } from '@/components/results/coverage-matrix';
import { GapAnalysis } from '@/components/results/gap-analysis';
import { SectionNav } from '@/components/results/section-nav';
import { SizingWorksheet } from '@/components/results/sizing-worksheet';
import { frameworkLabel, INDUSTRY_SHORT } from '@/components/wizard/labels';
import { Badge } from '@/components/ui';
import { engineData, today } from '@/lib/config.server';
import { prisma } from '@/lib/db';
import { requireAnalyst } from '@/lib/session.server';
import { formatMoney, formatNumber } from '@/lib/format';
import { resultsFor } from '@/lib/results.server';
import { isUnreadable, parseScenarioRow } from '@/lib/scenario';

export const dynamic = 'force-dynamic';

/**
 * The panels below, in the order they appear.
 *
 * Written out rather than derived from the DOM, so the nav and the page cannot
 * drift: adding a panel without adding it here is a visible omission, while a
 * nav that scraped headings would silently pick up whatever was rendered.
 */
const RESULTS_SECTIONS = [
  { id: 'bundles', label: 'Bundles' },
  { id: 'categories', label: 'By category' },
  { id: 'engagement', label: 'Who pays' },
  { id: 'staffing', label: 'People' },
  { id: 'cost', label: 'Cost' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'gaps', label: 'Gaps' },
  { id: 'sizing', label: 'Sizing' },
  { id: 'assumptions', label: 'Assumptions' },
] as const;

const KINDS = ['essential', 'recommended', 'phase2'] as const;

function bundleKindFrom(value: string | undefined): Bundle['kind'] {
  return KINDS.find((kind) => kind === value) ?? 'recommended';
}

/**
 * §8. The results dashboard.
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
  await requireAnalyst();
  const { id } = await params;
  const { bundle: requested } = await searchParams;

  const row = await prisma.scenario.findUnique({ where: { id } });
  if (row === null) notFound();

  const scenario = parseScenarioRow(row);
  if (isUnreadable(scenario)) {
    return (
      <main className="mx-auto w-full max-w-[700px] px-6 py-10">
        <h1 className="text-ink text-lg font-semibold">This session cannot be opened</h1>
        <p className="text-muted mt-2 text-sm">{scenario.problem}</p>
        <Link href="/" className="text-accent mt-4 inline-block text-sm">
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

  // Wider than the other pages, because this one now spends 180px on a nav. At
  // 1400 the bundle comparison overflowed its scroller by 28px and clipped a
  // badge mid-word, which is the same defect an earlier pass fixed and this
  // layout reintroduced. Nothing reads wider as a result: prose is capped by
  // `.measure`, tables scroll, charts are responsive.
  return (
    <main className="mx-auto flex w-full max-w-[1520px] flex-col gap-4 px-6 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href={`/scenarios/${id}`} className="text-faint hover:text-ink text-sm">
            ← intake
          </Link>
          <h1 className="text-ink text-lg font-semibold tracking-tight">
            {scenario.profile.orgName}
          </h1>
          <span className="text-faint text-xs">
            {INDUSTRY_SHORT[scenario.profile.industry] ?? scenario.profile.industry} ·{' '}
            {formatNumber(scenario.profile.employeeCount)} staff ·{' '}
            {scenario.profile.budget.currency}
            {scenario.profile.compliance.length > 0 &&
              ` · ${scenario.profile.compliance.map(frameworkLabel).join(', ')}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {/*
        The first thing on the page when there is nothing to protect.

        The wizard's live readout has always said this; the results page, which
        is the screen an analyst actually turns toward a client and the one the
        exports are generated from, said nothing at all. A thirteen-product
        stack and a three-year TCO for an estate of zero read exactly like a
        recommendation.
      */}
      {!result.sizing.estateCaptured && (
        <div className="border-warn/40 bg-warn/10 rounded-(--radius-card) border px-4 py-3">
          <p className="text-warn text-sm font-medium">No estate has been captured yet.</p>
          <p className="text-muted measure mt-1 text-sm leading-relaxed">
            Every figure on this page is arithmetic on zero assets: the floor cost of owning these
            tools rather than the cost of protecting anything. Nothing here is a recommendation
            until the inventory is filled in.{' '}
            <Link href={`/scenarios/${id}`} className="text-accent">
              Go to the estate step
            </Link>
            .
          </p>
        </div>
      )}

      {/* Two independent caps, so two independent shortfalls. Showing only the
          annual one sent the analyst back for a bigger annual budget when the
          implementation budget was what had run out. */}
      {(bundle.annualShortfall !== null || bundle.oneTimeShortfall !== null) && (
        <div className="border-bad/40 bg-bad/10 rounded border px-3 py-2">
          <p className="text-bad text-sm leading-snug">
            The stated budget does not cover what compliance makes mandatory.
            {bundle.annualShortfall !== null && (
              <>
                {' '}
                Annual shortfall {formatMoney(bundle.annualShortfall)}/yr
                {bundle.minimumViableAnnual !== null && (
                  <>
                    ; the minimum viable annual budget is {formatMoney(bundle.minimumViableAnnual)}
                  </>
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

      {/*
        Two columns from `xl` up: the panels, and a nav that says where in them
        you are. The page is fourteen thousand pixels tall, and before this the
        only route to the assumptions was to scroll past a 240-row coverage
        matrix and hope.

        `scroll-mt` on each target clears the sticky header, so following an
        anchor does not park the heading underneath it.
      */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_180px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div id="bundles" className="scroll-mt-20">
            <BundleComparison result={result} selectedKind={kind} scenarioId={id} fx={data.fx} />
          </div>

          <div id="categories" className="scroll-mt-20">
            <CategoryCards result={result} bundle={bundle} />
          </div>

          {/*
            Before the cost breakdown, deliberately. The breakdown answers what
            the stack costs to own and run; this answers what the client is
            asked to pay, and on a managed engagement those are different
            questions with an order-of-magnitude between them.
          */}
          <div id="engagement" className="scroll-mt-20">
            <Engagement bundle={bundle} profile={scenario.profile} />
          </div>

          {/*
            After "who pays" and before the cost breakdown. The people question
            is the one a client asks straight after the money question, and the
            answer has to be next to it rather than buried under the charts.
          */}
          <div id="staffing" className="scroll-mt-20">
            <Staffing result={result} profile={scenario.profile} />
          </div>

          <div id="cost" className="scroll-mt-20">
            <CostBreakdown bundle={bundle} />
          </div>

          <div id="coverage" className="scroll-mt-20">
            <CoverageMatrix coverage={coverage} />
          </div>

          <div id="gaps" className="scroll-mt-20">
            <GapAnalysis coverage={coverage} />
          </div>

          <div id="sizing" className="scroll-mt-20">
            <SizingWorksheet
              scenarioId={id}
              sizing={result.sizing}
              // The coefficients this run actually used, so an overridden row
              // shows the number it was sized on rather than the default it
              // replaced.
              assumptions={result.sizingAssumptions}
              defaults={data.sizingAssumptions}
              overrides={scenario.overrides}
            />
          </div>

          <div id="assumptions" className="scroll-mt-20">
            <AssumptionsPanel
              result={result}
              bundle={bundle}
              fxAsOf={data.fx.asOf}
              msspConfidence={data.mssp.confidence}
              msspAsOf={data.mssp.asOf}
              today={today()}
            />
          </div>
        </div>

        <SectionNav sections={RESULTS_SECTIONS} />
      </div>
    </main>
  );
}
