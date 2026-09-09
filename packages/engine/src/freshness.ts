// How stale is this price?
//
// The engine may not call Date.now() (CONTRIBUTING.md), so `today` is passed in. That
// is not a workaround — it is what makes "what did this scenario look like when
// we quoted it in March" answerable, and it is why the determinism test can
// assert a byte-identical result.

import type {
  FreshnessPolicy,
  FreshnessStatus,
  IsoDate,
  PricingRule,
  ProductTier,
} from '@stackfit/schema';

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

/** The latest date among a rule's sources — the freshest evidence it has. */
function newestSourceDate(rule: PricingRule): IsoDate | undefined {
  let newest: IsoDate | undefined;
  for (const source of rule.sources) {
    if (newest === undefined || source.asOf > newest) newest = source.asOf;
  }
  return newest;
}

export function assessPriceFreshness(
  rule: PricingRule,
  today: IsoDate,
  policy: FreshnessPolicy,
): PriceFreshness {
  const maxAgeDays = policy.maxAgeDaysByConfidence[rule.pricingConfidence];
  const refreshMethod = rule.refresh?.method ?? 'undeclared';
  const newest = newestSourceDate(rule);

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

  const explanation =
    status === 'stale'
      ? `Priced ${ageDays} days ago against a ${maxAgeDays}-day allowance for ${rule.pricingConfidence} pricing. Re-check before this reaches a client.`
      : status === 'ageing'
        ? `Priced ${ageDays} days ago; the ${maxAgeDays}-day allowance for ${rule.pricingConfidence} pricing expires on ${recheckBy}.`
        : `Priced ${ageDays} days ago, well inside the ${maxAgeDays}-day allowance for ${rule.pricingConfidence} pricing.`;

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

/** The worst verdict across a tier's pricing rules — a tier is only as fresh as its stalest price. */
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
