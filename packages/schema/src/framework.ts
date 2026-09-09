// Compliance frameworks (PROJECT_SPEC §5.4). One YAML file per framework under
// data/frameworks/.
//
// These files are the authority for what a control id means. A product may only
// claim `controlsCovered` entries that exist here, so a mapping cannot be
// invented in a catalog file without also being invented here, in the open.

import { z } from 'zod';

import { FrameworkId, ProductCategory } from './enums.js';
import { Source } from './pricing.js';

export const Control = z
  .object({
    /**
     * The local id, unqualified — `DE.CM`, `10`, `A.8`. The framework id is
     * prepended to form the `ControlId` a product references.
     */
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/, 'expected a control id like DE.CM or 10'),
    title: z.string().min(1),
    /**
     * Product categories that materially satisfy this control. This is what
     * promotes a category from optional to mandatory during portfolio
     * selection when the analyst ticks the framework.
     */
    satisfiedBy: z.array(ProductCategory).default([]),
    /**
     * Set when this control alone makes its categories mandatory, e.g. PCI DSS
     * req 10 and log retention. Advisory controls stay false.
     */
    mandatory: z.boolean().default(false),
    notes: z.string().optional(),
  })
  .strict();
export type Control = z.infer<typeof Control>;

/**
 * How well-sourced a framework's control list is — the compliance equivalent of
 * `pricingConfidence`, and it exists for the same reason. Some publishers put
 * their control list behind a paywall, a CAPTCHA or an unparseable PDF, and a
 * coverage claim built on a secondary source should not look identical to one
 * read from the standard itself.
 */
export const FrameworkSourceQuality = z.enum([
  /** Control list read directly from the publisher's own document. */
  'publisher_verified',
  /** Corroborated across independent secondary sources, not read from the publisher. */
  'secondary_sources',
  /**
   * Structure understood, exact control identifiers unverified. Usable for
   * shortlisting; must be reconciled against the standard before any
   * client-facing coverage claim.
   */
  'provisional',
]);
export type FrameworkSourceQuality = z.infer<typeof FrameworkSourceQuality>;

export const Framework = z
  .object({
    id: FrameworkId,
    name: z.string().min(1),
    sourceQuality: FrameworkSourceQuality,
    /** The published edition these controls were read from. */
    version: z.string().min(1),
    /** Regions where this framework is commonly in scope; a hint for intake defaults. */
    commonIn: z.array(z.string().min(1)).default([]),
    controls: z.array(Control).min(1),
    /** Where the control list came from. Hard rule 2 applies to mappings too. */
    sources: z.array(Source).min(1),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((framework, ctx) => {
    const seen = new Set<string>();
    framework.controls.forEach((control, index) => {
      if (seen.has(control.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['controls', index, 'id'],
          message: `duplicate control id "${control.id}" in framework "${framework.id}"`,
        });
      }
      seen.add(control.id);
    });
  });
export type Framework = z.infer<typeof Framework>;
