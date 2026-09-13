// Who pays for what.
//
// `responsibility.ts` draws the boundary; this puts each cost component on the
// right side of it and produces the figure a client is actually asked to sign.
//
// The defect this exists for, measured on the committed presets before it did:
// the hospital under `mssp_managed` was quoted a three-year TCO of USD 3.9M, of
// which USD 1,205,181 a year was *its own* security salaries and USD 0 was
// licence. We operate that engagement. The client will not hire those people,
// our fee appeared nowhere in the figure, and the number on the proposal was an
// answer to "what would it cost you to build this yourself" printed under the
// heading of what they were buying from us.
//
// Three rules, and the whole module is a careful application of them:
//
//   1. Operational effort follows the operator. Ours is our cost base, not
//      their quote.
//   2. Licence follows `licenceOwnership`, and only inside our boundary. A
//      category the client runs is one they have already bought.
//   3. Our fee is charged once. Where the base platform fee already carries a
//      platform (`resold`), the client is not billed for it a second time.

import type { CurrencyCode, Money, MsspRateCard, ProductCategory } from '@stackfit/schema';

import { moneyInWords, sumMoney, zeroMoney } from './money';
import type { Operator, ResponsibilitySplit } from './responsibility';

/** One selection's cost, split across the two parties. */
export interface SelectionAttribution {
  readonly category: ProductCategory;
  readonly productId: string;
  readonly operator: Operator;
  /** Licence, support and infrastructure the client still pays for. */
  readonly clientProcurement: Money;
  /** Operational effort the client carries, costed at their labour rate. */
  readonly clientOps: Money;
  /**
   * Operational effort we carry.
   *
   * Costed at the labour rate of the client region, because that is the only
   * rate this engine holds, so it is our cost expressed in their money rather
   * than our real cost base. Reported so the shape of the engagement is
   * visible, and never added to what the client pays.
   */
  readonly providerOps: Money;
  /** True when the licence sits inside our fee rather than on their invoice. */
  readonly licenceInOurFee: boolean;
}

export interface BundleAttribution {
  readonly currency: CurrencyCode;
  readonly bySelection: readonly SelectionAttribution[];
  /** Licence, support and infrastructure the client buys. */
  readonly clientProcurementAnnual: Money;
  /** Their people, for the categories they operate. */
  readonly clientOpsAnnual: Money;
  /** Our fee for the categories we operate. Zero when we operate nothing. */
  readonly providerFeeAnnual: Money;
  /**
   * What the client actually pays in a year: what they buy, who they staff,
   * and our fee. The headline figure for a managed engagement.
   */
  readonly clientTotalAnnual: Money;
  /** Our people, across the categories we operate. Never billed to the client. */
  readonly providerOpsAnnual: Money;
  /**
   * The old figure, kept: what the stack costs to own and run, with no regard
   * for who bears it.
   *
   * Still the right answer for `client_operated`, and still the honest
   * denominator of a build-versus-buy comparison, which is a question about
   * total cost rather than about invoices.
   */
  readonly fullBuildAnnual: Money;
  readonly rationale: readonly string[];
}

/** What one selection needs to be attributed. Structural, so tests stay small. */
export interface AttributableSelection {
  readonly category: ProductCategory;
  readonly productId: string;
  readonly procurementAnnual: Money;
  readonly opsFteAnnual: Money;
  readonly licenceAnnual: Money;
}

function ownershipOf(category: ProductCategory, rateCard: MsspRateCard) {
  return (
    rateCard.licenceOwnership.byCategory.find((entry) => entry.category === category)?.ownership ??
    rateCard.licenceOwnership.default
  );
}

/**
 * Split a bundle's costs between the client and us.
 *
 * `providerFeeAnnual` arrives already converted rather than being computed
 * here: the rate card is in USD and the fee is the one figure that has to cross
 * currencies, which `msspAlternative` already does. Keeping that conversion in
 * one place leaves this module as pure arithmetic over a single currency.
 */
