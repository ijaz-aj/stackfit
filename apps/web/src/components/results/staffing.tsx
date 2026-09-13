import type { PipelineResult } from '@stackfit/engine';
import { CATEGORY_LABELS } from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';

import { Card } from '@/components/ui';
import { formatNumber } from '@/lib/format';

/**
 * How many people this client takes to run, and why that number.
 *
 * The section exists because "how many of your people are on my account" is a
 * question a client asks in the room, and the previous answer was a single FTE
 * total with a linear formula behind it that asked for 15.5 people to
 * administer one SIEM across a large estate.
 *
 * The two figures are deliberately separated and never summed on screen.
 * Administration scales with the estate; monitoring scales with shift
 * coverage. Reading one as the other understates by an order of magnitude, and
 * it is the mistake a reader makes unprompted, so the page has to prevent it
 * rather than merely avoid making it.
 *
 * Nothing is computed here (hard rule 4). Every number and every sentence comes
 * off `result.staffing`, which the engine produced with its own arithmetic
 * attached.
 */
export function Staffing({
  result,
  profile,
}: {
  result: PipelineResult;
  profile: ClientProfile;
}) {
  const { monitoring, administrationFte, administrationByProduct } = result.staffing;
  const weMonitor = profile.deliveryModel !== 'client_operated';

  return (
    <Card
      className="min-w-0"
      title="How many people this takes to run"
      hint="Two different questions, kept apart. Administration scales with the estate; monitoring scales with round-the-clock coverage and is the larger of the two."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <h3 className="text-ink mb-1 text-sm font-medium">
            Monitoring: {formatNumber(monitoring.fte, 2)} FTE
          </h3>
          <p className="text-muted mb-2 text-xs leading-snug">
            {weMonitor
              ? 'Our analysts watching their estate around the clock. This is what a managed engagement sells.'
              : 'What a round-the-clock rota over this estate would consume. The client operates it, so this is what they would have to staff.'}
          </p>

          <dl className="flex flex-col gap-2">
            {monitoring.terms.map((term) => (
              <div key={term.label} className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <dt className="text-muted min-w-0 text-xs">{term.label}</dt>
                  <dd className="tabular text-ink shrink-0 text-xs">
                    {formatNumber(term.value, 2)}
                  </dd>
                </div>
                <p className="text-faint mt-0.5 text-xs leading-snug">{term.explanation}</p>
              </div>
            ))}
          </dl>

          <p className="text-faint border-line mt-3 border-t pt-2 text-xs leading-snug">
            {monitoring.workingOut}
          </p>
        </section>

        <section className="min-w-0">
          <h3 className="text-ink mb-1 text-sm font-medium">
            Administration: {formatNumber(administrationFte, 2)} FTE
          </h3>
          <p className="text-muted mb-2 text-xs leading-snug">
            Deploying, tuning, patching and upgrading the tools themselves. Not watching what they
            produce.
          </p>

          <ul className="flex flex-col gap-1">
            {administrationByProduct.map((entry) => (
              <li
                key={entry.productId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
              >
                <span className="text-muted min-w-0 truncate">
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                  <span className="text-faint"> · {entry.deploymentMode.replace('_', '-')}</span>
                </span>
                <span className="tabular text-ink shrink-0">{formatNumber(entry.fte, 2)}</span>
              </li>
            ))}
          </ul>

          {/*
            The caveat belongs next to the total, not in a footnote. A straight
            sum across products with no overlap overstates what one team really
            carries, and a thirteen-tool stack is where that bites hardest.
          */}
          <p className="text-faint border-line mt-3 border-t pt-2 text-xs leading-snug">
            ⚠ This is a straight sum across {administrationByProduct.length} products with no
            overlap between them. Two tools run by the same engineer share context, tooling and
            on-call, so the real figure for one team is lower. Honest per product, pessimistic in
            aggregate.
          </p>
        </section>
      </div>

      <p className="text-faint border-line mt-4 border-t pt-3 text-xs leading-snug">
        The two figures above are not added together, and should not be. Every per-product
        administration figure is an analyst estimate; no publisher quotes a staffing ratio per
        thousand assets. The monitoring figure is arithmetic over published ones, and the
        assumptions it rests on are named in <code>data/config/staffing-model.yaml</code>.
      </p>
    </Card>
  );
}
