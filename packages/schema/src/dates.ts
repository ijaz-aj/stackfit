import { z } from 'zod';

/**
 * `YYYY-MM-DD`. Kept as a string so catalog data stays diffable and
 * timezone-free — a Date would drift depending on where the analyst is sitting.
 *
 * Lives in its own module because both pricing and freshness need it, and
 * having either import from the other would make a cycle.
 */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date of the form YYYY-MM-DD');
export type IsoDate = z.infer<typeof IsoDate>;
