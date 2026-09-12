// The names these enums have in a sentence.
//
// The engine's `rationale` strings are prose, and four renderers — the results
// page, the HTML preview, the DOCX and the PDF — print them verbatim to a
// reader who has never seen this codebase. An enum value interpolated into one
// of those sentences arrives as `vulnerability_management` or `"mdr" service
// level`, which reads as a leaked database field, because it is one.
//
// A separate module rather than a corner of `proposal.ts`: `portfolio.ts` needs
// these names too, and it is imported *by* proposal. Something both sides can
// depend on cannot live in either.

import type { PricingConfidence, ProductCategory } from '@stackfit/schema';

export const CATEGORY_LABELS: Readonly<Record<ProductCategory, string>> = {
  siem: 'SIEM',
  edr: 'EDR',
  ndr: 'Network detection',
  pam: 'Privileged access',
  iam: 'Identity',
  vulnerability_management: 'Vulnerability management',
  email_security: 'Email security',
  soar: 'Automation',
  backup: 'Backup and recovery',
  ngfw: 'Firewall',
  asset_discovery: 'Asset discovery',
  deception: 'Deception',
  mdr: 'Managed detection',
};

/**
 * Service levels are enum values in the rate card and prose in a proposal.
 * "mdr" in the middle of a client-facing sentence reads as a typo.
 */
export const SERVICE_LEVEL_LABELS: Readonly<Record<string, string>> = {
  monitoring: 'Monitoring',
  mdr: 'Managed detection and response',
  managed_security: 'Fully managed security',
};

/**
 * How a price is known, in words.
 *
 * `replace(/_/g, ' ')` was the idiom at a dozen call sites and produced
 * "public list" and "analyst estimate" — readable, but not what either thing is
 * called. These are the terms a procurement reader already knows.
 */
export const PRICING_CONFIDENCE_LABELS: Readonly<Record<PricingConfidence, string>> = {
  vendor_quote: 'Vendor quote',
  public_list: 'Public list price',
  analyst_estimate: 'Analyst estimate',
  placeholder: 'Placeholder',
};

/** Effort figures carry their own grades, and one of them is not a price term. */
export const EFFORT_CONFIDENCE_LABELS: Readonly<Record<string, string>> = {
  vendor_documented: 'Vendor documented',
  field_measured: 'Field measured',
  analyst_estimate: 'Analyst estimate',
  placeholder: 'Placeholder',
};

/**
 * "A, B and C".
 *
 * A comma-joined list of eight categories is a string; this is a sentence. The
 * serial comma is deliberately absent — house style follows the disclaimers,
 * which are written without it.
 */
export function listOf(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

/**
 * A count and its noun, agreeing.
 *
 * `${n} endpoint(s)` is the shape a developer writes when the plural is
 * somebody else's problem, and it is instantly recognisable as one. Everything
 * here pluralises with an -s, so nothing takes an irregular form yet; when
 * something does, it gets a second argument rather than another `(s)`.
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/**
 * "a" or "an", by how the next word sounds.
 *
 * `for a ${grade}` produced "for a analyst estimate" on every results page.
 * Vowel-letter matching is the approximation everyone uses and it is wrong for
 * "an hour" and "a one-off"; neither occurs in the grades this is used on, and
 * a pronunciation dictionary for four strings would be worse than the bug.
 */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * A product and one of its tiers, named once.
 *
 * `${product.name} ${tier.name}` is the obvious join and it produced "Microsoft
 * Entra ID Entra ID Free" and "Cisco Duo Duo Free" on the results page,
 * because a vendor who calls the product "Entra ID" also calls the SKU "Entra
 * ID Free" and both names are correct on their own.
 *
 * Fixing the catalog instead would mean renaming tiers away from what the
 * vendor's own price list calls them, which is worse: the tier name is what an
 * analyst searches for. So the overlap is elided here, at the join — the
 * longest run of whole words that ends the product name and begins the tier
 * name. Word boundaries matter: without them "Nessus" and "Nessus Expert"
 * would collapse on the shared "Nessus" and read as "Tenable Expert".
 */
export function skuName(productName: string, tierName: string): string {
  const product = productName.split(' ');
  const tier = tierName.split(' ');

  for (let take = Math.min(product.length, tier.length); take > 0; take -= 1) {
    const tail = product.slice(product.length - take);
    const head = tier.slice(0, take);
    if (tail.every((word, index) => word.toLowerCase() === head[index]!.toLowerCase())) {
      const rest = tier.slice(take);
      // The tier adds nothing: "TheHive" + "TheHive" is just the product.
      return rest.length === 0 ? productName : `${productName} ${rest.join(' ')}`;
    }
  }
  return `${productName} ${tierName}`;
}

/**
 * Group separators, for a figure inside a sentence.
 *
 * Not `formatMoney` — this is a count, not money, and the render boundary rule
 * is about currency. `1260 endpoints` and `1,260 endpoints` are the difference
 * between a log line and a document.
 */
export function formatCount(count: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(count);
}
