// Why this product and not the others (PROJECT_SPEC §8.2).
//
// The results dashboard showed one runner-up as three bare numbers and left the
// analyst to explain the decision out loud. With five candidates in every
// category that hid three of them, and a recommendation nobody can defend in
// the room is not a recommendation.
//
// Every SKU that was considered appears here, ranked, each with the one thing
// that actually decided it. Nothing is asserted that the pipeline did not
// compute: a loser on fit is told which dimension lost it and by how much, a
// loser on price is compared on total cost, and a product that never reached
// scoring carries the hard filter's own words.
//
// Each verdict states its own specific fact and nothing else. The reasoning
// they share — that costs are compared all-in rather than on licence, and that
// only one product per category is funded — belongs once, where the reader
// meets the table, not appended to all sixty-six rows. It was appended to all
// sixty-six rows, and that alone was most of a fourteen-page proposal.
//
// Pure: no fs, no clock, no randomness.

import type { Money, ProductCategory, ScoringDimension } from '@stackfit/schema';

import { moneyInWords } from './money';

import type { Bundle, BundleSelection, Candidate } from './portfolio';
import { CATEGORY_LABELS } from './proposal';
import type { ProductScore } from './scoring';

/** Why one alternative lost, in the terms the pipeline actually decided it. */
export type VerdictKind =
  /** Never reached scoring: a §7.3 hard filter removed it. */
  | 'eliminated'
  /** Scored lower overall; `decidingDimension` names where it lost most. */
  | 'lower_fit'
  /** Scored as well or better, but costs more for it. */
  | 'costs_more'
  /** Scored and priced comparably; only one product per category is funded. */
  | 'not_preferred'
  /**
   * Another SKU of a product already listed above.
   *
   * It loses to the selection for whatever reason that product loses, which
   * the first tier has already said. What this row adds is what the *tier*
   * costs, which is the only thing that separates it from its sibling.
   */
  | 'sibling_tier';

export interface AlternativeVerdict {
  readonly productId: string;
  readonly productName: string;
  readonly vendor: string;
  readonly tierId: string;
  readonly tierName: string;
  readonly kind: VerdictKind;
  readonly fitScore: number;
  /** Null when the product was eliminated, because nothing eliminated is costed. */
  readonly annualSpend: Money | null;
  /**
   * Procurement plus the people to run it. Null for the same reason.
   *
   * Carried beside `annualSpend` because a comparison on procurement alone is
   * how an open-source tool looks 80 times cheaper than a commercial one it is
   * actually level with — the operational FTE is most of its cost and the whole
   * point of hard rule 8.
   */
  readonly annualRecurring: Money | null;
  readonly opsFte: number;
  /** The scoring dimension the winner led by most. Null unless `lower_fit`. */
  readonly decidingDimension: ScoringDimension | null;
  /** One sentence an analyst can read aloud without adding to it. */
  readonly verdict: string;
}

export interface CategoryJustification {
  readonly category: ProductCategory;
  readonly categoryLabel: string;
  readonly selectedProductId: string;
  readonly selectedTierId: string;
  readonly selectedProductName: string;
  readonly selectedFitScore: number;
  /** How many SKUs were weighed, the winner included. */
  readonly consideredCount: number;
  readonly headline: string;
  /** Every other SKU in the category, best first. */
  readonly alternatives: readonly AlternativeVerdict[];
}

/** The numbers this module needs, from one pipeline run. */
export interface JustificationInputs {
  readonly scores: readonly ProductScore[];
  readonly candidates: readonly Candidate[];
  readonly productNames: ReadonlyMap<string, { readonly name: string; readonly vendor: string }>;
}

function dimensionName(dimension: ScoringDimension): string {
  return dimension.replace(/_/g, ' ');
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / factor;
}

/**
 * The dimension the winner beat this alternative by most.
 *
 * Compared on `contribution` rather than raw score, because a 20-point lead on
 * a dimension weighted 5 decides less than a 6-point lead on one weighted 25 —
 * and the contribution is what actually moved the total.
 */
function decidingDimension(
  winner: ProductScore,
  loser: ProductScore,
): { dimension: ScoringDimension; gap: number } | null {
  let best: { dimension: ScoringDimension; gap: number } | null = null;

  for (const dimension of winner.dimensions) {
    const rival = loser.dimensions.find((entry) => entry.dimension === dimension.dimension);
    if (rival === undefined) continue;
    const gap = dimension.contribution - rival.contribution;
    if (gap > 0 && (best === null || gap > best.gap)) {
      best = { dimension: dimension.dimension, gap };
    }
  }

  return best;
}

