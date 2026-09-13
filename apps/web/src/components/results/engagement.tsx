import type { Bundle } from '@stackfit/engine';
import { CATEGORY_LABELS, SERVICE_LEVEL_LABELS } from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';

import { Card } from '@/components/ui';
import { formatMoney } from '@/lib/format';

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
export function Engagement({ bundle, profile }: { bundle: Bundle; profile: ClientProfile }) {
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-muted min-w-0">{label}</dt>
      <dd className="tabular shrink-0">{value}</dd>
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
