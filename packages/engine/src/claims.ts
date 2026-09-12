// What a product claims to cover, resolved against the tier that was bought.
//
// Its own module because both scoring and coverage need it and coverage already
// depends on scoring: a claim is neither a cost nor a score, it is a fact about
// the catalog entry.
//
// Pure: no fs, no clock, no randomness.

import type { Product } from '@stackfit/schema';

/**
 * Controls this product claims when bought at `tierId`.
 *
 * Capabilities are sold by tier and control claims were not, so the cheapest
 * tier of a product used to inherit every claim the top tier made. Tier claims
 * are additive to the product-level list, which therefore means "what every
 * tier does": passing no tier returns that conservative floor, which is the
 * right answer for a caller that has not chosen a tier.
 */
export function controlsClaimedBy(
  product: Product,
  tierId: string | undefined,
): ReadonlySet<string> {
  const tier =
    tierId === undefined ? undefined : product.tiers.find((entry) => entry.id === tierId);
  return new Set([...product.controlsCovered, ...(tier?.controlsCovered ?? [])]);
}

/**
 * Tiers of this product that claim a control its current tier does not. The
 * upgrade an analyst should be offered before being told to buy a second tool.
 *
 * Declaration order, so a catalog that lists tiers cheapest-first yields the
 * cheapest upgrade first.
 */
export function tiersClaiming(
  product: Product,
  controlId: string,
  excludingTierId: string | undefined,
): readonly string[] {
  return product.tiers
    .filter((tier) => tier.id !== excludingTierId)
    .filter((tier) => controlsClaimedBy(product, tier.id).has(controlId))
    .map((tier) => tier.id);
}
