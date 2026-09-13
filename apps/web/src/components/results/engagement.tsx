import type { Bundle } from '@stackfit/engine';
import { CATEGORY_LABELS, SERVICE_LEVEL_LABELS } from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';
import Link from 'next/link';

import { Card } from '@/components/ui';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * Who pays for what, on this engagement.
 *
 * The section exists because the headline cost figure answered the wrong
 * question for two of the three delivery models. `tco` and `annualSpend` are
 * what the stack costs to own and run, which is exactly right when the client
 * operates it and badly wrong when we do: on the committed hospital preset it
 * was USD 1.2M a year of the client's own security salaries, for an engagement
 * where our SOC runs the stack and they hire nobody.
 *
 * Everything here is read off `bundle.attribution`; nothing is computed in the
 * component (hard rule 4).
 */
export function Engagement({
  bundle,
  profile,
  scenarioId,
  /**
   * Render our fee, our cost base and our margin.
   *
   * Off by default and driven by `?view=internal` on the URL, so on the screen
   * an analyst turns toward a client those figures are not in the document at
   * all. They were previously always rendered and merely collapsed inside a
   * `<details>`, which is a convention rather than a guarantee; the exports
   * have the real one (`buildProposal` never receives `attribution`) and this
   * brings the screen into line with it.
   */
  showInternal,
}: {
  bundle: Bundle;
  profile: ClientProfile;
  scenarioId: string;
  showInternal: boolean;
}) {
  const { attribution } = bundle;
  const weOperate = !attribution.bySelection.every((entry) => entry.operator === 'client');

  const ours = attribution.bySelection.filter((entry) => entry.operator === 'provider');
  const theirs = attribution.bySelection.filter((entry) => entry.operator === 'client');

  return (
    <Card
      className="min-w-0"
      title={weOperate ? 'What the client pays' : 'What this costs to own and run'}
      hint={
        weOperate
          ? `We operate ${ours.length} of ${attribution.bySelection.length} categories at the "${
              SERVICE_LEVEL_LABELS[profile.serviceLevel ?? ''] ?? profile.serviceLevel
            }" level. Their people are costed only for what they still run.`
          : 'The client operates every category, so what they pay is what the stack costs, their own effort included.'
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dl className="flex flex-col gap-2 text-sm">
            {weOperate && (
              <Row label="Our fee" value={formatMoney(attribution.providerFeeAnnual)} />
            )}
            <Row
              label="Licences they buy"
              value={formatMoney(attribution.clientProcurementAnnual)}
            />
            <Row
              label={weOperate ? 'Their people, for what they run' : 'Their people'}
              value={formatMoney(attribution.clientOpsAnnual)}
            />
            <div className="border-line mt-1 border-t pt-2">
              <Row
                label={weOperate ? 'Client pays, per year' : 'Total, per year'}
                value={
                  <span className="text-ink font-semibold">
                    {formatMoney(attribution.clientTotalAnnual)}
                  </span>
                }
              />
            </div>
          </dl>

          {weOperate && (
            <>
              {/*
                Our own operational cost, stated and never added. It is what the
                fee has to cover before it covers anything else, and leaving it
                out entirely would make the fee look like pure margin.
              */}
              <p className="text-faint mt-3 text-xs leading-snug">
                {formatMoney(attribution.providerOpsAnnual)} a year of operational effort is
                ours, and is not in the figure above. It is our cost base, stated at the
                client&rsquo;s regional labour rate because that is the only rate this tool holds.
              </p>
              <p className="text-faint mt-2 text-xs leading-snug">
                Owning and running all of it themselves would be{' '}
                {formatMoney(attribution.fullBuildAnnual)} a year. That is the build-versus-buy
                comparison, not what they are being asked to pay.
              </p>
            </>
          )}
        </div>

        <div className="min-w-0">
          <SplitList title="We operate" entries={ours} empty="Nothing. The client runs it all." />
          <SplitList
            title="They operate"
            entries={theirs}
            empty="Nothing. Every category is inside our service level."
          />
        </div>
      </div>

      {/*
        Our own numbers, and the reason they are collapsed and labelled.
        This page is the one an analyst turns toward the client, and a margin
        figure sitting open on it is a commercial accident waiting to happen.
        The client-facing exports never receive `attribution` at all, which is
        the stronger guarantee; this is the weaker one that covers the screen.
      */}
      {/*
        A door rather than the room. Switching views is a deliberate act with a
        visible URL change, which is what makes it safe to do on a shared
        screen: the analyst can see, from the address bar, which mode they are
        in before they turn the laptop round.
      */}
      {weOperate && !showInternal && (
        <p className="border-line text-faint mt-4 border-t pt-3 text-xs print:hidden">
          <Link href={`/scenarios/${scenarioId}/results?view=internal`} className="text-muted hover:text-ink underline underline-offset-2">
            Show what this engagement costs us
          </Link>{' '}
          — our fee, cost base and margin. Not on this screen by default, and never in the
          exports.
        </p>
      )}

      {weOperate && showInternal && (
        <div className="border-warn/40 bg-warn/10 mt-4 rounded-(--radius-card) border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-warn text-xs font-medium tracking-wide uppercase">
              Internal view · do not show the client
            </p>
            <Link
              href={`/scenarios/${scenarioId}/results`}
              className="text-muted hover:text-ink text-xs underline underline-offset-2 print:hidden"
            >
              Hide
            </Link>
          </div>
          <dl className="mt-2 flex flex-col gap-2 text-sm">
            <Row label="Our fee" value={formatMoney(attribution.providerFeeAnnual)} />
            <Row
              label="Costs us to run, per year"
              value={formatMoney(attribution.providerRunAnnual)}
            />
            {/*
              The two halves of that run cost, indented under it. They are
              different quantities measured different ways: administration is
              per tool and scales with the estate, the rota is per client and
              scales with shift coverage. Showing only the total is how they
              come to be read as one number, which is the order-of-magnitude
              mistake `staffing.ts` exists to prevent.
            */}
            <Row
              label="— tool administration"
              value={formatMoney(attribution.providerAdministrationAnnual)}
              muted
            />
            <Row
              label={`— 24/7 rota (${formatNumber(attribution.providerMonitoringFte, 2)} FTE)`}
              value={formatMoney(attribution.providerMonitoringAnnual)}
              muted
            />
            <Row
              label="Costs us to stand up, once"
              value={formatMoney(attribution.providerDeliveryOneTime)}
            />
            <div className="border-line mt-1 border-t pt-2">
              <Row
                label="Margin, per year"
                value={
                  <span className="text-ink font-semibold">
                    {formatMoney(attribution.providerMarginAnnual)}
                    {attribution.providerMarginRate !== null && (
                      /*
                       * The rate, not just the amount. USD 677,077 reads as a
                       * large engagement; 94% reads as a rate card and a cost
                       * base written about different markets, which is what it
                       * actually is. The caveat underneath says so.
                       */
                      <span className="text-faint ml-1.5 font-normal">
                        {formatNumber(attribution.providerMarginRate * 100, 0)}% of the fee
                      </span>
                    )}
                  </span>
                }
              />
              <Row
                label="Margin, year one"
                value={formatMoney(attribution.providerMarginYearOne)}
              />
            </div>
          </dl>
          <ul className="text-faint mt-2 flex flex-col gap-1.5 text-xs leading-snug">
            {attribution.providerRationale.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {attribution.rationale.length > 0 && (
        <ul className="text-muted mt-4 flex flex-col gap-1.5 text-xs leading-snug">
          {attribution.rationale.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  /** A component of the row above it, rather than a figure in its own right. */
  muted = false,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className={`min-w-0 ${muted ? 'text-faint pl-3 text-xs' : 'text-muted'}`}>{label}</dt>
      <dd className={`tabular shrink-0 ${muted ? 'text-faint text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function SplitList({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: Bundle['attribution']['bySelection'];
  empty: string;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <h4 className="text-faint text-2xs mb-1 font-medium tracking-wide uppercase">{title}</h4>
      {entries.length === 0 ? (
        <p className="text-faint text-xs">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {entries.map((entry) => (
            <li
              key={entry.category}
              className="border-line bg-panel-raised text-muted min-w-0 rounded border px-2 py-0.5 text-xs"
              title={
                entry.licenceInOurFee
                  ? 'Licence is inside our fee rather than on their purchase order.'
                  : undefined
              }
            >
              {CATEGORY_LABELS[entry.category] ?? entry.category}
              {entry.licenceInOurFee && <span className="text-faint"> &middot; in fee</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
