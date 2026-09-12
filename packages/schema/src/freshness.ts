// Price freshness.
//
// Every price in this repo starts rotting the day it is written. A catalog with
// no notion of age is a catalog that quietly lies: the number still renders, the
// export still opens in Word, and nothing anywhere says the rate moved eight
// months ago.
//
// So each price carries `sources[].asOf`, a policy says how long a price of a
// given confidence stays believable, and every costed figure carries a
// freshness verdict that travels with it to the UI and the export.

import { z } from 'zod';

import { IsoDate } from './dates';
import { PricingConfidence } from './enums';

/**
 * How to re-check a price.
 *
 * `azure_retail_prices` is machine-refreshable: Microsoft publishes an
 * unauthenticated retail price feed keyed by a stable meter id, so
 * `pnpm prices:refresh` can re-read it and report drift without a human.
 * Everything else is `manual`. A URL for a person to open. Being explicit
 * about which is which is the point: it makes the manual backlog visible
 * instead of letting it hide behind the automated majority.
 */
export const PriceRefresh = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('azure_retail_prices'),
      /** Stable meter GUID from the Azure retail price feed. */
      meterId: z.string().uuid(),
      armRegionName: z.string().min(1),
      /** Asserted on refresh, so a meter changing shape is caught, not absorbed. */
      expectedUnitOfMeasure: z.string().min(1),
    })
    .strict(),
  z
    .object({
      method: z.literal('manual'),
      /** The page a human should open to re-check this price. */
      checkUrl: z.string().url(),
      note: z.string().optional(),
    })
    .strict(),
]);
export type PriceRefresh = z.infer<typeof PriceRefresh>;

const maxAgeShape = Object.fromEntries(
  PricingConfidence.options.map((confidence) => [confidence, z.number().int().positive()]),
) as { [K in z.infer<typeof PricingConfidence>]: z.ZodNumber };

export const FreshnessPolicy = z
  .object({
    asOf: IsoDate,
    /**
     * How many days a price of each confidence level stays believable. A
     * vendor quote outlives a scraped list price; a placeholder should be
     * chased almost immediately.
     */
    maxAgeDaysByConfidence: z.object(maxAgeShape).strict(),
    /**
     * Fraction of the max age at which a price starts reading as "ageing"
     * rather than "fresh", so the backlog surfaces before anything expires.
     */
    warnAtFraction: z.number().gt(0).lt(1),
    notes: z.string().optional(),
  })
  .strict();
export type FreshnessPolicy = z.infer<typeof FreshnessPolicy>;

export const FreshnessStatus = z.enum(['fresh', 'ageing', 'stale', 'unknown']);
export type FreshnessStatus = z.infer<typeof FreshnessStatus>;
