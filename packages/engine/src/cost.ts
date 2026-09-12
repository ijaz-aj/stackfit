// Stage 2 of the pipeline: what a product actually costs (PROJECT_SPEC §7.2).
//
// This is the most important part of the whole tool. It is what makes "Wazuh is
// free" comparable to "CrowdStrike costs $X", and it does that by refusing to
// report a licence figure without the operational and implementation cost
// beside it (CONTRIBUTING.md hard rule 8).
//
// Pure: no fs, no clock, no randomness. Rates and assumptions are handed in.

import type {
  ClientProfile,
  CostAssumptions,
  CurrencyCode,
  EstimateConfidence,
  FreshnessPolicy,
  FxConfig,
  IsoDate,
  LabourRates,
  Money,
  PricingConfidence,
  PricingRule,
  Product,
  ProductTier,
} from '@stackfit/schema';

import { assessTierFreshness, needsRecheck, type PriceFreshness } from './freshness';
import { addMoney, convertMoney, scaleMoney, subtractMoney, sumMoney, zeroMoney } from './money';
import type { SizingResult } from './sizing';

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;

/** Everything the cost stage needs that does not come from the scenario itself. */
export interface CostInputs {
  readonly labourRates: LabourRates;
  readonly costAssumptions: CostAssumptions;
  readonly fx: FxConfig;
  readonly freshnessPolicy: FreshnessPolicy;
  /**
   * The date to age prices against. Passed in rather than read from a clock so
   * the engine stays pure, and so "what did this look like when we quoted it"
   * is an answerable question.
   */
  readonly today: IsoDate;
}

export interface CostLine {
  readonly label: string;
  readonly amount: Money;
}

export interface ProductCost {
  readonly productId: string;
  readonly tierId: string;
  readonly currency: CurrencyCode;

  /** List licence cost for one year, before discount. */
  readonly licenceListAnnual: Money;
  readonly discountRate: number;
  readonly discountLabel: string;
  /** Licence after the discount band is applied. */
  readonly licenceAnnual: Money;
  readonly supportAnnual: Money;
  readonly infraAnnual: Money;
  readonly opsFteAnnual: Money;
  /** FTE this product consumes, from opsBurden and the monitored asset count. */
  readonly opsFte: number;
  /**
   * How well grounded the staffing figure is.
   *
   * Travels with the number for the same reason `pricingConfidence` and
   * `freshness` do: the FTE line is what decides whether a zero-licence tool is
   * cheap or expensive, and a figure nobody has checked must say so wherever it
   * is read, not only in the file it came from.
   */
  readonly opsBurdenConfidence: EstimateConfidence;
  /** How well grounded the professional-services day count is. */
  readonly implementationConfidence: EstimateConfidence;

  readonly implementationOneTime: Money;
  readonly trainingOneTime: Money;

  readonly year1: Money;
  /** Steady-state annual cost, before the year-on-year uplift compounds. */
  readonly annualRecurring: Money;
  /**
   * Money that actually leaves the business each year: licence, support and
   * infrastructure. Excludes operational FTE.
   *
   * Separate from `annualRecurring` because a stated security budget is a
   * *procurement* figure, and salary is not procurement. Testing a budget cap
   * against a total that includes people charges the analyst's own team to the
   * purchase order — and charges them once per product, for staff who are
   * already on payroll. It also prices open source out of every budget, which
   * inverts hard rule 8: that rule exists to stop open source looking free, not
   * to make it unbuyable. People are constrained separately, against available
   * FTE, which is a different question with a different answer.
   *
   * TCO is unaffected and still includes operational FTE (§7.2).
   */
  readonly procurementAnnual: Money;
  /** Year 1 first, then each subsequent year with uplift applied. */
  readonly cashflowByYear: readonly Money[];
  readonly tco: Money;
  readonly horizonYears: number;

