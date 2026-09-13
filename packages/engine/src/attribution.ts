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

/**
 * The rota, as a cost to us.
 *
 * Separate from the per-selection effort above because it is a different
 * quantity: administration is per product and scales with the estate, the rota
 * is per client and scales with shift coverage. `staffing.ts` keeps them apart
 * for that reason and this module must not be the place they get added up
 * without saying so.
 */
export interface ProviderMonitoring {
  /** FTE of round-the-clock coverage this client consumes. Zero if we monitor nothing. */
  readonly fte: number;
  /** That rota at our own loaded cost, already in the bundle currency. */
  readonly annual: Money;
  /** The arithmetic behind the FTE, as `monitoringFte` worked it out. */
  readonly workingOut: string;
}

/**
 * Everything about our side of the deal that this module cannot derive.
 *
 * One object rather than two more positional arguments: both are Money-shaped
 * and both are ours, and a caller that swapped a fee for a rota cost would get
 * an answer rather than an error.
 */
export interface ProviderSide {
  /** Already converted; see the note on `attributeBundle`. */
  readonly feeAnnual: Money;
  readonly monitoring: ProviderMonitoring;
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
  /** Administration plus the monitoring rota: everything running it costs us. */
  readonly providerRunAnnual: Money;
  /** The administration half of `providerRunAnnual`, at our rates. */
  readonly providerAdministrationAnnual: Money;
  /** The rota half. Zero when we operate nothing, and per client rather than per tool. */
  readonly providerMonitoringAnnual: Money;
  /** The rota in people, so the cost above can be checked against the headcount. */
  readonly providerMonitoringFte: number;
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
   * Margin as a share of the fee, or null when there is no fee to take a share
   * of.
   *
   * Carried because the absolute figure hides the thing worth noticing. USD
   * 677,077 of margin reads as a large engagement; 94.5% of the fee reads as a
   * rate card and a cost base that were not written about the same market, and
   * that is the question this number exists to raise.
   */
  readonly providerMarginRate: number | null;
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

/** Local, because importing a rounding helper for one call site is not worth it. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
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
 * `provider.feeAnnual` and `provider.monitoring.annual` arrive already
 * converted rather than being computed here: the rate card is in USD, our
 * labour rates are in INR, and the callers that own those conversions
 * (`msspAlternative` and `buildBundle`) already hold `fx`. Keeping them there
 * leaves this module as pure arithmetic over a single currency.
 */
export function attributeBundle(
  selections: readonly AttributableSelection[],
  split: ResponsibilitySplit,
  rateCard: MsspRateCard,
  currency: CurrencyCode,
  provider: ProviderSide,
): BundleAttribution {
  const providerFeeAnnual = provider.feeAnnual;
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
  const providerAdministrationAnnual = sumMoney(
    currency,
    oursOnly.map((entry) => entry.providerOpsFteAnnual),
  );

  /*
   * The rota is charged whole or not at all, and it does not follow the
   * category list the way administration does.
   *
   * Administration is per tool: we carry it for the tools inside the boundary
   * and not for the ones outside it. Monitoring is per client. We do not watch
   * a proportion of an estate, and a service level covering five categories
   * rather than two does not put more analysts in front of the same screens.
   *
   * ⚠ The gate is "we operate something", not "we operate a detection
   * category", which holds because every service level on the committed rate
   * card covers `siem` and `mdr`. A level that covers neither would be charged
   * a rota it does not run. Stated rather than guarded, because the guard would
   * have to name categories in code and the whole point of `coveredCategories`
   * is that the analyst maintains that list in the rate card.
   */
  const providerMonitoringAnnual = split.providerOperatesNothing ? zero : provider.monitoring.annual;
  const providerMonitoringFte = split.providerOperatesNothing ? 0 : provider.monitoring.fte;

  const providerRunAnnual = sumMoney(currency, [
    providerAdministrationAnnual,
    providerMonitoringAnnual,
  ]);
  const providerMarginAnnual = subtractMoney(providerFeeAnnual, providerRunAnnual);
  const providerMarginYearOne = subtractMoney(providerMarginAnnual, providerDeliveryOneTime);
  const feeMinor = Number(providerFeeAnnual.amountMinor);
  // Rounded, because an unrounded ratio of two integers is a float and this
  // object is compared for equality in the determinism test.
  const providerMarginRate =
    feeMinor === 0 ? null : Math.round((Number(providerMarginAnnual.amountMinor) / feeMinor) * 10000) / 10000;

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

    providerRationale.push(
      `That run cost is ${moneyInWords(providerAdministrationAnnual)} of tool administration ` +
        `plus ${moneyInWords(providerMonitoringAnnual)} for the ` +
        `${round(providerMonitoringFte, 3)} FTE of round-the-clock coverage this client ` +
        `consumes. ${provider.monitoring.workingOut}`,
    );

    /*
     * What the margin is now, and what it still is not.
     *
     * This used to say the figure excluded the monitoring rota and was
     * therefore an upper bound "by an order of magnitude". The rota is now in
     * it, and measuring the difference showed that claim was wrong: across the
     * six committed presets the rota moves the margin by 0.6 to 1.6 percentage
     * points, not by an order of magnitude. It is small because an MSSP seat is
     * spread across a published 50 to 100 clients, so a reference client
     * consumes about 0.065 FTE of it.
     *
     * The margin stayed above 90% anyway, which means the rota was never the
     * explanation. The explanation is below, and it is about the two rate cards
     * rather than about anything this module computes.
     */
    providerRationale.push(
      `⚠ ${providerMarginRate === null ? 'This margin' : `${Math.round(providerMarginRate * 100)}% margin`} ` +
        'is a ratio between two rate cards that were not written about the same market, and it ' +
        'should be read as that before it is read as profit. The fee above comes from a card ' +
        'synthesised from published US and global MDR ranges. The cost under it is our own ' +
        'people at an Indian payroll. What is missing is our actual charge-out rate, which is a ' +
        'commercial fact this engine cannot derive and must be given.',
    );

    providerRationale.push(
      '⚠ Still excluded: every `opsBurden` coefficient behind the administration figure is an ' +
        'analyst estimate, 65 of 65, and the administration total is a straight sum with no ' +
        'overlap between tools run by the same engineer. Both understate margin rather than ' +
        'flatter it.',
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
      /*
       * Split in two, because one sentence was doing two jobs and only one of
       * them was the client's.
       *
       * The fact is theirs and they are entitled to it: buying this as a
       * service costs more than owning it would, which is a real input to
       * their decision and stating it is what keeps the build-versus-buy
       * comparison honest. The diagnosis is ours. "Check it before this figure
       * reaches a client" was written to the analyst and was rendering on the
       * screen the analyst turns toward the client, which is an instruction to
       * the reader to audit our own rate card.
       */
      rationale.push(
        `Buying this as a managed service costs more than owning and running the whole stack ` +
          `would: ${moneyInWords(providerFeeAnnual)} a year against ` +
          `${moneyInWords(fullBuildAnnual)}. That is worth weighing before choosing the ` +
          'managed option.',
      );
      providerRationale.push(
        '⚠ Our fee exceeds what the whole stack would cost this client to own and run. Either ' +
          'the engagement is genuinely not worth buying as a service at this size, or the rate ' +
          'card does not apply: it is in USD, synthesised from published US and global ranges, ' +
          'and carries no regional dimension, while the labour rates it is being compared ' +
          'against do. Settle which before the fee reaches a client.',
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
    providerAdministrationAnnual,
    providerMonitoringAnnual,
    providerMonitoringFte,
    providerMarginAnnual,
    providerMarginYearOne,
    providerMarginRate,
    fullBuildAnnual,
    rationale,
    providerRationale,
  };
}