function verdictFor(
  winner: ProductScore,
  winnerAllIn: Money,
  winnerSpend: Money,
  loser: ProductScore,
  loserSpend: Money | null,
  loserAllIn: Money | null,
  loserName: string,
): { kind: VerdictKind; decidingDimension: ScoringDimension | null; verdict: string } {
  if (loser.eliminated) {
    return {
      kind: 'eliminated',
      decidingDimension: null,
      verdict:
        loser.eliminationReasons.length > 0
          ? `Ruled out before scoring: ${loser.eliminationReasons.join(' ')}`
          : 'Ruled out before scoring.',
    };
  }

  const fitGap = round(winner.score - loser.score, 1);

  if (fitGap > 0) {
    const deciding = decidingDimension(winner, loser);
    const where =
      deciding === null
        ? ''
        : ` — widest gap on ${dimensionName(deciding.dimension)}, ${round(deciding.gap, 1)} points`;
    return {
      kind: 'lower_fit',
      decidingDimension: deciding === null ? null : deciding.dimension,
      verdict: `Scores ${round(loser.score, 1)} against ${round(winner.score, 1)}${where}.`,
    };
  }

  // It scored at least as well, so the decision was cost. Stated on the basis
  // the bundle actually decided on — total annual cost, people included.
  //
  // Procurement alone would be a lie by omission: a self-hosted tool at $1,080
  // against a commercial one at $42,840 is "40 times the price" on licence and
  // within a tenth of it once the FTE to run each is counted.
  const ratio =
    loserAllIn === null || winnerAllIn.amountMinor === 0
      ? null
      : loserAllIn.amountMinor / winnerAllIn.amountMinor;

  // Below this the two cost the same for practical purposes, and "costs 1.0
  // times as much" is a sentence that makes a reader distrust the whole page.
  if (ratio !== null && ratio >= 1.05) {
    return {
      kind: 'costs_more',
      decidingDimension: null,
      verdict:
        `Scores ${round(loser.score, 1)}, level with or above the selection, but costs ` +
        `${round(ratio, 1)} times as much a year all-in.`,
    };
  }

  // Same score or better, and the same money to own. Then the licence price is
  // what separated them, and saying "did not win on value density" would be
  // false — a product that is cheaper to own *and* scores higher has the better
  // density by construction. What actually happened is that the bundle was
  // built to stretch the procurement budget, and this SKU costs more to buy.
  const spendRatio =
    loserSpend === null || winnerSpend.amountMinor === 0
      ? null
      : loserSpend.amountMinor / winnerSpend.amountMinor;

  if (loserSpend !== null && loserSpend.amountMinor > winnerSpend.amountMinor) {
    // "1 times as much" is not a sentence. Below the threshold, or against a
    // free licence where no multiple exists, state the gap in plain terms.
    const howMuchDearer =
      spendRatio !== null && spendRatio >= 1.05
        ? `${round(spendRatio, 1)} times as much to buy`
        : 'more to buy';
    return {
      kind: 'costs_more',
      decidingDimension: null,
      verdict:
        `Scores ${round(loser.score, 1)}, the same cost to own but ${howMuchDearer}. ` +
        'The upgrade to quote if the budget moves.',
    };
  }

  return {
    kind: 'not_preferred',
    decidingDimension: null,
    verdict: `Scores ${round(loser.score, 1)} at much the same cost; ${loserName} lost the ranking.`,
  };
}

/**
 * A tier of a product that is already in the list, described against that
 * sibling rather than against the selection.
 *
 * Tiers of one product score identically far more often than not — they differ
 * in what they licence, not in how well they fit an estate — so running each
 * one through the normal comparison produced rows of literally identical text.
 * The email-security table carried seven of them, all reading "Scores 97.7
 * against 100 — widest gap on scale fit, 2.3 points." Seven rows, one fact,
 * in a document a client reads.
 *
 * The tier difference is the thing worth stating: what the upgrade costs, and
 * whether it buys anything measurable for this estate. Where it buys nothing,
 * saying so is more useful than the fit comparison it replaces — that is the
 * row an analyst quotes when a client asks why not the dearer edition.
 */
function siblingTierVerdict(
  sibling: AlternativeVerdict,
  fitScore: number,
  spend: Money | null,
): string {
  const fitGap = round(fitScore - sibling.fitScore, 1);
  const priced =
    spend === null || sibling.annualSpend === null
      ? null
      : spend.amountMinor - sibling.annualSpend.amountMinor;

  const money =
    priced === null || priced === 0
      ? 'the same price'
      : `${moneyInWords({
          amountMinor: Math.abs(priced),
          currency: (spend as Money).currency,
        })} a year ${priced > 0 ? 'more' : 'less'}`;

  if (fitGap === 0) {
    return (
      `Same product as ${sibling.tierName}, at ${money}. Nothing it adds is measurable on this ` +
      'estate, so the cheaper SKU is the honest line to quote.'
    );
  }

  return fitGap > 0
    ? `Same product as ${sibling.tierName}: ${fitGap} point(s) better fit for ${money}.`
    : `Same product as ${sibling.tierName}: ${-fitGap} point(s) worse fit, at ${money}.`;
}

