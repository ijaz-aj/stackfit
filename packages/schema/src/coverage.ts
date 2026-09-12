// Coverage assumptions (PROJECT_SPEC §7.5).
//
// The coverage stage maps the selected bundle onto the controls of each
// framework in scope and reports what is left uncovered. §7.5 asks for every
// gap to be "tagged with the residual risk"; nothing in the spec says how that
// risk is decided, so it is decided here, in the open, rather than as a
// literal in the engine (CONTRIBUTING.md hard rule 6).

import { z } from 'zod';

/**
 * How much it matters that a control is uncovered.
 *
 * `critical` is reserved for a compliance obligation the client has actually
 * taken on. A control their own selected framework marks mandatory. Everything
 * else is banded from how much risk the product category that would close it
 * reduces *in this estate*, so a gap in a category the client has nothing for
 * does not shout.
 */
export const ResidualRisk = z.enum(['critical', 'high', 'medium', 'low']);
export type ResidualRisk = z.infer<typeof ResidualRisk>;

export const ResidualRiskBand = z
  .object({
    risk: ResidualRisk,
    /** Category weight at or above which a gap lands in this band. */
    minCategoryWeight: z.number().min(0),
    label: z.string().min(1),
  })
  .strict();
export type ResidualRiskBand = z.infer<typeof ResidualRiskBand>;

export const CoverageAssumptions = z
  .object({
    notes: z.string().min(1).optional(),
    /**
     * Risk assigned to an uncovered control that a framework the client
     * actually selected marks mandatory. This is a stated obligation going
     * unmet, which is a different kind of finding from an unmitigated risk.
     */
    mandatoryControlRisk: ResidualRisk,
    /**
     * Bands in descending order of `minCategoryWeight`; the last must be 0 so
     * that every gap lands somewhere.
     */
    residualRiskBands: z.array(ResidualRiskBand).min(1),
    basis: z.string().min(1),
  })
  .strict()
  .superRefine((assumptions, ctx) => {
    const bands = assumptions.residualRiskBands;
    for (let index = 1; index < bands.length; index += 1) {
      const previous = bands[index - 1];
      const current = bands[index];
      if (previous === undefined || current === undefined) continue;
      if (current.minCategoryWeight >= previous.minCategoryWeight) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['residualRiskBands', index, 'minCategoryWeight'],
          message: 'bands must be listed in descending order of minCategoryWeight',
        });
      }
    }
    const last = bands[bands.length - 1];
    if (last !== undefined && last.minCategoryWeight !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['residualRiskBands', bands.length - 1, 'minCategoryWeight'],
        message: 'the last band must start at 0, or a gap could fall through every band',
      });
    }
  });
export type CoverageAssumptions = z.infer<typeof CoverageAssumptions>;