  /** Worst confidence across the tier's pricing rules. */
  readonly pricingConfidence: PricingConfidence;
  readonly hasPlaceholderPricing: boolean;
  /** How old the evidence behind these numbers is. */
  readonly freshness: PriceFreshness;
  /** True when this figure should not reach a client without being re-checked. */
  readonly needsRecheck: boolean;
  readonly lines: readonly CostLine[];
  readonly rationale: readonly string[];
}

const CONFIDENCE_ORDER: readonly PricingConfidence[] = [
  'public_list',
  'vendor_quote',
  'analyst_estimate',
  'placeholder',
];

function worstConfidence(rules: readonly PricingRule[]): PricingConfidence {
  return rules.reduce<PricingConfidence>((worst, rule) => {
    return CONFIDENCE_ORDER.indexOf(rule.pricingConfidence) > CONFIDENCE_ORDER.indexOf(worst)
      ? rule.pricingConfidence
      : worst;
  }, 'public_list');
}

/**
 * FTE this product consumes to run, from its opsBurden and the size of the
 * estate it is watching.
 *
 * Exported because scoring's ops-fit dimension (§7.3) asks the same question
 * costing does, and the two must never drift apart: a product scored as
 * operable and then costed as needing twice the team would be worse than
 * either answer alone.
 */
export function operationalFteFor(product: Product, monitoredAssetCount: number): number {
  return (
    product.opsBurden.baseFte + (product.opsBurden.ftePerThousandAssets * monitoredAssetCount) / 1000
  );
}

/**
 * How many billable units this pricing model sees in this environment.
 *
 * Getting these mappings wrong is the easiest way to be confidently incorrect,
 * so each one names the sizing figure it uses rather than reaching for a
 * plausible-looking number.
 */
export function billableUnitsFor(
  rule: PricingRule,
  sizing: SizingResult,
  profile: ClientProfile,
): { units: number; unitLabel: string } {
  switch (rule.model) {
    case 'per_endpoint_year':
      return { units: sizing.endpointCount, unitLabel: 'endpoints' };
    case 'per_user_year':
      return { units: profile.employeeCount, unitLabel: 'users' };
    case 'per_gb_day_year':
      return { units: sizing.licensedGbPerDay, unitLabel: 'GB/day licensed' };
    case 'per_eps_year':
      return { units: sizing.epsTotal, unitLabel: 'EPS' };
    case 'per_node_year':
      return { units: sizing.serverCount, unitLabel: 'server nodes' };
    case 'per_privileged_user_year':
      return { units: sizing.privilegedAccountCount, unitLabel: 'privileged accounts' };
    case 'per_asset_year':
      return { units: sizing.monitoredAssetCount, unitLabel: 'monitored assets' };
    case 'per_mailbox_year':
      // Seats where captured, otherwise headcount — a mailbox per employee is
      // the assumption an analyst would make on a call anyway.
      return {
        units: sizing.userSeatCount > 0 ? sizing.userSeatCount : profile.employeeCount,
        unitLabel: 'mailboxes',
      };
    case 'flat_tiered':
      return { units: sizing.monitoredAssetCount, unitLabel: 'monitored assets' };
    case 'consumption':
      // Consumption is quoted per unit; for log platforms that unit is a GB, and
      // the annual quantity is the daily ingest over a year.
      return { units: sizing.gbPerDay * DAYS_PER_YEAR, unitLabel: 'GB ingested per year' };
    case 'zero_licence':
      return { units: 0, unitLabel: 'no licensed units' };
  }
}

function tieredPrice(rule: PricingRule, units: number, currency: CurrencyCode): Money {
  const band = rule.tiers?.find(
    (candidate) =>
      units >= candidate.minUnits && (candidate.maxUnits === null || units <= candidate.maxUnits),
  );

  if (band === undefined) return zeroMoney(currency);
  if (band.flatPrice !== undefined) return band.flatPrice;
  if (band.unitPrice !== undefined) return scaleMoney(band.unitPrice, units);
  return zeroMoney(currency);
}

