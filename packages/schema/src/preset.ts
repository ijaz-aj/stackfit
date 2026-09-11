// Intake presets (PROJECT_SPEC §5.2).
//
// "The intake UI must offer industry presets that pre-fill a plausible
// inventory (e.g. 'retail chain, 40 stores'), which the analyst then edits.
// Scoping calls do not produce clean data."
//
// A preset is an assertion about what a typical estate of a given shape looks
// like, which makes it a tunable assumption like any other — so it lives in
// data/ with a stated `basis` rather than hard-coded in a React component
// (CONTRIBUTING.md hard rules 4 and 6).

import { z } from 'zod';

import { AssetInventory } from './asset-inventory.js';
import { ClientProfile } from './client-profile.js';
import { Slug } from './product.js';

export const ScenarioPreset = z
  .object({
    id: Slug,
    /** What the analyst sees on the button. */
    name: z.string().min(1),
    /** One line under it: who this is for, in their language. */
    description: z.string().min(1),
    /**
     * Everything a preset knows about the organisation. `orgName` is
     * deliberately absent — the analyst types the client's actual name, and a
     * preset filling it in would be the one field guaranteed to be wrong.
     */
    profile: ClientProfile.omit({ orgName: true }),
    inventory: AssetInventory,
    /**
     * Where the counts came from. Mandatory for the same reason every sizing
     * coefficient carries one: a number nobody can argue with is a number
     * nobody can correct.
     */
    basis: z.string().min(1),
  })
  .strict();
export type ScenarioPreset = z.infer<typeof ScenarioPreset>;

/** The shape of `data/presets/*.yaml`. */
export const PresetFile = z
  .object({
    notes: z.string().min(1).optional(),
    presets: z.array(ScenarioPreset).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.presets.forEach((preset, index) => {
      if (seen.has(preset.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['presets', index, 'id'],
          message: `duplicate preset id "${preset.id}"`,
        });
      }
      seen.add(preset.id);
    });
  });
export type PresetFile = z.infer<typeof PresetFile>;
