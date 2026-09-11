// Compliance frameworks (PROJECT_SPEC §5.4). One YAML file per framework under
// data/frameworks/.
//
// These files are the authority for what a control id means. A product may only
// claim `controlsCovered` entries that exist here, so a mapping cannot be
// invented in a catalog file without also being invented here, in the open.

import { z } from 'zod';

import { FrameworkId, ProductCategory } from './enums';
import { Source } from './pricing';

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
    /**
     * The `ControlGroup` this control belongs to, if the framework declares
     * any. Optional because most frameworks here are a flat list; NIST CSF 2.0
     * is not, and §7.5 asks for the bundle mapped to its six Functions.
     */
    group: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();
export type Control = z.infer<typeof Control>;

/**
 * A published grouping of a framework's controls — the six CSF 2.0 Functions,
 * PCI DSS's six goals, ISO 27001's four themes.
 *
 * Declared in the framework file rather than derived in code, even where the
 * control ids encode it (`DE.CM` is in Detect): the grouping is part of the
 * published standard, and the coverage matrix rolls up against it. A framework
 * with no groups is a flat list, which is the common case.
 */
export const ControlGroup = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/, 'expected a group id like GV or 1'),
    name: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();
export type ControlGroup = z.infer<typeof ControlGroup>;

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
    /** Published groupings of the controls below. Empty means a flat list. */
    groups: z.array(ControlGroup).default([]),
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

    const seenGroups = new Set<string>();
    framework.groups.forEach((group, index) => {
      if (seenGroups.has(group.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['groups', index, 'id'],
          message: `duplicate group id "${group.id}" in framework "${framework.id}"`,
        });
      }
      seenGroups.add(group.id);
    });

    // A half-grouped framework would roll up a partial denominator and read as
    // a coverage figure, so grouping is all or nothing.
    framework.controls.forEach((control, index) => {
      if (control.group === undefined) {
        if (framework.groups.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['controls', index, 'group'],
            message: `framework "${framework.id}" declares groups, so every control must name one`,
          });
        }
        return;
      }
      if (!seenGroups.has(control.group)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['controls', index, 'group'],
          message: `control "${control.id}" is in group "${control.group}", which the framework does not declare`,
        });
      }
    });
  });
export type Framework = z.infer<typeof Framework>;