/** Annual list licence cost for one pricing rule, in the rule's own currency. */
function licenceForRule(
  rule: PricingRule,
  sizing: SizingResult,
  profile: ClientProfile,
): { amount: Money; units: number; unitLabel: string } {
  const { units, unitLabel } = billableUnitsFor(rule, sizing, profile);

  if (rule.model === 'zero_licence') {
    return { amount: zeroMoney(profile.budget.currency), units, unitLabel };
  }

  if (rule.model === 'flat_tiered') {
    const currency = rule.tiers?.[0]?.flatPrice?.currency ?? rule.tiers?.[0]?.unitPrice?.currency;
    if (currency === undefined)
      return { amount: zeroMoney(profile.budget.currency), units, unitLabel };
    return { amount: tieredPrice(rule, units, currency), units, unitLabel };
  }

  if (rule.unitPrice === undefined) {
    return { amount: zeroMoney(profile.budget.currency), units, unitLabel };
  }

  // Vendor minimums bite before the unit maths, not after.
  const billedUnits = rule.minimumUnits !== undefined ? Math.max(units, rule.minimumUnits) : units;
  let amount = scaleMoney(rule.unitPrice, billedUnits);

  if (rule.minimumAnnual !== undefined && amount.currency === rule.minimumAnnual.currency) {
    amount = amount.amountMinor < rule.minimumAnnual.amountMinor ? rule.minimumAnnual : amount;
  }

  return { amount, units: billedUnits, unitLabel };
}

function selectDiscount(
  listAnnual: Money,
  assumptions: CostAssumptions,
  fx: FxConfig,
): { rate: number; label: string } {
  for (const band of assumptions.discountBands) {
    if (band.maxAnnualSpend === null) return { rate: band.discountRate, label: band.label };

    const bound = convertMoney(band.maxAnnualSpend, listAnnual.currency, fx);
    if (listAnnual.amountMinor <= bound.amountMinor) {
      return { rate: band.discountRate, label: band.label };
    }
  }
  return { rate: 0, label: 'no discount band matched' };
}

/**
 * Infrastructure to self-host a product, sized from what that *category*
 * actually runs on.
 *
 * Deliberately crude — the point is that the line is non-zero for a self-hosted
 * tool, not that it is accurate to the vCPU. Cloud-delivered products carry no
 * infrastructure cost because the vendor is already charging for theirs.
 *
 * ⚠ It used to be sized from `sizing.gbPerDay` for every self-hostable product
 * in the catalog, whatever it was, and charged every one of them the SIEM's
 * log-retention storage. A honeypot and a SIEM came out at the same number, and
 * a bundle with eleven self-hosted products counted one log-volume figure
 * eleven times. `infra.byCategory` in cost-assumptions.yaml is what each
 * category is sized on now, and every entry carries its reasoning.
 */
