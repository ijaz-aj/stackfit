import type { Bundle, CoverageResult, PipelineResult } from '@stackfit/engine';
import type { ClientProfile, FxConfig } from '@stackfit/schema';
import Link from 'next/link';

import { MoneyWithRupees } from '@/components/money';
import { Badge, Card } from '@/components/ui';
import { frameworkLabel } from '@/components/wizard/labels';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * The answer, before the working.
 *
 * Everything else on this page is ordered the way the engine derives it:
 * sizing feeds cost feeds scoring feeds portfolio feeds coverage. That is the
 * right order for producing an answer and the wrong one for reading it, and
 * before this panel existed the first thing on the page was a six-column
 * comparison table. An executive had to assemble the recommendation themselves
 * out of nine panels, which is the work they are paying us to have already
 * done.
 *
 * Nothing here is computed (hard rule 4). Every figure is read off the same
 * pipeline result the panels below render, so this cannot drift from them; the
 * only thing this component decides is which four of them matter first and in
 * what order.
 *
 * Written for someone who will not read the rest of the page. If they read
 * only this, they should still be able to say what we recommend, what it
 * costs, what it buys and what they have to decide.
 */
export function ExecutiveSummary({
  result,
  bundle,
  coverage,
  profile,
  scenarioId,
  fx,
  pricedAsOf,
}: {
  result: PipelineResult;
  bundle: Bundle;
  coverage: CoverageResult;
  profile: ClientProfile;
  scenarioId: string;
  fx: FxConfig;
  pricedAsOf: string;
}) {
  const horizon = profile.budget.horizonYears;
  const year1 = bundle.selections.reduce(
    (total, selection) => total + selection.cost.year1.amountMinor,
    0,
  );
  const year1Money = { amountMinor: year1, currency: bundle.currency };

  const inScope = coverage.frameworks.filter((framework) => framework.inScope);
  const criticalGaps = coverage.gaps.filter((gap) => gap.residualRisk === 'critical').length;

  /*
   * The decision this page is asking for, in the order the analyst has to
   * raise it. A shortfall outranks a gap: no amount of discussion about
   * coverage matters if the budget cannot buy what compliance already
   * requires.
   */
  const decisions: { tone: 'bad' | 'warn' | 'good'; text: string }[] = [];

  if (!result.sizing.estateCaptured) {
    decisions.push({
      tone: 'bad',
      text:
        'No estate has been captured, so every figure here is the floor cost of owning these ' +
        'tools rather than the cost of protecting anything. Fill in the estate before this is ' +
        'read as a recommendation.',
    });
  }

  if (bundle.unfundedMandatory.length > 0) {
    decisions.push({
      tone: 'bad',
      text:
        `The stated budget cannot fund ${bundle.unfundedMandatory.length} ` +
        `${bundle.unfundedMandatory.length === 1 ? 'category' : 'categories'} that the selected ` +
        'frameworks make mandatory. That is a budget decision, and it is reported here rather ' +
        'than hidden by recommending a stack that does not meet the obligation.',
    });
  }

  if (bundle.annualShortfall !== null) {
    decisions.push({
      tone: 'bad',
      text:
        `The annual budget is short by ${formatMoney(bundle.annualShortfall)} a year` +
        (bundle.minimumViableAnnual !== null
          ? `; the minimum that covers the mandatory set is ${formatMoney(bundle.minimumViableAnnual)} a year.`
          : '.'),
    });
  }

  if (bundle.oneTimeShortfall !== null) {
    decisions.push({
      tone: 'bad',
      text:
        `The implementation budget is short by ${formatMoney(bundle.oneTimeShortfall)}. This is a ` +
        'separate budget from the annual one and a larger annual budget will not fix it.',
    });
  }

  if (criticalGaps > 0) {
    decisions.push({
      tone: 'warn',
      text:
        `${criticalGaps} ${criticalGaps === 1 ? 'control is' : 'controls are'} graded critical and ` +
        'left open by this stack. Each one is listed with what would close it and what that costs.',
    });
  }

  if (result.phase2.selections.length > 0) {
    decisions.push({
      tone: 'warn',
      text:
        `${result.phase2.selections.length} further ${result.phase2.selections.length === 1 ? 'category is' : 'categories are'} ` +
        'worth buying and deliberately deferred to a later budget year. They are priced, so ' +
        'deferring them is a decision on the record rather than a silence.',
    });
  }

  if (decisions.length === 0) {
    decisions.push({
      tone: 'good',
      text:
        'Nothing is unfunded, no compliance obligation is unmet within the stated budget, and no ' +
        'control graded critical is left open. The decision is whether to proceed.',
    });
  }

  return (
    <Card
      className="min-w-0"
      title="In summary"
      hint={`Priced against ${pricedAsOf}. Every figure below is expanded, with its working, in the panels that follow.`}
    >
      {/*
        The recommendation as a sentence, because a reader who takes one thing
        from this page should take a sentence rather than a table cell.
      */}
      <p className="text-ink measure text-base leading-relaxed">
        {bundle.selections.length === 0 ? (
          <>Nothing could be recommended for {profile.orgName} within the stated constraints.</>
        ) : (
          <>
            For <strong>{profile.orgName}</strong> we recommend{' '}
            <strong>
              {bundle.selections.length}{' '}
              {bundle.selections.length === 1 ? 'security control' : 'security controls'}
            </strong>
            , costing <strong>{formatMoney(year1Money)}</strong> in year one and{' '}
            <strong>{formatMoney(bundle.annualRecurring)}</strong> a year after that, people
            included
            {inScope.length > 0 && (
              <>
                , covering{' '}
                <strong>
                  {coverage.summary.coveragePercent ?? 0}% of the {inScope.length === 1 ? '' : 'combined '}
                  {inScope.map((framework) => frameworkLabel(framework.frameworkId)).join(', ')}{' '}
                  controls a purchase can satisfy
                </strong>
              </>
            )}
            .
          </>
        )}
      </p>

      {/*
        Four figures, and the labels do the teaching. "Procurement" versus
        "all-in" is the licence-versus-people distinction this whole product
        exists to make, and the bundle table below assumes the reader already
        knows it. Here it is spelled out.
      */}
      <dl className="border-line mt-4 grid gap-px overflow-hidden rounded-(--radius-card) border sm:grid-cols-2 lg:grid-cols-4">
        {/*
          Both figures all-in, and that is a correction rather than a
          preference.

          This tile pair first shipped as year one (licence + support + infra +
          implementation + training + people) against `annualSpend` (licence +
          support + infra, no people). On the SaaS preset that read ₹5.29 crore
          falling to ₹7.99 lakh: a 66-fold collapse a year later, which is not
          what happens. The people do not go away, they were simply in one
          figure and not the other.

          Two numbers side by side are read as comparable whatever the labels
          underneath say, so the labels were never going to carry it. They are
          the same measure now, and the procurement split is stated in the note
          where it informs rather than misleads.
        */}
        <Figure
          label="Year one"
          value={<MoneyWithRupees money={year1Money} fx={fx} align="left" />}
          note="Everything: licences, infrastructure, implementation, training and people."
        />
        <Figure
          label="Each year after"
          value={<MoneyWithRupees money={bundle.annualRecurring} fx={fx} align="left" />}
          /*
            The uplift, named, because the page contradicted itself without it.
            This figure is the steady annual cost at today's rates; the
            cash-flow chart two panels down shows ₹51.6L and ₹52L for years two
            and three on the same scenario, because licences compound. Under a
            percent, and a reader who spots two different answers to "what does
            it cost after year one" stops trusting both.
          */
          note={`The same, without the one-off setup. ${formatMoney(bundle.annualSpend)} of it is licences and infrastructure; the rest is people. Licences rise a little each year with the subscription uplift — the cash-flow chart has each year separately.`}
        />
        <Figure
          label={`${horizon}-year total`}
          value={<MoneyWithRupees money={bundle.tco} fx={fx} align="left" />}
          note="Everything above, plus the people to run it."
        />
        <Figure
          label="People to run it"
          value={
            <span className="text-ink tabular text-lg font-semibold">
              {formatNumber(bundle.totalOpsFte, 2)} FTE
            </span>
          }
          note="Administering the tools. Watching what they produce is counted separately."
        />
      </dl>

      <section className="mt-4">
        <h3 className="text-ink text-sm font-medium">What needs deciding</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {decisions.map((decision) => (
            <li key={decision.text} className="flex items-start gap-2">
              <Badge tone={decision.tone}>
                {decision.tone === 'bad' ? 'blocker' : decision.tone === 'warn' ? 'decision' : 'clear'}
              </Badge>
              <span className="text-muted measure min-w-0 text-sm leading-snug">
                {decision.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/*
        The way out of this page. The proposal was previously reachable only by
        typing its URL, which meant the document this product exists to produce
        could not be found by clicking.
      */}
      <div className="border-line mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
        <Link
          href={`/scenarios/${scenarioId}/proposal`}
          className="bg-accent text-ground hover:bg-accent/90 inline-flex items-center rounded-(--radius-control) px-3 py-1.5 text-sm font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-colors"
        >
          Build the proposal →
        </Link>
        <span className="text-faint text-xs">
          Preview what the client receives, then download it as a Word document, a PDF, or a
          costed spreadsheet.
        </span>
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
}) {
  return (
    <div className="bg-panel-raised/40 flex min-w-0 flex-col gap-1 p-3">
      <dt className="text-faint text-2xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-ink min-w-0 text-lg font-semibold">{value}</dd>
      <p className="text-faint text-xs leading-snug">{note}</p>
    </div>
  );
}
