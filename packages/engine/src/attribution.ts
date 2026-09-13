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

import { moneyInWords, subtractMoney, sumMoney, zeroMoney } from './money';
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
   * What this engagement costs *us*, at our own rates rather than the client's.
   *
   * `providerOpsAnnual` above is the same effort priced at the client's
   * regional rate, which is the right number for a build-versus-buy comparison
   * and the wrong one for our own books: it prices our delivery team
   * differently for every client. These two are what an engagement actually
   * costs us to stand up and to run.
   */
  readonly providerDeliveryOneTime: Money;
  readonly providerRunAnnual: Money;
  /**
   * Fee minus what it costs us to run, per year, once delivery is behind us.
   *
   * Negative is a real and useful answer: it says this engagement loses money
   * at this service level, which is a thing to know before quoting rather than
   * after. Year one is separately below, because delivery lands in it.
   */
  readonly providerMarginAnnual: Money;
  /** Year one margin: the annual figure less what standing it up costs us. */
  readonly providerMarginYearOne: Money;
  /**
   * The old figure, kept: what the stack costs to own and run, with no regard
   * for who bears it.
   *
   * Still the right answer for `client_operated`, and still the honest
   * denominator of a build-versus-buy comparison, which is a question about
   * total cost rather than about invoices.
   */
  readonly fullBuildAnnual: Money;
  /**
   * Client-safe. Every line here can be read aloud on the call or turned
   * toward the person across the table.
   */
  readonly rationale: readonly string[];
  /**
   * Our own numbers, kept in a separate field rather than a separate sentence.
   *
   * What it costs us and what we make on it must never render on a surface a
   * client can see, and "remember not to print these two lines" is not a
   * guarantee, it is an intention. A caller has to ask for these by name.
   */
  readonly providerRationale: readonly string[];
}

/** What one selection needs to be attributed. Structural, so tests stay small. */
export interface AttributableSelection {
  readonly category: ProductCategory;
  readonly productId: string;
  readonly procurementAnnual: Money;
  readonly opsFteAnnual: Money;
  readonly licenceAnnual: Money;
  /** Standing it up, at our day rate. Ours only if we are the ones deploying. */
  readonly providerDeliveryOneTime: Money;
  /** Running it for a year, at our loaded analyst cost. */
  readonly providerOpsFteAnnual: Money;
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

  /*
   * Our side of the boundary, at our rates. Only the categories we operate:
   * deploying a tool the client runs themselves is not our cost, however much
   * we may have advised on it.
   */
  const oursOnly = selections.filter((entry) => split.operatorOf(entry.category) === 'provider');
  const providerDeliveryOneTime = sumMoney(
    currency,
    oursOnly.map((entry) => entry.providerDeliveryOneTime),
  );
  const providerRunAnnual = sumMoney(
    currency,
    oursOnly.map((entry) => entry.providerOpsFteAnnual),
  );
  const providerMarginAnnual = subtractMoney(providerFeeAnnual, providerRunAnnual);
  const providerMarginYearOne = subtractMoney(providerMarginAnnual, providerDeliveryOneTime);

  const rationale: string[] = [];
  const providerRationale: string[] = [];
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

    /*
     * Our own books. Nothing here is client-facing, and it is the question the
     * engagement is actually being judged on internally: what it costs us to
     * stand up, what it costs us to run, and whether the fee covers both.
     */
    providerRationale.push(
      `Costs us ${moneyInWords(providerDeliveryOneTime)} to stand up and ` +
        `${moneyInWords(providerRunAnnual)} a year to run, at our own rates. Against a ` +
        `${moneyInWords(providerFeeAnnual)} fee that is ${moneyInWords(providerMarginAnnual)} a ` +
        `year, and ${moneyInWords(providerMarginYearOne)} in year one once delivery is paid for.`,
    );

    /*
     * The margin above is overstated, structurally, and saying so is not
     * optional. `opsBurden` is the effort to *administer* a tool: deploy, tune,
     * maintain, upgrade. It is not the rota that watches what the tool
     * produces, and on a managed engagement that rota is the product. Published
     * benchmarks put 24/7 in-house SIEM operation at several analysts across
     * shifts; the figures here are a fraction of that, by design and by
     * definition.
     *
     * `msspAnalystFtePerClient` in scoring-weights.yaml is the allocation we
     * already assume, and it is not costed here because it reaches the scoring
     * stage rather than this one. Until it does, this is gross margin on tool
     * administration, not on the service.
     */
    providerRationale.push(
      '⚠ That margin counts only what it costs us to administer the tools. It excludes the ' +
        'monitoring rota, which is the thing a managed engagement actually sells and the larger ' +
        'figure by an order of magnitude. Treat it as an upper bound, not as a margin.',
    );

    if (Number(providerMarginAnnual.amountMinor) <= 0) {
      providerRationale.push(
        '⚠ This engagement does not cover its own running cost at this service level. Widen ' +
          'what we operate, reprice it, or decline it: the fee is below what the people on it ' +
          'cost us before any delivery effort is counted.',
      );
    } else if (Number(providerMarginYearOne.amountMinor) <= 0) {
      providerRationale.push(
        'Year one does not pay for itself: delivery costs more than the first year of margin. ' +
          'That is normal on a multi-year engagement and is worth saying out loud before the ' +
          'term is negotiated down to one.',
      );
    }

    /*
     * A fee above the total cost of building the same thing is a signal, not a
     * quote. It happens most readily outside the currency the rate card was
     * written in: the card is USD, synthesised from published US and global MDR
     * ranges, and it carries no regional dimension at all, while
     * `labour-rates.yaml` does. Converted into INR and applied to an Indian
     * client it produces a fee several times the cost of building the stack,
     * which is a statement about the card rather than about the engagement.
     *
     * Said out loud rather than corrected, because the correction is a
     * commercial fact about our own cost base and hard rule 2 does not allow it
     * to be invented here.
     */
    if (Number(providerFeeAnnual.amountMinor) > Number(fullBuildAnnual.amountMinor)) {
      rationale.push(
        `⚠ Our fee is more than the whole stack would cost the client to own and run. Either ` +
          'this engagement is genuinely not worth buying as a managed service, or the rate ' +
          'card does not apply here: it is in USD, is synthesised from published US and ' +
          'global ranges, and has no regional dimension, while the labour rates it is being ' +
          'compared against do. Check it before this figure reaches a client.',
      );
    }
  }

  return {
    currency,
    bySelection,
    clientProcurementAnnual,
    clientOpsAnnual,
    providerFeeAnnual,
    clientTotalAnnual,
    providerOpsAnnual,
    providerDeliveryOneTime,
    providerRunAnnual,
    providerMarginAnnual,
    providerMarginYearOne,
    fullBuildAnnual,
    rationale,
    providerRationale,
  };
}
