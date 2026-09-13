// Who operates what.
//
// `deliveryModel` says whether we operate any of the stack; `serviceLevel` says
// how far that reaches. Together they draw one boundary, and almost everything
// a client actually wants to know about a managed engagement is a question
// about which side of it a category sits on: who carries the effort, who pays
// for the effort, and what the client is really being quoted.
//
// Before this existed the boundary was implied in three places that disagreed.
// `ops_fit` divided every category by one global capacity, so a managed
// engagement measured `backup` against the 0.6 analyst FTE we allocate even
// though no service level has ever covered backup. `cost.ts` never read the
// delivery model at all, so a client whose stack we run was quoted their own
// salaries for work we do. And the MSSP figure was priced at a hardcoded
// service level, so it never moved when the engagement did.
//
// The category lists are not invented here. They are `coveredCategories` on the
// rate card's service levels, which is where an analyst already maintains them.

import type {
  ClientProfile,
  MsspRateCard,
  MsspServiceLevel,
  ProductCategory,
} from '@stackfit/schema';

/** Which side of the engagement boundary a cost or an effort falls on. */
export type Operator = 'provider' | 'client';

export interface ResponsibilitySplit {
  /** Categories we operate. Empty on a `client_operated` engagement. */
  readonly providerCategories: ReadonlySet<ProductCategory>;
  /** The service level the split was drawn at, or null when we operate nothing. */
  readonly serviceLevel: MsspServiceLevel | null;
  /** Who operates a given category. */
  readonly operatorOf: (category: ProductCategory) => Operator;
  /** True when we operate no category at all, whatever the delivery model says. */
  readonly providerOperatesNothing: boolean;
  readonly rationale: readonly string[];
}

/**
 * Draw the boundary for one engagement.
 *
 * A service level naming a category the catalog cannot supply is not an error:
 * the rate card describes what a provider will run, not what this client bought.
 * The intersection with an actual bundle is taken by the caller, which is the
 * only place that knows what was selected.
 */
export function responsibilitySplit(
  profile: ClientProfile,
  rateCard: MsspRateCard,
): ResponsibilitySplit {
  const rationale: string[] = [];

  if (profile.deliveryModel === 'client_operated' || profile.serviceLevel === null) {
    rationale.push(
      'The client operates every category. Nothing here is ours to run, so every ' +
        'hour of operational effort and every licence is theirs, and the managed ' +
        'figure is a genuine alternative to this bundle rather than a price for it.',
    );
    return {
      providerCategories: new Set(),
      serviceLevel: null,
      operatorOf: () => 'client',
      providerOperatesNothing: true,
      rationale,
    };
  }

  const level = rateCard.serviceLevels.find((entry) => entry.level === profile.serviceLevel);

  if (level === undefined) {
    /*
     * A service level the rate card does not define. Failing closed (nothing is
     * ours) rather than open matters: the open reading would move the client's
     * whole operational burden onto us on the strength of a typo, and every
     * figure downstream would quietly agree with it.
     */
    rationale.push(
      `⚠ Service level "${profile.serviceLevel}" is not on the rate card, so no ` +
        'category could be assigned to us. Treating the whole stack as client-operated, ' +
        'which understates what we deliver rather than overstating it. Fix the rate card.',
    );
    return {
      providerCategories: new Set(),
      serviceLevel: profile.serviceLevel,
      operatorOf: () => 'client',
      providerOperatesNothing: true,
      rationale,
    };
  }

  const providerCategories = new Set<ProductCategory>(level.coveredCategories);

  rationale.push(
    `We operate ${level.coveredCategories.length} ${
      level.coveredCategories.length === 1 ? 'category' : 'categories'
    } at the "${profile.serviceLevel}" service level: ` +
      `${[...level.coveredCategories].join(', ')}. Everything else the client runs.`,
  );

  return {
    providerCategories,
    serviceLevel: profile.serviceLevel,
    operatorOf: (category) => (providerCategories.has(category) ? 'provider' : 'client'),
    providerOperatesNothing: providerCategories.size === 0,
    rationale,
  };
}
