'use client';

import { computeSizing, type SizingResult } from '@stackfit/engine';
import type { AssetInventory, ClientProfile, SizingAssumptions } from '@stackfit/schema';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { estimateScenario, saveScenario } from '@/lib/actions';
import { cn } from '@/lib/cn';
import type { EstimateSummary } from '@/lib/estimate';

import { LiveReadout } from './readout';
import { StepBudget } from './step-budget';
import { StepCompliance, type FrameworkOption } from './step-compliance';
import { StepEstate } from './step-estate';
import { StepOrganisation } from './step-organisation';
import { StepPreferences, type ProductOption } from './step-preferences';
import { StepReview } from './step-review';
import { useWizard, useWizardApi, WizardStoreProvider, type SaveState } from './store';

/** §9: six steps maximum. An analyst on a call cannot fill eighty fields. */
const STEPS = [
  { title: 'Organisation', hint: 'Who they are' },
  { title: 'Estate', hint: 'What they run' },
  { title: 'Compliance', hint: 'What they answer to' },
  { title: 'Budget', hint: 'What they can spend' },
  { title: 'Preferences', hint: 'How they buy' },
  { title: 'Review', hint: 'What it produced' },
] as const;

/** Long enough not to write on every keystroke, short enough to feel continuous. */
const SAVE_DEBOUNCE_MS = 700;
/** The estimate runs the whole engine, so it waits a little longer. */
const ESTIMATE_DEBOUNCE_MS = 350;

export interface WizardProps {
  readonly scenario: { id: string; profile: ClientProfile; inventory: AssetInventory };
  readonly frameworks: readonly FrameworkOption[];
  readonly products: readonly ProductOption[];
  readonly sizingAssumptions: SizingAssumptions;
}

export function Wizard(props: WizardProps) {
  return (
    <WizardStoreProvider seed={props.scenario}>
      <WizardBody {...props} />
    </WizardStoreProvider>
  );
}

function WizardBody({ scenario, frameworks, products, sizingAssumptions }: WizardProps) {
  const scenarioId = scenario.id;
  const api = useWizardApi();
  const step = useWizard((state) => state.step);
  const setStep = useWizard((state) => state.setStep);
  const revision = useWizard((state) => state.revision);
  const profile = useWizard((state) => state.profile);
  const inventory = useWizard((state) => state.inventory);
  const saveState = useWizard((state) => state.saveState);
  const saveProblem = useWizard((state) => state.saveProblem);

  const [estimate, setEstimate] = useState<EstimateSummary | null>(null);
  const [estimating, setEstimating] = useState(true);
  const [estimateProblem, setEstimateProblem] = useState<string | null>(null);

  /**
   * Ingest, computed in the browser.
   *
   * The engine is pure TypeScript with no I/O, so it runs here as happily as on
   * the server — which means the number that matters most while typing updates
   * with no round trip, and it is the same function the proposal will use.
   */
  const sizing: SizingResult | null = useMemo(() => {
    try {
      return computeSizing(inventory, profile, sizingAssumptions);
    } catch {
      // A half-typed draft can briefly be unsizeable. The readout says so
      // rather than taking the page down.
      return null;
    }
  }, [inventory, profile, sizingAssumptions]);

  // Continuous save (§9).
  useEffect(() => {
    if (revision === 0) return undefined;

    const timer = setTimeout(() => {
      const state = api.getState();
      state.markSaving();
      void saveScenario({ id: state.id, profile: state.profile, inventory: state.inventory }).then(
        (result) => {
          if (result.ok) api.getState().markSaved(result.savedAt);
          else api.getState().markSaveFailed(result.problem ?? 'save failed');
        },
        (error: unknown) => api.getState().markSaveFailed(String(error)),
      );
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [api, revision]);

  // Live estimate. A sequence number guards against a slow early response
  // landing after a fast later one and showing stale figures.
  const estimateSeq = useRef(0);
  useEffect(() => {
    const seq = estimateSeq.current + 1;
    estimateSeq.current = seq;
    setEstimating(true);

    const timer = setTimeout(() => {
      const state = api.getState();
      void estimateScenario({
        id: state.id,
        profile: state.profile,
        inventory: state.inventory,
      }).then(
        (result) => {
          if (seq !== estimateSeq.current) return;
          setEstimating(false);
          if (result.ok && result.summary !== undefined) {
            setEstimate(result.summary);
            setEstimateProblem(null);
          } else {
            setEstimateProblem(result.problem ?? 'could not estimate');
          }
        },
        (error: unknown) => {
          if (seq !== estimateSeq.current) return;
          setEstimating(false);
          setEstimateProblem(String(error));
        },
      );
    }, ESTIMATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [api, revision]);

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-6 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-faint hover:text-ink text-sm">
            ← scenarios
          </Link>
          <h1 className="text-ink text-lg font-semibold tracking-tight">
            {profile.orgName === '' ? 'Untitled' : profile.orgName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} problem={saveProblem} />
          <Link
            href={`/scenarios/${scenarioId}/results`}
            className="border-accent/60 bg-accent/10 text-accent hover:bg-accent/20 rounded border px-3 py-2 text-base transition-colors"
          >
            Results →
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_300px]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {STEPS.map((entry, index) => (
            <button
              key={entry.title}
              type="button"
              onClick={() => setStep(index)}
              className={cn(
                'shrink-0 rounded border px-3 py-2 text-left transition-colors',
                index === step
                  ? 'border-accent/60 bg-accent/10 text-ink'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <span className="block text-sm font-medium">
                <span className="text-faint tabular mr-1.5">{index + 1}</span>
                {entry.title}
              </span>
              <span className="text-faint hidden text-2xs lg:block">{entry.hint}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {step === 0 && <StepOrganisation />}
          {step === 1 && <StepEstate />}
          {step === 2 && <StepCompliance frameworks={frameworks} />}
          {step === 3 && <StepBudget />}
          {step === 4 && <StepPreferences products={products} />}
          {step === 5 && <StepReview sizing={sizing} estimate={estimate} />}

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep(Math.max(0, step - 1))}
            >
              ← Back
            </Button>
            <span className="text-faint hidden text-xs sm:block">
              Every step is optional — skip what did not come up.
            </span>
            <Button
              variant="primary"
              disabled={step === STEPS.length - 1}
              onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
            >
              Next →
            </Button>
          </div>
        </div>

        <div className="lg:sticky lg:top-16 lg:self-start">
          <LiveReadout sizing={sizing} estimate={estimate} estimating={estimating} />
          {estimateProblem !== null && (
            <p className="text-bad mt-2 text-xs leading-snug">Estimate failed: {estimateProblem}</p>
          )}
        </div>
      </div>
    </main>
  );
}

function SaveIndicator({ state, problem }: { state: SaveState; problem: string | null }) {
  if (state === 'error') {
    return <span className="text-bad text-xs">Not saved — {problem}</span>;
  }
  return (
    <span className="text-faint text-xs">
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Saves automatically'}
    </span>
  );
}