/**
 * One justification per funded category.
 *
 * Every scored SKU in the category appears except the winning one, eliminated
 * products included — "we looked at it, and here is why it could not be used" is
 * an answer, and silence is not.
 */
export function justifyBundle(
  bundle: Bundle,
  inputs: JustificationInputs,
): readonly CategoryJustification[] {
  return bundle.selections.map((selection) => justifyOne(selection, inputs));
}

function justifyOne(
  selection: BundleSelection,
  inputs: JustificationInputs,
): CategoryJustification {
  const inCategory = inputs.scores.filter((score) => score.category === selection.category);

  const winner =
    inCategory.find(
      (score) => score.productId === selection.productId && score.tierId === selection.tierId,
    ) ??
    // An eliminated product yields one score at its first tier, so a selected
    // SKU should always be found. Falling back on the product keeps a missing
    // tier from throwing on a client-facing page.
    inCategory.find((score) => score.productId === selection.productId);

  const costOf = (productId: string, tierId: string) =>
    inputs.candidates.find((entry) => entry.productId === productId && entry.tierId === tierId)
      ?.cost;

  const winnerAllIn = selection.cost.annualRecurring;
  const winnerSpend = selection.cost.procurementAnnual;

  const alternatives = inCategory
    .filter(
      (score) => !(score.productId === selection.productId && score.tierId === selection.tierId),
    )
    .map((score): AlternativeVerdict => {
      const named = inputs.productNames.get(score.productId);
      const name = named === undefined ? score.productId : named.name;
      const cost = score.eliminated ? undefined : costOf(score.productId, score.tierId);
      const spend = cost === undefined ? null : cost.procurementAnnual;
      const allIn = cost === undefined ? null : cost.annualRecurring;
      const decided =
        winner === undefined
          ? { kind: 'not_preferred' as const, decidingDimension: null, verdict: 'Not selected.' }
          : verdictFor(winner, winnerAllIn, winnerSpend, score, spend, allIn, name);

      return {
        productId: score.productId,
        productName: name,
        vendor: named === undefined ? '' : named.vendor,
        tierId: score.tierId,
        tierName: score.tierName,
        kind: decided.kind,
        fitScore: round(score.score, 1),
        annualSpend: spend,
        annualRecurring: allIn,
        opsFte: round(score.opsFte, 2),
        decidingDimension: decided.decidingDimension,
        verdict: decided.verdict,
      };
    })
    // Eliminated last: they are context, not contenders. Otherwise best first,
    // and the product id breaks a tie so the order never wobbles between runs.
    .sort(
      (a, b) =>
        Number(a.kind === 'eliminated') - Number(b.kind === 'eliminated') ||
        b.fitScore - a.fitScore ||
        // Tiers of one product stay together, so the sibling a row is compared
        // against is always the one directly above it.
        a.productId.localeCompare(b.productId) ||
        (a.annualSpend?.amountMinor ?? 0) - (b.annualSpend?.amountMinor ?? 0),
    );

  // Done after sorting, because "the tier already listed" only means anything
  // once the order is fixed.
  const firstOfProduct = new Map<string, AlternativeVerdict>();
  const described = alternatives.map((entry): AlternativeVerdict => {
    if (entry.kind === 'eliminated') return entry;

    const sibling = firstOfProduct.get(entry.productId);
    if (sibling === undefined) {
      firstOfProduct.set(entry.productId, entry);
      return entry;
    }

    return {
      ...entry,
      kind: 'sibling_tier',
      // The deciding dimension belonged to the comparison against the
      // selection, which this row no longer makes.
      decidingDimension: null,
      verdict: siblingTierVerdict(sibling, entry.fitScore, entry.annualSpend),
    };
  });

  const contenders = described.filter((entry) => entry.kind !== 'eliminated').length;
  const ruledOut = described.length - contenders;
  const named = inputs.productNames.get(selection.productId);
  const selectedName = named === undefined ? selection.productId : named.name;

  const headline =
    described.length === 0
      ? `${selectedName} was the only option in this category for this client.`
      : `${selectedName} (${selection.tierName}) was chosen from ${alternatives.length + 1} SKUs ` +
        `considered: ${contenders} scored against it` +
        (ruledOut === 0 ? '' : `, and ${ruledOut} ruled out before scoring`) +
        '.';

  return {
    category: selection.category,
    categoryLabel: CATEGORY_LABELS[selection.category],
    selectedProductId: selection.productId,
    selectedTierId: selection.tierId,
    selectedProductName: selectedName,
    selectedFitScore: round(winner === undefined ? selection.fitScore : winner.score, 1),
    consideredCount: described.length + 1,
    headline,
    alternatives: described,
  };
}
