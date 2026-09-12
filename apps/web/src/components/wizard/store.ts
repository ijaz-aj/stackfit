'use client';

import type { AssetClass, AssetCriticality, AssetInventory, ClientProfile } from '@stackfit/schema';
import { createContext, useContext, useState, type ReactNode, createElement } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Wizard state (PROJECT_SPEC §3: Zustand for wizard state).
 *
 * Holds the draft and nothing else. No derived numbers. Everything computed
 * that the wizard shows comes from the engine, so a figure on screen and a
 * figure in the proposal cannot disagree (CONTRIBUTING.md hard rule 4).
 *
 * The store is created per scenario and handed down through context rather than
 * living at module scope: a module-level store is shared by every render on the
 * server, which is exactly the bug where two people editing two clients see one
 * another's answers.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface WizardSeed {
  readonly id: string;
  readonly profile: ClientProfile;
  readonly inventory: AssetInventory;
}

export interface WizardState extends WizardSeed {
  id: string;
  profile: ClientProfile;
  inventory: AssetInventory;
  step: number;
  /** Bumped on every edit, so effects can watch one number instead of deep-comparing. */
  revision: number;
  saveState: SaveState;
  savedAt: string | null;
  saveProblem: string | null;

  setStep: (step: number) => void;
  patchProfile: (patch: Partial<ClientProfile>) => void;
  replaceProfile: (profile: ClientProfile) => void;
  setAssetCount: (assetClass: AssetClass, count: number | null) => void;
  patchAssetLine: (
    assetClass: AssetClass,
    patch: { criticality?: AssetCriticality | undefined; internetFacing?: boolean | undefined },
  ) => void;
  patchInventory: (patch: Partial<AssetInventory>) => void;
  markSaving: () => void;
  markSaved: (savedAt: string) => void;
  markSaveFailed: (problem: string) => void;
}

export type WizardStore = StoreApi<WizardState>;

export function createWizardStore(seed: WizardSeed): WizardStore {
  return createStore<WizardState>()((set) => ({
    id: seed.id,
    profile: seed.profile,
    inventory: seed.inventory,
    step: 0,
    revision: 0,
    saveState: 'idle',
    savedAt: null,
    saveProblem: null,

    setStep: (step) => set({ step }),

    patchProfile: (patch) =>
      set((state) => ({ profile: { ...state.profile, ...patch }, revision: state.revision + 1 })),

    replaceProfile: (profile) => set((state) => ({ profile, revision: state.revision + 1 })),

    /**
     * `null` removes the line, which is not the same as a zero.
     *
     * An absent asset class means "not asked"; a captured zero means "asked,
     * and there are none". Sizing relies on the difference, the privileged
     * account count is estimated when absent and trusted when present, and the
     * wizard would quietly destroy it if clearing a box wrote a 0.
     */
    setAssetCount: (assetClass, count) =>
      set((state) => {
        const next: AssetInventory = { ...state.inventory };
        if (count === null) {
          delete next[assetClass];
        } else {
          next[assetClass] = { ...next[assetClass], count };
        }
        return { inventory: next, revision: state.revision + 1 };
      }),

    patchAssetLine: (assetClass, patch) =>
      set((state) => {
        const existing = state.inventory[assetClass];
        if (existing === undefined) return state;

        const line = { ...existing, ...patch };
        // The inventory schema is strict, and `{ internetFacing: undefined }`
        // is not the same as the key being absent. It fails to parse.
        if (line.criticality === undefined) delete line.criticality;
        if (line.internetFacing === undefined) delete line.internetFacing;

        return {
          inventory: { ...state.inventory, [assetClass]: line },
          revision: state.revision + 1,
        };
      }),

    patchInventory: (patch) =>
      set((state) => {
        const next: AssetInventory = { ...state.inventory, ...patch };
        for (const key of ['firewallThroughputClass', 'verbosityOverride'] as const) {
          if (next[key] === undefined) delete next[key];
        }
        return { inventory: next, revision: state.revision + 1 };
      }),

    markSaving: () => set({ saveState: 'saving' }),
    markSaved: (savedAt) => set({ saveState: 'saved', savedAt, saveProblem: null }),
    markSaveFailed: (problem) => set({ saveState: 'error', saveProblem: problem }),
  }));
}

const WizardContext = createContext<WizardStore | null>(null);

export function WizardStoreProvider({ seed, children }: { seed: WizardSeed; children: ReactNode }) {
  const [store] = useState(() => createWizardStore(seed));
  return createElement(WizardContext.Provider, { value: store }, children);
}

function useWizardStore(): WizardStore {
  const store = useContext(WizardContext);
  if (store === null)
    throw new Error('wizard components must be rendered inside WizardStoreProvider');
  return store;
}

export function useWizard<T>(selector: (state: WizardState) => T): T {
  return useStore(useWizardStore(), selector);
}

/** For effects that need the latest state without subscribing to it. */
export function useWizardApi(): WizardStore {
  return useWizardStore();
}
