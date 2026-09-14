import { coverageOfBundle, planGapClosure, type Bundle } from '@stackfit/engine';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AssumptionsPanel } from '@/components/results/assumptions';
import { BundleComparison } from '@/components/results/bundle-comparison';
import { CategoryCards } from '@/components/results/category-cards';
import { CostBreakdown } from '@/components/results/cost-breakdown';
import { Engagement } from '@/components/results/engagement';
import { ExecutiveSummary } from '@/components/results/executive-summary';
import { Staffing } from '@/components/results/staffing';
import { CoverageMatrix } from '@/components/results/coverage-matrix';
import { CloseGaps } from '@/components/results/close-gaps';
import { GapAnalysis } from '@/components/results/gap-analysis';
import { SectionJump, SectionRail } from '@/components/results/section-nav';
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
  { id: 'summary', label: 'Summary' },
  { id: 'bundles', label: 'Options' },
  { id: 'categories', label: 'What we chose' },
  { id: 'engagement', label: 'What you pay' },
  { id: 'staffing', label: 'Staffing' },
  { id: 'cost', label: 'Cost detail' },
  { id: 'coverage', label: 'Compliance' },
  { id: 'gaps', label: "What's not covered" },
  { id: 'sizing', label: 'How we sized it' },
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
  searchParams: Promise<{ bundle?: string; view?: string }>;
}) {
  await requireAnalyst();
  const { id } = await params;
  const { bundle: requested, view } = await searchParams;

  /*
   * Our fee, our cost base and our margin render only when asked for by name.
   *
   * They used to sit on this page inside a collapsed `<details>` labelled "not
   * for the client", which is a convention rather than a guarantee: this is the
   * screen an analyst turns toward the person across the table, and one stray
   * click during a screen-share puts a 95% margin on it. The exports already
   * have the stronger guarantee — `buildProposal` never receives `attribution`,
   * so no renderer can leak it — and this makes the screen match: off the URL,
   * the figures are not in the DOM at all.
   */
  const showInternal = view === 'internal';

  const row = await prisma.scenario.findUnique({ where: { id } });
  if (row === null) notFound();

  const scenario = parseScenarioRow(row);
  if (isUnreadable(scenario)) {
    return (
      <main className="mx-auto w-full max-w-[700px] px-6 py-10">
        <h1 className="text-ink text-lg font-semibold">This scenario cannot be opened</h1>
        <p className="text-muted mt-2 text-sm">{scenario.problem}</p>
        <Link href="/scenarios" className="text-accent mt-4 inline-block text-sm">
          ← back to scenarios
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
            {/* The as-at date used to appear once, in the last line of the
                ninth panel. For a page whose whole value rests on price
                freshness it belongs where the figures are first read. */}
            {` · priced ${today()}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
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

          {/*
            The way out of this page, and previously absent entirely: the
            proposal route had no link from anywhere in the application, so the
            document this product exists to produce could only be reached by
            typing its URL.
          */}
          <Link
            href={`/scenarios/${id}/proposal`}
            className="bg-accent text-ground hover:bg-accent/90 ml-1 inline-flex items-center rounded-(--radius-control) px-3 py-1.5 text-sm font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-colors"
          >
            Proposal →
          </Link>
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
        Below `xl`, the whole of this page's navigation. It renders here, as a
        child of `main`, rather than in the grid below: `position: sticky` can
        only travel inside its containing block, and in that grid it would get a
        51px row of its own to travel in.

        After the two warnings and not before them. A stack that cannot fund a
        compliance obligation is the first thing an analyst has to see, and a
        navigation aid that pushes it down the page has its priorities the wrong
        way round. It still pins the moment it reaches the header on the way
        down, which is the only time it is needed.
      */}
      <SectionJump sections={RESULTS_SECTIONS} />

      {/*
        Two columns from `xl` up: the panels, and a rail that says where in them
        you are. The page is fourteen thousand pixels tall, and before this the
        only route to the assumptions was to scroll past a 240-row coverage
        matrix and hope.

        Below `xl`, `SectionJump` above draws one sticky row instead, because a
        rail gated at 1280px is a rail this machine never renders (CONTRIBUTING
        Gotcha: 125% display scaling puts a 1568-pixel panel at 1254 CSS px).
        The longest page in the application had no navigation on the laptop it
        is demoed from.

        The jump bar sits outside this grid deliberately: inside it, it became a
        grid row of its own and `position: sticky` had only that row's height to
        travel in, so it scrolled away instead of pinning. The rail has the
        opposite need and stays in the grid, whose second column is as tall as
        the panels beside it.

        `.section-anchor` on each target clears the sticky header, and the jump
        bar underneath it at the widths where that one renders.
      */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_180px]">
        <SectionRail sections={RESULTS_SECTIONS} />

        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-1">
          {/*
            The answer first. Everything below is the working, in the order the
            engine derives it, which is not the order a reader needs it in.
          */}
          <div id="summary" className="section-anchor">
            <ExecutiveSummary
              result={result}
              bundle={bundle}
              coverage={coverage}
              profile={scenario.profile}
              scenarioId={id}
              fx={data.fx}
              pricedAsOf={today()}
            />
          </div>

          <div id="bundles" className="section-anchor">
            <BundleComparison result={result} selectedKind={kind} scenarioId={id} fx={data.fx} />
          </div>

          <div id="categories" className="section-anchor">
            <CategoryCards result={result} bundle={bundle} />
          </div>

          {/*
            Before the cost breakdown, deliberately. The breakdown answers what
            the stack costs to own and run; this answers what the client is
            asked to pay, and on a managed engagement those are different
            questions with an order-of-magnitude between them.
          */}
          <div id="engagement" className="section-anchor">
            <Engagement
              bundle={bundle}
              profile={scenario.profile}
              scenarioId={id}
              showInternal={showInternal}
            />
          </div>

          {/*
            After "who pays" and before the cost breakdown. The people question
            is the one a client asks straight after the money question, and the
            answer has to be next to it rather than buried under the charts.
          */}
          <div id="staffing" className="section-anchor">
            <Staffing result={result} profile={scenario.profile} />
          </div>

          <div id="cost" className="section-anchor">
            <CostBreakdown bundle={bundle} fx={data.fx} />
          </div>

          <div id="coverage" className="section-anchor">
            <CoverageMatrix coverage={coverage} />
          </div>

          <div id="gaps" className="section-anchor flex flex-col gap-3">
            <GapAnalysis coverage={coverage} />
            {/*
              Under the gap table, not above it. The plan is only meaningful
              once the reader has seen what is open and why, and a remediation
              button offered before the diagnosis invites clicking it instead of
              reading it.
            */}
            <CloseGaps
              scenarioId={id}
              plan={planGapClosure(bundle, coverage, scenario.profile.budget, result.phase2)}
            />
          </div>

          <div id="sizing" className="section-anchor">
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

          <div id="assumptions" className="section-anchor">
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
      </div>
    </main>
  );
}