function infraAnnualFor(
  product: Product,
  sizing: SizingResult,
  assumptions: CostAssumptions,
): { amount: Money; vcpu: number; explanation: string | undefined } {
  const selfHosted = product.supports.deploymentModes.some(
    (mode) => mode === 'on_prem' || mode === 'air_gapped',
  );

  const infra = assumptions.infra;
  const currency = infra.vcpuMonth.currency;

  if (!selfHosted) {
    return { amount: zeroMoney(currency), vcpu: 0, explanation: undefined };
  }

  // The schema requires an entry per category, so a miss here means the config
  // and the enum have diverged. Falling back to the log-platform sizing is what
  // this change exists to stop, so fall back to the floor instead.
  const footprint = infra.byCategory.find((entry) => entry.category === product.category);
  const minimumVcpu = footprint?.minimumVcpu ?? infra.minimumVcpu;

  const scaled =
    footprint === undefined
      ? 0
      : footprint.vcpuBasis === 'log_ingest'
        ? sizing.gbPerDay / infra.gbPerDayPerVcpu
        : (sizing.monitoredAssetCount / 1000) * footprint.vcpuPerThousandAssets;

  const vcpu = Math.max(minimumVcpu, Math.ceil(scaled));
  const ramGb = vcpu * infra.ramGbPerVcpu;

  // Only the platforms that actually hold the logs pay for holding them.
  const storageTb = footprint?.chargesLogRetentionStorage === true ? sizing.storageTb : 0;

  const monthly = sumMoney(currency, [
    scaleMoney(infra.vcpuMonth, vcpu),
    scaleMoney(infra.ramGbMonth, ramGb),
    scaleMoney(infra.storageTbMonth, storageTb),
  ]);

  const driver =
    footprint?.vcpuBasis === 'log_ingest'
      ? `to carry ${sizing.gbPerDay} GB/day of ingest`
      : footprint !== undefined && footprint.vcpuPerThousandAssets > 0
        ? `for ${sizing.monitoredAssetCount} monitored asset(s)`
        : `as a flat ${product.category} footprint, which does not scale with the estate`;

  const storageNote =
    storageTb > 0
      ? `, plus ${storageTb} TB of log retention at rest`
      : ', and no log-retention storage — that is the SIEM\'s bill, not this one\'s';

  return {
    amount: scaleMoney(monthly, MONTHS_PER_YEAR),
    vcpu,
    explanation: `${vcpu} vCPU and ${ramGb} GB RAM ${driver}${storageNote}.`,
  };
}

/**
 * Costs one tier of one product against a sized environment.
 *
 * Every figure is returned in the client's budget currency, converted once at
 * the point each catalog price is read.
 */