export function attributeBundle(
  selections: readonly AttributableSelection[],
  split: ResponsibilitySplit,
  rateCard: MsspRateCard,
  currency: CurrencyCode,
  providerFeeAnnual: Money,
): BundleAttribution {
  const zero = zeroMoney(currency);
  const bySelection: SelectionAttribution[] = [];

  for (const selection of selections) {
    const operator = split.operatorOf(selection.category);
    const licenceInOurFee =
      operator === 'provider' && ownershipOf(selection.category, rateCard) === 'resold';

    bySelection.push({
      category: selection.category,
      productId: selection.productId,
      operator,
      /*
       * The whole procurement line moves into our fee, not the licence alone.
       * Support and infrastructure for a platform we resell are ours as well:
       * they are what the base platform fee buys.
       */
      clientProcurement: licenceInOurFee ? zero : selection.procurementAnnual,
      clientOps: operator === 'client' ? selection.opsFteAnnual : zero,
      providerOps: operator === 'provider' ? selection.opsFteAnnual : zero,
      licenceInOurFee,
    });
  }

  const clientProcurementAnnual = sumMoney(
    currency,
    bySelection.map((entry) => entry.clientProcurement),
  );
  const clientOpsAnnual = sumMoney(
    currency,
    bySelection.map((entry) => entry.clientOps),
  );
  const providerOpsAnnual = sumMoney(
    currency,
    bySelection.map((entry) => entry.providerOps),
  );
  const fullBuildAnnual = sumMoney(currency, [
    ...selections.map((entry) => entry.procurementAnnual),
    ...selections.map((entry) => entry.opsFteAnnual),
  ]);
  const clientTotalAnnual = sumMoney(currency, [
    clientProcurementAnnual,
    clientOpsAnnual,
    providerFeeAnnual,
  ]);

  const rationale: string[] = [];
  const plural = (count: number) => (count === 1 ? 'category' : 'categories');

  if (split.providerOperatesNothing) {
    rationale.push(
      'The client operates everything, so what they pay is what the stack costs: ' +
        `${moneyInWords(fullBuildAnnual)} a year, including their own operational effort. ` +
        'There is no fee, because there is no engagement to charge for.',
    );
  } else {
    const ours = bySelection.filter((entry) => entry.operator === 'provider');
    const theirs = bySelection.filter((entry) => entry.operator === 'client');

    rationale.push(
      `The client pays ${moneyInWords(clientTotalAnnual)} a year: ` +
        `${moneyInWords(providerFeeAnnual)} to us for the ${ours.length} ${plural(ours.length)} ` +
        `we operate, ${moneyInWords(clientProcurementAnnual)} of licences they buy, and ` +
        `${moneyInWords(clientOpsAnnual)} of their own people for the ${theirs.length} ` +
        `${plural(theirs.length)} they still run.`,
    );

    if (Number(providerOpsAnnual.amountMinor) > 0) {
      rationale.push(
        `${moneyInWords(providerOpsAnnual)} a year of operational effort is ours and is not in ` +
          'that figure. It is our cost base, stated at the labour rate of the client region ' +
          'because that is the only rate this engine holds, and it is what the fee has to ' +
          'cover before it covers anything else.',
      );
    }

    const resold = bySelection.filter((entry) => entry.licenceInOurFee);
    if (resold.length > 0) {
      rationale.push(
        `${resold.map((entry) => entry.category).join(', ')} ` +
          `${resold.length === 1 ? 'sits' : 'sit'} inside our fee rather than on the ` +
          'purchase order of the client, because the base platform fee already carries it. ' +
          'Quoting it separately would bill the same product twice.',
      );
    }

    rationale.push(
      `Owning and running all of this themselves would be ${moneyInWords(fullBuildAnnual)} a ` +
        'year. That is the build-versus-buy comparison, and not what they are being asked to pay.',
    );
  }

  return {
    currency,
    bySelection,
    clientProcurementAnnual,
    clientOpsAnnual,
    providerFeeAnnual,
    clientTotalAnnual,
    providerOpsAnnual,
    fullBuildAnnual,
    rationale,
  };
}
