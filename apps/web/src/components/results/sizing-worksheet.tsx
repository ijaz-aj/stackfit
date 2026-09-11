import type { SizingResult } from '@stackfit/engine';
import type { SizingAssumptions } from '@stackfit/schema';

import { Card, Stat } from '@/components/ui';
import { ASSET_LABELS } from '@/components/wizard/labels';
import { formatNumber } from '@/lib/format';

/**
 * §8.6 — the sizing worksheet, with every assumption visible.
 *
 * Visible means the coefficient *and* the reason for it. Each of the thirty
 * asset classes carries a mandatory `basis` string in
 * `data/config/sizing-assumptions.yaml` precisely so this table can show what a
 * number was derived from, and an analyst can disagree with it out loud on the
 * call rather than distrusting the total in silence.
 */
export function SizingWorksheet({
  sizing,
  assumptions,
}: {
  sizing: SizingResult;
  assumptions: SizingAssumptions;
}) {
  const rows = sizing.perAssetClass;
  const share = (eps: number) => (sizing.epsTotal === 0 ? 0 : (eps / sizing.epsTotal) * 100);

  return (
    <Card
      title="Sizing worksheet"
      hint="Every downstream number starts here. The coefficients are analyst estimates, and each one states what it was derived from."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Events/sec" value={formatNumber(sizing.epsTotal)} tone="accent" />
        <Stat label="GB/day" value={formatNumber(sizing.gbPerDay, 1)} />
        <Stat
          label="Licensed GB/day"
          value={formatNumber(sizing.licensedGbPerDay, 1)}
          hint={`peak factor ${assumptions.peakFactor}`}
        />
        <Stat
          label="Storage"
          value={formatNumber(sizing.storageTb, 2)}
          unit="TB"
          hint={`${sizing.retentionDays}d retention`}
        />
        <Stat label="Monitored assets" value={formatNumber(sizing.monitoredAssetCount)} />
        <Stat label="Scale class" value={sizing.scaleClass} />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12px]">
            <thead>
              <tr className="text-faint text-left text-[10px] tracking-wide uppercase">
                <th className="py-1.5 pr-3 font-medium">Asset class</th>
                <th className="py-1.5 pr-3 text-right font-medium">Count</th>
                <th className="py-1.5 pr-3 text-right font-medium">EPS each</th>
                <th className="py-1.5 pr-3 text-right font-medium">EPS</th>
                <th className="py-1.5 pr-3 text-right font-medium">Share</th>
                <th className="py-1.5 font-medium">Where the coefficient comes from</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.assetClass} className="border-line border-t align-top">
                  <td className="py-1.5 pr-3">{ASSET_LABELS[row.assetClass] ?? row.assetClass}</td>
                  <td className="tabular py-1.5 pr-3 text-right">{formatNumber(row.count)}</td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {formatNumber(row.eventsPerSecondPerAsset, 2)}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {formatNumber(row.eventsPerSecond, 1)}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {formatNumber(share(row.eventsPerSecond), 1)}%
                  </td>
                  <td className="text-faint py-1.5 text-[11px] leading-snug">
                    {assumptions.assetClasses[row.assetClass]?.basis ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="text-faint mt-3 flex flex-col gap-1 text-[11px] leading-snug">
        {sizing.rationale.map((line) => (
          <li key={line}>— {line}</li>
        ))}
      </ul>

      <p className="border-line text-faint mt-3 border-t pt-2 text-[11px] leading-snug">
        Editing: the counts, the log-verbosity profile and the framework selection that sets
        retention are all editable in the intake wizard, and every figure here moves with them.
        Per-coefficient overrides — telling the tool that <em>these</em> firewalls are quieter than
        the default — are not in yet, and are the obvious next thing this table wants.
      </p>
    </Card>
  );
}
