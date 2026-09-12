// How stale is this price?
//
// The engine may not call Date.now() (CONTRIBUTING.md), so `today` is passed in. That
// is not a workaround. It is what makes "what did this scenario look like when
// we quoted it in March" answerable, and it is why the determinism test can
// assert a byte-identical result.

import type {
  PricingConfidence,
  FreshnessPolicy,
  FreshnessStatus,
  IsoDate,
  ProductTier,
} from '@stackfit/schema';

import { PRICING_CONFIDENCE_LABELS, article } from './labels';

export interface PriceFreshness {
  readonly status: FreshnessStatus;
  /** Most recent `asOf` across the rule's sources; undefined when unsourced. */
  readonly newestSourceDate: IsoDate | undefined;
  readonly ageDays: number | undefined;
  /** Policy allowance for this price's confidence level. */
  readonly maxAgeDays: number;
  /** The date this price stops being believable. */
  readonly recheckBy: IsoDate | undefined;
  /** True when nothing declares how to re-check this price. */
  readonly refreshMethod: 'azure_retail_prices' | 'manual' | 'undeclared';
  readonly explanation: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Days since the Unix epoch for a `YYYY-MM-DD` string.
 *
 * `Date.UTC` is arithmetic, not a clock read, so this stays pure. Parsing at
 * UTC midnight also means the answer does not change depending on which
 * timezone the analyst happens to be in.
 */
function toEpochDays(date: IsoDate): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / MS_PER_DAY);
}

function fromEpochDays(days: number): IsoDate {
  const date = new Date(days * MS_PER_DAY);
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

/** The latest date among a set of sources. The freshest evidence they carry. */
function newestSourceDate(sources: readonly { asOf: IsoDate }[]): IsoDate | undefined {
  let newest: IsoDate | undefined;
  for (const source of sources) {
    if (newest === undefined || source.asOf > newest) newest = source.asOf;
  }
  return newest;
}

/**
 * Anything that carries a price, a confidence and dated evidence.
 *
 * A catalog `PricingRule` is the usual one, but the MSSP rate card and the FX
 * table are prices too, and they go stale in exactly the same way. Before this
 * existed, only catalog prices were checked and the config-level ones rotted
 * silently, which is the failure hard rule 9 exists to prevent.
 */
export interface DatedPrice {
  readonly pricingConfidence: PricingConfidence;
  readonly sources: readonly { asOf: IsoDate }[];
  readonly refresh?: { readonly method: 'azure_retail_prices' | 'manual' } | undefined;
}

export function assessPriceFreshness(
  rule: DatedPrice,
  today: IsoDate,
  policy: FreshnessPolicy,
): PriceFreshness {
  const maxAgeDays = policy.maxAgeDaysByConfidence[rule.pricingConfidence];
  const refreshMethod = rule.refresh?.method ?? 'undeclared';
  const newest = newestSourceDate(rule.sources);

  if (newest === undefined) {
    return {
      status: 'unknown',
      newestSourceDate: undefined,
      ageDays: undefined,
      maxAgeDays,
      recheckBy: undefined,
      refreshMethod,
      explanation:
        'This price carries no dated source, so its age cannot be established. Treat it as unverified.',
    };
  }

  const ageDays = toEpochDays(today) - toEpochDays(newest);
  const recheckBy = fromEpochDays(toEpochDays(newest) + maxAgeDays);
  const warnAtDays = Math.floor(maxAgeDays * policy.warnAtFraction);

  let status: FreshnessStatus;
  if (ageDays > maxAgeDays) status = 'stale';
  else if (ageDays >= warnAtDays) status = 'ageing';
  else status = 'fresh';

  // "Priced 0 days ago" is what a subtraction says, not what a person says, and
  // on a freshly refreshed catalog it was the opening words of eleven
  // consecutive lines. The grade goes in lower case mid-sentence because it is
  // being used as a noun phrase, not as a heading.
  const priced =
    ageDays === 0
      ? 'Priced today'
      : ageDays === 1
        ? 'Priced yesterday'
        : `Priced ${ageDays} days ago`;
  const grade = PRICING_CONFIDENCE_LABELS[rule.pricingConfidence].toLowerCase();

  const a = article(grade);

  const explanation =
    status === 'stale'
      ? `${priced}, against a ${maxAgeDays}-day allowance for ${a} ${grade}. Re-check before this reaches a client.`
      : status === 'ageing'
        ? `${priced}; the ${maxAgeDays}-day allowance for ${a} ${grade} expires on ${recheckBy}.`
        : `${priced}, well inside the ${maxAgeDays}-day allowance for ${a} ${grade}.`;

  return {
    status,
    newestSourceDate: newest,
    ageDays,
    maxAgeDays,
    recheckBy,
    refreshMethod,
    explanation,
  };
}

const STATUS_SEVERITY: Readonly<Record<FreshnessStatus, number>> = {
  fresh: 0,
  ageing: 1,
  stale: 2,
  unknown: 3,
};

/** The worst verdict across a tier's pricing rules. A tier is only as fresh as its stalest price. */
export function assessTierFreshness(
  tier: ProductTier,
  today: IsoDate,
  policy: FreshnessPolicy,
): PriceFreshness {
  const assessments = tier.pricing.map((rule) => assessPriceFreshness(rule, today, policy));

  return assessments.reduce((worst, candidate) =>
    STATUS_SEVERITY[candidate.status] > STATUS_SEVERITY[worst.status] ? candidate : worst,
  ) as PriceFreshness;
}

/** True when a figure derived from this price should not go in front of a client unqualified. */
export function needsRecheck(freshness: PriceFreshness): boolean {
  return freshness.status === 'stale' || freshness.status === 'unknown';
}