export function computeProductCost(
  product: Product,
  tier: ProductTier,
  sizing: SizingResult,
  profile: ClientProfile,
  inputs: CostInputs,
  /**
   * A further discount on top of the volume band — the §7.4 suite discount.
   *
   * Taken here rather than applied by the caller so that licence, support,
   * cash-flow and TCO all move together. Discounting one figure downstream and
   * leaving the TCO alone produced two numbers in the same object that
   * disagreed about the same product.
   */
  extraDiscount?: { rate: number; label: string },
): ProductCost {
  const currency = profile.budget.currency;
  const { labourRates, costAssumptions, fx, freshnessPolicy, today } = inputs;
  const horizonYears = profile.budget.horizonYears;
  const rationale: string[] = [];

  // ---- Licence, summed across the tier's pricing rules.
  const licenceParts = tier.pricing.map((rule) => {
    const { amount, units, unitLabel } = licenceForRule(rule, sizing, profile);
    const converted = convertMoney(amount, currency, fx);

    if (rule.model === 'zero_licence') {
      rationale.push(`No licence fee: ${product.name} ${tier.name} is ${product.licenceModel}.`);
    } else {
      rationale.push(
        `Licence: ${units} ${unitLabel} on the ${rule.model} model at ${rule.pricingConfidence} confidence.`,
      );
    }
    return converted;
  });

  const licenceListAnnual = sumMoney(currency, licenceParts);

  const { rate: bandRate, label: bandLabel } = selectDiscount(
    licenceListAnnual,
    costAssumptions,
    fx,
  );

  // A second discount (the §7.4 suite discount) stacks multiplicatively rather
  // than by addition, which is how vendors actually apply them: 25% then a
  // further 10% is 32.5% off, not 35%.
  const extraDiscountRate = Math.min(Math.max(extraDiscount?.rate ?? 0, 0), 1);
  const discountRate = 1 - (1 - bandRate) * (1 - extraDiscountRate);
  const discountLabel =
    extraDiscountRate > 0 ? `${bandLabel} + ${extraDiscount?.label ?? 'additional'}` : bandLabel;

  const discountAmount = scaleMoney(licenceListAnnual, discountRate);
  const licenceAnnual = subtractMoney(licenceListAnnual, discountAmount);

  if (discountRate > 0) {
    rationale.push(
      `Applied a ${Math.round(discountRate * 100)}% discount assumption (${discountLabel}). This is an assumption, not a quoted discount.`,
    );
  }

  const supportAnnual = scaleMoney(licenceAnnual, costAssumptions.supportRateOfLicence);

  // ---- Infrastructure.
  const infra = infraAnnualFor(product, sizing, costAssumptions);
  const infraAnnual = convertMoney(infra.amount, currency, fx);
  if (infra.explanation !== undefined && infraAnnual.amountMinor > 0) {
    rationale.push(`Self-hosted infrastructure: ${infra.explanation}`);
  }

  // ---- Operational people. The line that makes open source comparable.
  const regionRate = labourRates.byRegion[profile.region];
  const opsFte = operationalFteFor(product, sizing.monitoredAssetCount);
  const opsFteAnnual = scaleMoney(convertMoney(regionRate.loadedAnnualCost, currency, fx), opsFte);

  rationale.push(
    `Operational effort: ${opsFte.toFixed(2)} FTE = ${product.opsBurden.baseFte} base + ${product.opsBurden.ftePerThousandAssets} per 1,000 assets × ${sizing.monitoredAssetCount} assets, at ${product.opsBurden.confidence.replace(/_/g, ' ')} confidence.`,
  );

  if (product.opsBurden.confidence === 'placeholder') {
    rationale.push(
      '⚠ Nobody has researched what it takes to run this product. The FTE line above is a placeholder, and so is every total that includes it.',
    );
  }

  if (profile.securityStaffFte > 0 && opsFte > profile.securityStaffFte) {
    rationale.push(
      `⚠ This product alone needs ${opsFte.toFixed(2)} FTE against ${profile.securityStaffFte} available. It is not affordable in people, whatever the licence costs.`,
    );
  }

  // ---- One-off costs.
  const dayRate = convertMoney(regionRate.implementationDayRate, currency, fx);
  const implementationOneTime = scaleMoney(dayRate, product.implementation.effortDays);
  const trainingDays = product.implementation.effortDays * costAssumptions.trainingDaysRatio;
  const trainingOneTime = scaleMoney(dayRate, trainingDays);

  rationale.push(
    `Implementation: ${product.implementation.effortDays} day(s) at the ${profile.region} ${product.implementation.skillLevel} day rate, over about ${product.implementation.typicalWeeks} week(s).`,
  );

  // ---- Roll-up.
  //
  // Deviation from the §7.2 formula, flagged deliberately: operational FTE is
  // included in year 1, not only from year 2. The spec's Year1 line omits it,
  // but the tool is running the product in year 1 too, and leaving it out
  // understates exactly the open-source options hard rule 8 exists to keep
  // honest. Recorded in docs/STATUS.md for review.
  const year1 = sumMoney(currency, [
    licenceAnnual,
    supportAnnual,
    infraAnnual,
    opsFteAnnual,
    implementationOneTime,
    trainingOneTime,
  ]);

  // What the business spends. People are excluded on purpose — see the field doc.
  const procurementAnnual = sumMoney(currency, [licenceAnnual, supportAnnual, infraAnnual]);

  const annualRecurring = addMoney(procurementAnnual, opsFteAnnual);

  const cashflowByYear: Money[] = [year1];
  for (let year = 2; year <= horizonYears; year += 1) {
    // Uplift compounds on the licence and support lines only; people and
    // infrastructure are already re-costed each year from current rates.
    const upliftFactor = (1 + costAssumptions.annualUpliftRate) ** (year - 1);
    cashflowByYear.push(
      sumMoney(currency, [
        scaleMoney(licenceAnnual, upliftFactor),
        scaleMoney(supportAnnual, upliftFactor),
        infraAnnual,
        opsFteAnnual,
      ]),
    );
  }

  const tco = sumMoney(currency, cashflowByYear);

  const pricingConfidence = worstConfidence(tier.pricing);
  const hasPlaceholderPricing = pricingConfidence === 'placeholder';
  if (hasPlaceholderPricing) {
    rationale.push(
      '⚠ This tier is priced with a placeholder. The figures above are not a budget, they are a shape.',
    );
  }

  const freshness = assessTierFreshness(tier, today, freshnessPolicy);
  const recheckNeeded = needsRecheck(freshness);
  rationale.push(
    recheckNeeded ? `⚠ ${freshness.explanation}` : `Price age: ${freshness.explanation}`,
  );
  if (recheckNeeded && freshness.refreshMethod === 'undeclared') {
    rationale.push(
      'No refresh method is declared for this price, so nothing will re-check it automatically. Add one.',
    );
  }

  const lines: CostLine[] = [
    { label: 'Licence (after discount assumption)', amount: licenceAnnual },
    { label: 'Support and maintenance', amount: supportAnnual },
    { label: 'Infrastructure', amount: infraAnnual },
    { label: 'Operational FTE', amount: opsFteAnnual },
    { label: 'Implementation (one-off)', amount: implementationOneTime },
    { label: 'Training (one-off)', amount: trainingOneTime },
  ];

  const licenceShare =
    tco.amountMinor === 0
      ? 0
      : Math.round((licenceAnnual.amountMinor * horizonYears * 100) / tco.amountMinor);
  rationale.push(
    `Licence is ${licenceShare}% of the ${horizonYears}-year TCO; the remainder is people, infrastructure and services.`,
  );

  return {
    productId: product.id,
    tierId: tier.id,
    currency,
    licenceListAnnual,
    discountRate,
    discountLabel,
    licenceAnnual,
    supportAnnual,
    infraAnnual,
    opsFteAnnual,
    opsFte,
    opsBurdenConfidence: product.opsBurden.confidence,
    implementationConfidence: product.implementation.confidence,
    implementationOneTime,
    trainingOneTime,
    year1,
    annualRecurring,
    procurementAnnual,
    cashflowByYear,
    tco,
    horizonYears,
    pricingConfidence,
    hasPlaceholderPricing,
    freshness,
    needsRecheck: recheckNeeded,
    lines,
    rationale,
  };
}

