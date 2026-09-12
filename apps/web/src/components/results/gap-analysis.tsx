import type { CoverageResult } from '@stackfit/engine';

import { Badge, Card } from '@/components/ui';
import { CATEGORY_LABELS } from '@/components/wizard/labels';
import { formatMoney, formatNumber } from '@/lib/format';

const RISK_TONE = {
  critical: 'bad',
  high: 'bad',
  medium: 'warn',
  low: 'neutral',
} as const;

/**
 * §8.5 — what is not covered, and what closing it would cost.
 *
 * Two views of one answer, and they cross-reference rather than compete. Each
 * gap names the cheapest single fix, which is the question §7.5 asks. The
 * remediation plan names the fewest purchases that close the most gaps, which is
 * the question a shopping list answers — one product doing three jobs beats
 * three products doing one each.
 */
export function GapAnalysis({ coverage }: { coverage: CoverageResult }) {
  const { gaps, remediation } = coverage;

  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Gap analysis"
        hint={`${gaps.length} control(s) a purchase could satisfy that this bundle does not. Worst first.`}
      >
        {gaps.length === 0 ? (
          <p className="text-good text-[12px]">
            Every control a purchase could satisfy is covered by this bundle.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[12px]">
              <thead>
                <tr className="text-faint text-left text-[10px] tracking-wide uppercase">
                  <th className="py-1.5 pr-3 font-medium">Risk</th>
                  <th className="py-1.5 pr-3 font-medium">Control</th>
                  <th className="py-1.5 pr-3 font-medium">Would be closed by</th>
                  <th className="py-1.5 pr-3 font-medium">Cheapest fix</th>
                  <th className="py-1.5 text-right font-medium">Procurement / yr</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((gap) => (
                  <tr key={gap.controlId} className="border-line border-t align-top">
                    <td className="py-2 pr-3">
                      <Badge tone={RISK_TONE[gap.residualRisk]}>{gap.residualRisk}</Badge>
                      {gap.mandatory && gap.inScope && (
                        <span className="text-bad mt-0.5 block text-[10px]">obligation</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="tabular text-ink block">{gap.controlId}</span>
                      <span className="text-faint block text-[11px] leading-snug">{gap.title}</span>
                    </td>
                    <td className="text-muted py-2 pr-3 text-[11px]">
                      {gap.satisfiedBy
                        .map((category) => CATEGORY_LABELS[category] ?? category)
                        .join(', ')}
                    </td>
                    <td className="py-2 pr-3">
                      {gap.cheapestCloser === null ? (
                        <span className="text-faint text-[11px]">
                          nothing in the catalog closes this
                        </span>
                      ) : (
                        <>
                          <span className="text-ink block">
                            {gap.cheapestCloser.productName}
                            <span className="text-faint"> — {gap.cheapestCloser.tierName}</span>
                          </span>
                          {gap.cheapestCloser.upgradeFromTierName !== null && (
                            <span className="text-good block text-[10px]">
                              upgrade from {gap.cheapestCloser.upgradeFromTierName}, already owned
                            </span>
                          )}
                          {!gap.cheapestCloser.closesFully && (
                            <span className="text-warn block text-[10px]">
                              right category, does not claim the control
                            </span>
                          )}
                          {gap.remediationProductId !== null &&
                            gap.remediationProductId !== gap.cheapestCloser.productId && (
                              <span className="text-faint block text-[10px]">
                                plan buys {gap.remediationProductId} instead
                              </span>
                            )}
                        </>
                      )}
                    </td>
                    <td className="tabular py-2 text-right">
                      {gap.cheapestCloser === null
                        ? '—'
                        : formatMoney(gap.cheapestCloser.annualSpend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {remediation.length > 0 && (
        <Card
          title="What it would cost to fix"
          hint="The fewest purchases that close the most gaps — not the cheapest fix for each gap taken one at a time, which buys a second tool to do a job something on the list already does."
        >
          <ul className="flex flex-col gap-2">
            {remediation.map((option) => (
              <li
                key={`${option.productId}::${option.tierId}`}
                className="border-line rounded border px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-ink text-[13px]">
                    {option.productName}
                    <span className="text-muted"> — {option.tierName}</span>
                  </span>
                  {option.upgradeFromTierName !== null && (
                    <Badge tone="good">upgrade, not a new tool</Badge>
                  )}
                  <Badge>{CATEGORY_LABELS[option.category] ?? option.category}</Badge>
                  <Badge tone={RISK_TONE[option.worstResidualRisk]}>
                    worst gap {option.worstResidualRisk}
                  </Badge>
                  <span className="tabular text-muted ml-auto text-[12px]">
                    {formatMoney(option.annualSpend)}/yr · {formatMoney(option.oneTime)} once ·{' '}
                    {formatNumber(option.opsFte, 2)} FTE
                  </span>
                </div>
                <ul className="text-faint mt-1 flex flex-col gap-0.5 text-[11px] leading-snug">
                  {option.rationale.map((line) => (
                    <li key={line}>— {line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <dl className="border-line mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-[12px] sm:grid-cols-3">
            <div>
              <dt className="text-faint text-[10px] tracking-wide uppercase">Annual procurement</dt>
              <dd className="tabular text-ink">{formatMoney(coverage.remediationAnnualSpend)}</dd>
            </div>
            <div>
              <dt className="text-faint text-[10px] tracking-wide uppercase">One-time</dt>
              <dd className="tabular text-ink">{formatMoney(coverage.remediationOneTime)}</dd>
            </div>
            <div>
              <dt className="text-faint text-[10px] tracking-wide uppercase">Additional effort</dt>
              <dd className="tabular text-ink">
                {formatNumber(coverage.remediationOpsFte, 2)} FTE
              </dd>
            </div>
          </dl>
          <p className="text-faint mt-2 text-[11px] leading-snug">
            Money and people are reported separately, deliberately. A stated security budget is a
            procurement figure, and salary is not procurement.
          </p>
        </Card>
      )}

      {coverage.unclosableGaps.length > 0 && (
        <Card title="What StackFit cannot close">
          <p className="text-muted text-[12px] leading-snug">
            {coverage.unclosableGaps.length} gap(s) have no product in this catalog that could close
            them for this client: {coverage.unclosableGaps.join(', ')}.
          </p>
          <p className="text-faint mt-1 text-[11px] leading-snug">
            That is a gap in the catalog, not in the client. Phase 7 — catalog expansion — is what
            changes this number.
          </p>
        </Card>
      )}
    </div>
  );
}
