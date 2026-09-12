'use client';

import type { SizingResult } from '@stackfit/engine';
import type { AssetClass, SizingAssumptions, SizingOverrides } from '@stackfit/schema';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ASSET_LABELS } from '@/components/wizard/labels';
import { Badge, Button, Card, NumberInput, RationaleList, Stat } from '@/components/ui';
import { saveSizingOverrides } from '@/lib/actions';
import { formatNumber } from '@/lib/format';

/**
 * §8.6. The sizing worksheet, with every assumption visible *and editable*.
 *
 * Visible means the coefficient and the reason for it: each of the thirty asset
 * classes carries a mandatory `basis` in the committed config precisely so this
 * table can show what a number was derived from.
 *
 * Editable means editable here, for this client, on this call. The analyst who
 * knows these firewalls are quieter than the default should be able to say so
 * and watch every downstream figure move, without editing the repo. The
 * defaults are never touched; the override is stored with the scenario, and
 * the row says what it replaced.
 */
const SAVE_DEBOUNCE_MS = 600;

export function SizingWorksheet({
  scenarioId,
  sizing,
  assumptions,
  defaults,
  overrides,
}: {
  scenarioId: string;
  sizing: SizingResult;
  /** The coefficients this run used, overrides folded in. */
  assumptions: SizingAssumptions;
  /** The committed values, for showing what an override replaced. */
  defaults: SizingAssumptions;
  overrides: SizingOverrides;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<SizingOverrides>(overrides);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) return undefined;

    const timer = setTimeout(() => {
      setState('saving');
      void saveSizingOverrides({ id: scenarioId, overrides: draft }).then(
        (result) => {
          if (result.ok) {
            setState('saved');
            setProblem(null);
            // The page is server-rendered off the engine, so the way to show
            // new numbers is to ask the server for them again. Not to
            // recompute a second version of the truth in the browser.
            router.refresh();
          } else {
            setState('error');
            setProblem(result.problem ?? 'could not save');
          }
        },
        (error: unknown) => {
          setState('error');
          setProblem(String(error));
        },
      );
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft, router, scenarioId]);

  const update = (change: (current: SizingOverrides) => SizingOverrides) => {
    dirty.current = true;
    setDraft(change);
  };

  const setEps = (assetClass: AssetClass, value: string) => {
    update((current) => {
      const next = { ...current.eventsPerSecond };
      if (value === '') delete next[assetClass];
      else next[assetClass] = Math.max(0, Number(value) || 0);
      return { ...current, eventsPerSecond: next };
    });
  };

  const setKnob = (
    key: 'averageEventBytes' | 'peakFactor' | 'compressionRatio' | 'retentionDays',
    value: string,
  ) => {
    update((current) => {
      const next = { ...current };
      if (value === '') delete next[key];
      else next[key] = Number(value);
      return next;
    });
  };

  const overriddenCount =
    Object.keys(draft.eventsPerSecond ?? {}).length +
    (['averageEventBytes', 'peakFactor', 'compressionRatio', 'retentionDays'] as const).filter(
      (key) => draft[key] !== undefined,
    ).length;

  const share = (eps: number) => (sizing.epsTotal === 0 ? 0 : (eps / sizing.epsTotal) * 100);

  return (
    <Card
      title="Sizing worksheet"
      hint="Every downstream number starts here. The coefficients are analyst estimates. Correct any of them for this client and the whole page re-derives."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {overriddenCount > 0 ? (
          <Badge tone="warn">{overriddenCount} assumption(s) overridden for this client</Badge>
        ) : (
          <Badge>committed defaults</Badge>
        )}
        <span className="text-faint text-xs">
          {state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : ''}
          {state === 'error' && <span className="text-bad">Not saved. {problem}</span>}
        </span>
        {overriddenCount > 0 && (
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => update(() => ({ eventsPerSecond: {} }))}
          >
            Reset to defaults
          </Button>
        )}
      </div>

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

      <div className="border-line mt-4 grid gap-3 border-t pt-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs tracking-wide uppercase">Bytes per event</span>
          <NumberInput
            min={1}
            value={draft.averageEventBytes ?? ''}
            placeholder={String(defaults.averageEventBytes)}
            onChange={(event) => setKnob('averageEventBytes', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs tracking-wide uppercase">Peak factor</span>
          <NumberInput
            min={1}
            step={0.1}
            value={draft.peakFactor ?? ''}
            placeholder={String(defaults.peakFactor)}
            onChange={(event) => setKnob('peakFactor', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs tracking-wide uppercase">Compression</span>
          <NumberInput
            min={0}
            max={0.95}
            step={0.05}
            value={draft.compressionRatio ?? ''}
            placeholder={String(defaults.compressionRatio)}
            onChange={(event) => setKnob('compressionRatio', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-xs tracking-wide uppercase">Retention (days)</span>
          <NumberInput
            min={1}
            value={draft.retentionDays ?? ''}
            placeholder={String(defaults.retention.defaultDays)}
            onChange={(event) => setKnob('retentionDays', event.target.value)}
          />
        </label>
      </div>
      <p className="text-faint mt-1 text-xs leading-snug">
        Blank means the committed default. Retention sets the floor only. A selected framework can
        still lengthen it, and never shortens it.
      </p>

      {sizing.perAssetClass.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-faint text-left text-2xs tracking-wide uppercase">
                <th className="py-2 pr-3 font-medium">Asset class</th>
                <th className="py-2 pr-3 text-right font-medium">Count</th>
                <th className="py-2 pr-3 text-right font-medium">EPS each</th>
                <th className="py-2 pr-3 text-right font-medium">EPS</th>
                <th className="py-2 pr-3 text-right font-medium">Share</th>
                <th className="py-2 font-medium">Where the coefficient comes from</th>
              </tr>
            </thead>
            <tbody>
              {sizing.perAssetClass.map((row) => {
                const overridden = draft.eventsPerSecond?.[row.assetClass] !== undefined;
                return (
                  <tr key={row.assetClass} className="border-line border-t align-top">
                    <td className="py-2 pr-3">{ASSET_LABELS[row.assetClass] ?? row.assetClass}</td>
                    <td className="tabular py-2 pr-3 text-right">{formatNumber(row.count)}</td>
                    <td className="py-2 pr-3">
                      <NumberInput
                        aria-label={`${ASSET_LABELS[row.assetClass] ?? row.assetClass} events per second`}
                        min={0}
                        step={0.05}
                        className={overridden ? 'border-warn/60' : undefined}
                        value={draft.eventsPerSecond?.[row.assetClass] ?? ''}
                        placeholder={String(defaults.assetClasses[row.assetClass].eventsPerSecond)}
                        onChange={(event) => setEps(row.assetClass, event.target.value)}
                      />
                    </td>
                    <td className="tabular py-2 pr-3 text-right">
                      {formatNumber(row.eventsPerSecond, 1)}
                    </td>
                    <td className="tabular py-2 pr-3 text-right">
                      {formatNumber(share(row.eventsPerSecond), 1)}%
                    </td>
                    <td className="text-faint py-2 text-xs leading-snug">
                      {assumptions.assetClasses[row.assetClass].basis}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RationaleList lines={sizing.rationale} className="text-faint mt-3" />
    </Card>
  );
}