/** Costs every tier of a product, cheapest 3-year TCO first. */
export function computeProductCosts(
  product: Product,
  sizing: SizingResult,
  profile: ClientProfile,
  inputs: CostInputs,
): readonly ProductCost[] {
  return product.tiers
    .map((tier) => computeProductCost(product, tier, sizing, profile, inputs))
    .sort((a, b) => a.tco.amountMinor - b.tco.amountMinor || a.tierId.localeCompare(b.tierId));
}

/**
 * Every costed tier of every product, keyed by product id, cheapest three-year
 * TCO first.
 *
 * Keyed by product rather than by product-and-tier so that "what else does this
 * product cost at its other tiers" stays a single lookup — which is the
 * question behind a tier upgrade, and the one a composite string key makes
 * awkward.
 */
export type CostsByProduct = ReadonlyMap<string, readonly ProductCost[]>;

/** The costing for one tier, or undefined when that tier was not costed. */
export function costOfTier(
  costs: CostsByProduct,
  productId: string,
  tierId: string,
): ProductCost | undefined {
  return costs.get(productId)?.find((cost) => cost.tierId === tierId);
}

/**
 * The cheapest tier's costing — what a caller wants when no tier has been
 * chosen. Never used to *present* a product whose tier a bundle has fixed: that
 * is the cheapest-tier assumption this model exists to stop making.
 */
export function cheapestTierCost(
  costs: CostsByProduct,
  productId: string,
): ProductCost | undefined {
  return costs.get(productId)?.[0];
}

/** Costs every tier of every product, ready for scoring and portfolio assembly. */
export function costCatalog(
  products: readonly Product[],
  sizing: SizingResult,
  profile: ClientProfile,
  inputs: CostInputs,
): CostsByProduct {
  const costs = new Map<string, readonly ProductCost[]>();
  for (const product of products) {
    costs.set(product.id, computeProductCosts(product, sizing, profile, inputs));
  }
  return costs;
}
