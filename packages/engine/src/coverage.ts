// Stage 5 of the pipeline: what the selected bundle actually covers, and what
// it does not (PROJECT_SPEC §7.5).
//
// Two signals decide whether a control is covered, and they are deliberately
// not the same signal:
//
//   - `Control.satisfiedBy` is StackFit's own category-level judgement — "a
//     SIEM materially satisfies this". It is conservative by design and says
//     nothing about which SIEM.
//   - `Product.controlsCovered` is one product's own claim, backed by that
//     product's sources.
//
// Agreement is coverage. A bundle holding the right *kind* of tool for a
// control that the chosen product does not itself claim is reported as
// `partial`, never as covered: it is the analyst's cue to check, not a
// coverage claim to put in front of a client.
//
// Controls no purchase can satisfy (`satisfiedBy: []` — policy, training,
// physical custody, cryptography) are `not_addressable` and are kept out of the
// denominator. Leaving them in would peg every stack at around half and make
// the percentage meaningless; 115 of the library's 240 controls map to nothing
// at all, and that is the framework files being honest rather than the bundle
// being bad.
//
// Pure: no fs, no clock, no randomness.

import type {
  ClientProfile,
  Control,
  CoverageAssumptions,
  CurrencyCode,
  Framework,
  Money,
  Product,
  ProductCategory,
  ResidualRisk,
} from '@stackfit/schema';

import { controlsClaimedBy, tiersClaiming } from './claims';
import { cheapestTierCost, costOfTier, type CostsByProduct, type ProductCost } from './cost';
import type { CategoryRelevance } from './infrastructure';
import { PRICING_CONFIDENCE_LABELS } from './labels';
import { subtractMoney, sumMoney } from './money';
import type { Bundle } from './portfolio';
import type { ProductScore } from './scoring';

/**
 * `covered` — a selected product claims this control.
 * `partial` — the bundle has a product in a category that satisfies this
 *   control, but that product does not claim the control itself.
 * `gap` — a purchase could satisfy this control and the bundle has nothing.
 * `not_addressable` — no product category satisfies it; it is not buyable.
 */
export type ControlCoverageStatus = 'covered' | 'partial' | 'gap' | 'not_addressable';

export interface ControlCoverage {
  /** Namespaced, e.g. `pci-dss-4.0:10`. */
  readonly controlId: string;
  readonly localId: string;
  readonly title: string;
  /** The framework's own grouping (a CSF Function), or null for a flat list. */
  readonly group: string | null;
  readonly status: ControlCoverageStatus;
  readonly mandatory: boolean;
  readonly satisfiedBy: readonly ProductCategory[];
  /** Selected product ids that claim this control, in bundle order. */
  readonly coveredBy: readonly string[];
  /** Selected products of a satisfying category that make no claim to it. */
  readonly partialBy: readonly string[];
  readonly rationale: readonly string[];
}

export interface GroupCoverage {
  readonly groupId: string;
  readonly name: string;
  readonly totalControls: number;
  readonly addressableControls: number;
  readonly coveredControls: number;
  readonly partialControls: number;
  readonly gapControls: number;
  /** covered / addressable, 0–100. Null when nothing in the group is buyable. */
  readonly coveragePercent: number | null;
  readonly rationale: readonly string[];
}

export interface FrameworkCoverage {
  readonly frameworkId: string;
  readonly name: string;
  readonly version: string;
  readonly sourceQuality: Framework['sourceQuality'];
  /** The client selected this framework, as opposed to it being a reference lens. */
  readonly inScope: boolean;
  readonly controls: readonly ControlCoverage[];
  /** Empty when the framework declares no groups. */
  readonly groups: readonly GroupCoverage[];
  readonly totalControls: number;
  readonly addressableControls: number;
  readonly coveredControls: number;
  readonly partialControls: number;
  readonly gapControls: number;
  readonly notAddressableControls: number;
  /** covered / addressable, 0–100. Null when nothing in the framework is buyable. */
  readonly coveragePercent: number | null;
  readonly rationale: readonly string[];
}

/** A catalog product that would close a gap, costed for this client. */
export interface GapCloser {
  readonly productId: string;
  readonly productName: string;
  readonly vendor: string;
  readonly category: ProductCategory;
  /** The SKU being quoted. Naming the product without the tier is not a quote. */
  readonly tierId: string;
  readonly tierName: string;
  /**
   * Set when this closer is an upgrade to a product the bundle already owns,
   * naming the tier it is already on. The money below is then the *difference*,
   * not the price of the tier.
   *
   * Worth its own shape because "move Defender from Plan 1 to Plan 2" and "buy
   * a second tool" are different recommendations at different prices, and a
   * gap list that can only say the second one sends analysts to quote a
   * purchase the client does not need.
   */
  readonly upgradeFromTierId: string | null;
  /** The name of that tier, so the sentence reads as a client would say it. */
  readonly upgradeFromTierName: string | null;
  /**
   * The product claims the control outright, so buying it moves the control to
   * `covered`. False means it only moves it to `partial` — the right kind of
   * tool, with no claim on this specific control.
   */
  readonly closesFully: boolean;
  /** Licence, support and infrastructure: money that leaves the business. */
  readonly annualSpend: Money;
  readonly oneTime: Money;
  readonly tco: Money;
  /** People, kept next to the money rather than folded into it (hard rule 8). */
  readonly opsFte: number;
  readonly pricingConfidence: ProductCost['pricingConfidence'];
  readonly needsRecheck: boolean;
}

/**
 * What a coverage percentage is, and — more importantly — what it is not.
 *
 * Verbatim wherever coverage is shown, for the same reason the §6 rule 4
 * pricing disclaimer is: an export is where the reader stops seeing the
 * dashboard's qualifications, and this is the number most likely to be
 * misread. "PCI DSS 100% covered" invites a CFO to conclude the audit is
 * handled.
 *
 * The framing follows the mapping bodies' own language. CIS publishes control
 * mappings with the caveat that they are a professional assessment of
 * control-objective alignment rather than regulatory guidance, and PCI's own
 * position is that an assessor applies the requirements directly — a mapping
 * shows which controls a tool *supports*, and the framework remains
 * authoritative. No product satisfies a control on its own: policy, process,
 * configuration, evidence and the assessor's judgement decide compliance, and
 * none of those are things StackFit can see.
 */
export function coverageDisclaimer(): string {
  return (
    'Coverage shows which controls the selected products claim to SUPPORT. It is not a ' +
    'compliance assessment and not an audit result. No security product satisfies a control on ' +
    'its own: policy, process, configuration, evidence and an assessor’s judgement decide ' +
    'compliance, and none of those are visible to this tool. Treat these percentages as a ' +
    'procurement gap analysis, never as a statement of compliance.'
  );
}

export interface CoverageGap {
  readonly controlId: string;
  readonly frameworkId: string;
  readonly frameworkName: string;
  readonly inScope: boolean;
  readonly title: string;
  readonly mandatory: boolean;
  /**
   * Why this control is not covered.
   *
   * `gap` is nothing in the stack addressing it at all. `partial` is the right
   * *kind* of tool in the stack with no claim on this specific control — which
   * is uncovered too, and was being left out of this list entirely: the client
   * was shown a coverage percentage and no route to the missing half of it,
   * because the only controls with a costed fix were the ones nothing
   * addressed. A partial is often the cheapest thing to close, since the client
   * already owns something in the category and may only need a bigger SKU.
   */
  readonly kind: 'gap' | 'partial';
  readonly residualRisk: ResidualRisk;
  readonly satisfiedBy: readonly ProductCategory[];
  /** Cheapest product that would close this one gap, taken on its own (§7.5). */
  readonly cheapestCloser: GapCloser | null;
  /**
   * The purchase in `remediation` that closes this gap, which is not always the
   * cheapest single fix: one product closing three gaps beats three cheaper
   * products closing one each. Null when nothing in the catalog closes it.
   */
  readonly remediationProductId: string | null;
  readonly rationale: readonly string[];
}

/** One purchase, and every gap it would close. §8.5's "what it would cost to fix". */
export interface RemediationOption {
  readonly productId: string;
  readonly productName: string;
  readonly vendor: string;
  readonly category: ProductCategory;
  /** The SKU to buy. A shopping list that names no tier is not a quote. */
  readonly tierId: string;
  readonly tierName: string;
  /**
   * Set when this is an upgrade to something the bundle already owns, naming
   * the tier it is on today. The money on this option is then the difference.
   */
  readonly upgradeFromTierId: string | null;
  readonly upgradeFromTierName: string | null;
  readonly annualSpend: Money;
  readonly oneTime: Money;
  readonly tco: Money;
  readonly opsFte: number;
  /** Control ids this purchase closes outright, worst first. */
  readonly closesControls: readonly string[];
  /** Control ids it would move to `partial` only — right tool, no claim. */
  readonly partiallyClosesControls: readonly string[];
  readonly frameworks: readonly string[];
  readonly worstResidualRisk: ResidualRisk;
  readonly rationale: readonly string[];
}

export interface CoverageSummary {
  readonly frameworksInScope: number;
  readonly totalControls: number;
  readonly addressableControls: number;
  readonly coveredControls: number;
  readonly partialControls: number;
  readonly gapControls: number;
  readonly coveragePercent: number | null;
}

export interface CoverageResult {
  readonly currency: CurrencyCode;
  readonly bundleKind: Bundle['kind'];
  readonly frameworks: readonly FrameworkCoverage[];
  /** Every addressable control nothing in the bundle covers, worst first. */
  readonly gaps: readonly CoverageGap[];
  readonly remediation: readonly RemediationOption[];
  /** Annual procurement spend to buy every product in `remediation`. */
  readonly remediationAnnualSpend: Money;
  readonly remediationOneTime: Money;
  /** Additional FTE the remediation would need. People are never money here. */
  readonly remediationOpsFte: number;
  /** Gaps the catalog cannot close at all, named rather than left silent. */
  readonly unclosableGaps: readonly string[];
  /** Summary over the frameworks in scope, or over all of them when none is. */
  readonly summary: CoverageSummary;
  readonly rationale: readonly string[];
}

export interface CoverageInputs {
  readonly profile: ClientProfile;
  readonly bundle: Bundle;
  /** The whole catalog: a gap is closed by something outside the bundle. */
  readonly products: readonly Product[];
  /** Scores for the same catalog, so an eliminated product is never offered. */
  readonly scores: readonly ProductScore[];
  readonly costs: CostsByProduct;
  /**
   * Frameworks to report against. The caller decides which: the analyst's
   * selections, plus NIST CSF 2.0 as the reference lens §7.5 asks for even
   * when it is not one of the client's own obligations.
   */
  readonly frameworks: readonly Framework[];
  readonly relevance: readonly CategoryRelevance[];
  readonly assumptions: CoverageAssumptions;
}

/** Worst first. Index order is severity order, and several sorts rely on it. */
const RISK_ORDER: readonly ResidualRisk[] = ['critical', 'high', 'medium', 'low'];

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / factor;
}

function percent(covered: number, addressable: number): number | null {
  return addressable === 0 ? null : round((covered / addressable) * 100, 1);
}

function qualify(frameworkId: string, control: Control): string {
  return `${frameworkId}:${control.id}`;
}

function worseRisk(a: ResidualRisk, b: ResidualRisk): ResidualRisk {
  return RISK_ORDER.indexOf(a) <= RISK_ORDER.indexOf(b) ? a : b;
}

/**
 * How much it matters that this control is uncovered.
 *
 * A mandatory control in a framework the client actually selected is a stated
 * obligation going unmet, which is a different kind of finding from an
 * unmitigated risk — it is not argued down by the size of the estate.
 * Everything else is banded on the category weight computed for this client,
 * so a gap in a category their estate has nothing for does not shout.
 */
function residualRiskFor(
  control: Control,
  inScope: boolean,
  weightByCategory: ReadonlyMap<ProductCategory, number>,
  assumptions: CoverageAssumptions,
): { readonly risk: ResidualRisk; readonly why: string } {
  if (inScope && control.mandatory) {
    return {
      risk: assumptions.mandatoryControlRisk,
      why:
        'the framework marks this control mandatory and the client has selected it, so this is a ' +
        'stated obligation going unmet rather than a risk to weigh',
    };
  }

  const weight = control.satisfiedBy.reduce(
    (highest, category) => Math.max(highest, weightByCategory.get(category) ?? 0),
    0,
  );
  const band =
    assumptions.residualRiskBands.find((candidate) => weight >= candidate.minCategoryWeight) ??
    assumptions.residualRiskBands[assumptions.residualRiskBands.length - 1];

  // Unreachable: the schema requires a band starting at 0.
  if (band === undefined) return { risk: 'low', why: 'no residual-risk band matched' };

  return {
    risk: band.risk,
    why: `the strongest category that would close it weighs ${round(weight, 1)} for this estate — ${band.label}`,
  };
}

function coverOneControl(
  framework: Framework,
  control: Control,
  claimsByProduct: ReadonlyMap<string, ReadonlySet<string>>,
  categoryByProduct: ReadonlyMap<string, ProductCategory>,
  selectionsByCategory: ReadonlyMap<ProductCategory, readonly string[]>,
  selectedProductIds: readonly string[],
): ControlCoverage {
  const controlId = qualify(framework.id, control);
  const satisfyingCategories = new Set(control.satisfiedBy);

  const coveredBy = selectedProductIds.filter((productId) =>
    claimsByProduct.get(productId)?.has(controlId),
  );
  const partialBy = control.satisfiedBy
    .flatMap((category) => selectionsByCategory.get(category) ?? [])
    .filter((productId) => !coveredBy.includes(productId));

  const rationale: string[] = [];
  let status: ControlCoverageStatus;

  if (control.satisfiedBy.length === 0) {
    // Addressability is a property of the control, never of the bundle: if a
    // product claim could pull a control into the denominator, two bundles for
    // the same client would be scored out of different totals and §8.1's
    // side-by-side comparison would be meaningless.
    status = 'not_addressable';
    rationale.push(
      `${framework.name} ${control.id} is not closed by a purchase — ${framework.id} maps it to no ` +
        'product category — so it is left out of the coverage denominator rather than counted ' +
        'against the stack.',
    );
    if (coveredBy.length > 0) {
      rationale.push(
        `⚠ ${coveredBy.join(', ')} nonetheless claims ${controlId}. One of the two is wrong, and ` +
          `it is settled in data/frameworks/${framework.id}.yaml or in the catalog entry, not here. ` +
          'Until then the control counts neither for nor against the stack.',
      );
    }
  } else if (coveredBy.length > 0) {
    status = 'covered';
    rationale.push(
      `Covered by ${coveredBy.join(', ')}, which claims ${controlId} in its own catalog entry.`,
    );
    const fromOutside = coveredBy.filter((productId) => {
      const category = categoryByProduct.get(productId);
      return category !== undefined && !satisfyingCategories.has(category);
    });
    if (fromOutside.length > 0) {
      rationale.push(
        `${fromOutside.join(', ')} claims this control from outside the categories ${framework.id} ` +
          'maps it to. The product claim is the specific, sourced one and is taken at face value; ' +
          'the category mapping is worth revisiting.',
      );
    }
  } else if (partialBy.length > 0) {
    status = 'partial';
    rationale.push(
      `${partialBy.join(', ')} is the kind of product that satisfies ${framework.name} ` +
        `${control.id}, but does not claim that control in the catalog. Reported as partial, not ` +
        'covered: verify before this reaches a client.',
    );
  } else {
    status = 'gap';
    rationale.push(
      `Nothing in this bundle addresses ${framework.name} ${control.id}. It would be closed by ` +
        `${control.satisfiedBy.join(' or ')}.`,
    );
  }

  return {
    controlId,
    localId: control.id,
    title: control.title,
    group: control.group ?? null,
    status,
    mandatory: control.mandatory,
    satisfiedBy: control.satisfiedBy,
    coveredBy,
    partialBy,
    rationale,
  };
}

function rollUpGroups(
  framework: Framework,
  controls: readonly ControlCoverage[],
): readonly GroupCoverage[] {
  return framework.groups.map((group): GroupCoverage => {
    const inGroup = controls.filter((control) => control.group === group.id);
    const addressable = inGroup.filter((control) => control.status !== 'not_addressable');
    const covered = inGroup.filter((control) => control.status === 'covered');
    const partial = inGroup.filter((control) => control.status === 'partial');
    const gaps = inGroup.filter((control) => control.status === 'gap');

    const rationale =
      addressable.length === 0
        ? [
            `${group.name} is not addressed by purchases: none of its ${inGroup.length} controls ` +
              'maps to a product category, so there is no percentage to report.',
          ]
        : [
            `${covered.length} of ${addressable.length} buyable ${group.name} controls are covered` +
              (partial.length > 0 ? `, ${partial.length} partially` : '') +
              `. ${inGroup.length - addressable.length} more are not closed by any purchase.`,
          ];

    return {
      groupId: group.id,
      name: group.name,
      totalControls: inGroup.length,
      addressableControls: addressable.length,
      coveredControls: covered.length,
      partialControls: partial.length,
      gapControls: gaps.length,
      coveragePercent: percent(covered.length, addressable.length),
      rationale,
    };
  });
}

/** The matrix: every control of every supplied framework, with its status. */
export function computeFrameworkCoverage(inputs: CoverageInputs): readonly FrameworkCoverage[] {
  const { bundle, frameworks, products, profile } = inputs;

  // Keyed on the tier the bundle actually selected: a product costed at its
  // cheapest tier must not be credited with what only its top tier delivers.
  const tierByProduct = new Map(
    bundle.selections.map((selection) => [selection.productId, selection.tierId]),
  );
  const claimsByProduct = new Map<string, ReadonlySet<string>>(
    products.map((product) => [
      product.id,
      controlsClaimedBy(product, tierByProduct.get(product.id)),
    ]),
  );
  const categoryByProduct = new Map(products.map((product) => [product.id, product.category]));
  const selectedProductIds = bundle.selections.map((selection) => selection.productId);
  const selectionsByCategory = new Map<ProductCategory, string[]>();
  for (const selection of bundle.selections) {
    const ids = selectionsByCategory.get(selection.category) ?? [];
    ids.push(selection.productId);
    selectionsByCategory.set(selection.category, ids);
  }

  return frameworks.map((framework): FrameworkCoverage => {
    const inScope = profile.compliance.includes(framework.id);
    const controls = framework.controls.map((control) =>
      coverOneControl(
        framework,
        control,
        claimsByProduct,
        categoryByProduct,
        selectionsByCategory,
        selectedProductIds,
      ),
    );

    const addressable = controls.filter((control) => control.status !== 'not_addressable');
    const covered = controls.filter((control) => control.status === 'covered');
    const partial = controls.filter((control) => control.status === 'partial');
    const gaps = controls.filter((control) => control.status === 'gap');

    const rationale: string[] = [
      `${framework.name} ${framework.version}: ${covered.length} of ${addressable.length} controls ` +
        `a purchase could satisfy are covered by the ${bundle.kind} bundle. ` +
        `${controls.length - addressable.length} of the ${controls.length} controls are closed by ` +
        'policy, process or physical control rather than a product, and are counted neither way.',
    ];
    if (partial.length > 0) {
      rationale.push(
        `${partial.length} control(s) have the right kind of product in the stack without that ` +
          'product claiming the control. They are counted as uncovered, deliberately: a coverage ' +
          'figure should be the one you can defend, not the one you would like.',
      );
    }
    if (covered.length === 0 && partial.length > 0) {
      // The difference between "this stack does nothing for you" and "nobody has
      // mapped the catalog against this framework yet" is the whole story, and a
      // 0% with no explanation says the wrong one.
      rationale.push(
        `⚠ Nothing in this bundle claims a single ${framework.name} control, while ${partial.length} ` +
          'of them are the kind of control its products would address. That is a mapping this ' +
          'catalog has not been given, not a stack that does nothing — the figure to act on is ' +
          `the ${partial.length} partial, and the fix is in the catalog entries.`,
      );
    }
    if (!inScope) {
      rationale.push(
        'The client did not select this framework. It is a reference view of the stack, not a ' +
          'compliance position.',
      );
    }
    if (framework.sourceQuality !== 'publisher_verified') {
      rationale.push(
        `⚠ This framework's control list is graded ` +
          `${framework.sourceQuality.replace(/_/g, ' ')}, and any coverage ` +
          'figure against it inherits that. ' +
          (framework.sourceQuality === 'provisional'
            ? 'Provisional means the exact control identifiers are unverified: usable for ' +
              'shortlisting, not for a client-facing coverage claim.'
            : 'Reconcile against the publisher before a client-facing claim.'),
      );
    }

    return {
      frameworkId: framework.id,
      name: framework.name,
      version: framework.version,
      sourceQuality: framework.sourceQuality,
      inScope,
      controls,
      groups: rollUpGroups(framework, controls),
      totalControls: controls.length,
      addressableControls: addressable.length,
      coveredControls: covered.length,
      partialControls: partial.length,
      gapControls: gaps.length,
      notAddressableControls: controls.length - addressable.length,
      coveragePercent: percent(covered.length, addressable.length),
      rationale,
    };
  });
}

/**
 * Products that could close a gap, best first.
 *
 * Ranked on procurement spend rather than TCO: "what would it cost to fix" is a
 * purchase-order question, and the FTE the fix needs travels alongside instead
 * of being priced into it. That is the same split the §7.4 knapsack makes, and
 * it is here for the same reason — charging a client's own salaried team to a
 * purchase order prices open source out of every budget.
 */
/**
 * What would close this control, as things a client can actually buy.
 *
 * Two shapes, because there are two real answers. A product the bundle does not
 * own is a purchase, quoted at the cheapest tier that actually claims the
 * control rather than at the cheapest tier outright — quoting a SKU that does
 * not close the gap is not quoting the fix. A product the bundle already owns
 * is an *upgrade*, priced as the difference, because telling an analyst to buy
 * a second tool when the licence they hold has the capability one tier up is
 * how a proposal loses a technical review.
 *
 * A product is eligible if its category satisfies the control, or if one of its
 * tiers claims the control outright. The second half keeps this list consistent
 * with the matrix above, which counts a product's own claim whether or not the
 * category mapping agrees.
 */
function closersFor(
  control: ControlCoverage,
  inputs: CoverageInputs,
  eliminated: ReadonlySet<string>,
): readonly GapCloser[] {
  const { products, costs, profile, bundle } = inputs;
  const satisfying = new Set(control.satisfiedBy);
  const ownedTierByProduct = new Map(
    bundle.selections.map((selection) => [selection.productId, selection.tierId]),
  );

  // A control that is already `partial` has the right kind of tool in the stack
  // and is waiting on a *claim*. Another product of the same category that
  // claims nothing here would change its status not at all, so offering one is
  // recommending a purchase that buys the client nothing.
  const claimRequired = control.status === 'partial';

  return products
    .filter((product) => !eliminated.has(product.id))
    .filter((product) => !profile.excludedProducts.includes(product.id))
    .flatMap((product): GapCloser[] => {
      const ownedTierId = ownedTierByProduct.get(product.id);
      const claiming = tiersClaiming(product, control.controlId, ownedTierId);
      if (!satisfying.has(product.category) && claiming.length === 0) return [];

      const cheapestClaiming = claiming
        .map((tierId) => costOfTier(costs, product.id, tierId))
        .filter((cost): cost is ProductCost => cost !== undefined)
        .sort((a, b) => a.procurementAnnual.amountMinor - b.procurementAnnual.amountMinor)[0];

      if (ownedTierId !== undefined) {
        // Already in the bundle. The only thing left to sell is a bigger SKU,
        // and only if a bigger SKU claims what this one does not.
        const from = costOfTier(costs, product.id, ownedTierId);
        if (from === undefined || cheapestClaiming === undefined) return [];
        return [
          {
            productId: product.id,
            productName: product.name,
            vendor: product.vendor,
            category: product.category,
            tierId: cheapestClaiming.tierId,
            tierName: tierNameOf(product, cheapestClaiming.tierId),
            upgradeFromTierId: ownedTierId,
            upgradeFromTierName: tierNameOf(product, ownedTierId),
            closesFully: true,
            annualSpend: subtractMoney(cheapestClaiming.procurementAnnual, from.procurementAnnual),
            // Not the new tier's implementation cost: the product is already
            // deployed, and re-charging the whole rollout to an upgrade would
            // overstate it. What an upgrade actually costs in services is the
            // difference, floored at nothing.
            oneTime: atLeastZero(
              subtractMoney(cheapestClaiming.implementationOneTime, from.implementationOneTime),
            ),
            tco: subtractMoney(cheapestClaiming.tco, from.tco),
            opsFte: round3(cheapestClaiming.opsFte - from.opsFte),
            pricingConfidence: cheapestClaiming.pricingConfidence,
            needsRecheck: cheapestClaiming.needsRecheck,
          },
        ];
      }

      // Not owned. Quote the SKU that closes it if there is one, otherwise the
      // cheapest, which buys the right kind of tool and reads as partial.
      const cost = cheapestClaiming ?? cheapestTierCost(costs, product.id);
      if (cost === undefined) return [];
      return [
        {
          productId: product.id,
          productName: product.name,
          vendor: product.vendor,
          category: product.category,
          tierId: cost.tierId,
          tierName: tierNameOf(product, cost.tierId),
          upgradeFromTierId: null,
          upgradeFromTierName: null,
          closesFully: controlsClaimedBy(product, cost.tierId).has(control.controlId),
          annualSpend: cost.procurementAnnual,
          oneTime: cost.implementationOneTime,
          tco: cost.tco,
          opsFte: cost.opsFte,
          pricingConfidence: cost.pricingConfidence,
          needsRecheck: cost.needsRecheck,
        },
      ];
    })
    .filter((closer) => closer.closesFully || !claimRequired)
    .sort((a, b) => {
      if (a.closesFully !== b.closesFully) return a.closesFully ? -1 : 1;
      // An upgrade to something already owned beats a new product at the same
      // price: one fewer tool to run, one fewer vendor to manage.
      const aUpgrade = a.upgradeFromTierId !== null;
      const bUpgrade = b.upgradeFromTierId !== null;
      if (aUpgrade !== bUpgrade) return aUpgrade ? -1 : 1;
      if (a.annualSpend.amountMinor !== b.annualSpend.amountMinor) {
        return a.annualSpend.amountMinor - b.annualSpend.amountMinor;
      }
      if (a.tco.amountMinor !== b.tco.amountMinor) return a.tco.amountMinor - b.tco.amountMinor;
      return a.productId.localeCompare(b.productId) || a.tierId.localeCompare(b.tierId);
    });
}

function tierNameOf(product: Product, tierId: string): string {
  return product.tiers.find((tier) => tier.id === tierId)?.name ?? tierId;
}

function atLeastZero(amount: Money): Money {
  return amount.amountMinor < 0 ? { amountMinor: 0, currency: amount.currency } : amount;
}

function round3(value: number): number {
  const scaled = value * 1000;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / 1000;
}

/** One purchasable thing: a product at a tier. */
function skuKey(closer: GapCloser): string {
  return `${closer.productId}::${closer.tierId}`;
}

interface RemediationAssignment {
  readonly gap: CoverageGap;
  readonly closesFully: boolean;
}

interface PlannedPurchase {
  readonly closer: GapCloser;
  readonly assignments: readonly RemediationAssignment[];
}

/**
 * The shopping list: the fewest purchases that close the most gaps, cheapest
 * first.
 *
 * Deliberately not "the cheapest fix for each gap, taken one gap at a time".
 * That buys a second tool to do a job something already on the list does, which
 * is what §7.4 step 4 refuses inside a bundle — and it makes the answer depend
 * on the order the gaps happen to be listed in.
 *
 * Products that claim a control outright are exhausted first, so a cheaper
 * product that merely belongs to the right category never displaces one that
 * actually closes the control.
 */
function planRemediation(
  gaps: readonly CoverageGap[],
  candidatesByControl: ReadonlyMap<string, readonly GapCloser[]>,
): readonly PlannedPurchase[] {
  const remaining = new Map(gaps.map((gap) => [gap.controlId, gap]));
  const planned = new Map<string, { closer: GapCloser; assignments: RemediationAssignment[] }>();

  for (const fullyOnly of [true, false]) {
    for (;;) {
      const tally = new Map<string, { closer: GapCloser; assignments: RemediationAssignment[] }>();
      for (const gap of remaining.values()) {
        for (const candidate of candidatesByControl.get(gap.controlId) ?? []) {
          if (fullyOnly && !candidate.closesFully) continue;
          // Keyed on the SKU, not the product: two tiers of one product are two
          // different purchases at two different prices, and merging them would
          // credit the cheaper one with what only the dearer one closes.
          const key = skuKey(candidate);
          const entry = tally.get(key) ?? { closer: candidate, assignments: [] };
          entry.assignments.push({ gap, closesFully: candidate.closesFully });
          tally.set(key, entry);
        }
      }
      if (tally.size === 0) break;

      const [best] = [...tally.values()].sort((a, b) => {
        // A purchase already on the list costs nothing more to use again.
        const aPlanned = planned.has(skuKey(a.closer));
        const bPlanned = planned.has(skuKey(b.closer));
        if (aPlanned !== bPlanned) return aPlanned ? -1 : 1;
        const byCount = b.assignments.length - a.assignments.length;
        if (byCount !== 0) return byCount;
        if (a.closer.annualSpend.amountMinor !== b.closer.annualSpend.amountMinor) {
          return a.closer.annualSpend.amountMinor - b.closer.annualSpend.amountMinor;
        }
        if (a.closer.tco.amountMinor !== b.closer.tco.amountMinor) {
          return a.closer.tco.amountMinor - b.closer.tco.amountMinor;
        }
        return (
          a.closer.productId.localeCompare(b.closer.productId) ||
          a.closer.tierId.localeCompare(b.closer.tierId)
        );
      });
      if (best === undefined) break;

      for (const assignment of best.assignments) remaining.delete(assignment.gap.controlId);
      const existing = planned.get(skuKey(best.closer));
      if (existing === undefined) {
        planned.set(skuKey(best.closer), best);
      } else {
        existing.assignments.push(...best.assignments);
      }
    }
  }

  return [...planned.values()];
}

/** The whole stage: coverage matrix, gap list, and what the fixes cost (§7.5). */
export function computeCoverage(inputs: CoverageInputs): CoverageResult {
  const { assumptions, bundle, frameworks, relevance, scores } = inputs;
  const currency = bundle.currency;

  const weightByCategory = new Map(relevance.map((entry) => [entry.category, entry.weight]));
  const eliminated = new Set(
    scores.filter((score) => score.eliminated).map((score) => score.productId),
  );
  const controlById = new Map(
    frameworks.flatMap((framework) =>
      framework.controls.map((control) => [qualify(framework.id, control), control] as const),
    ),
  );

  const coverage = computeFrameworkCoverage(inputs);

  const graded = coverage
    .flatMap((frameworkCoverage) =>
      frameworkCoverage.controls
        // Partials belong here too: they are uncovered, they are excluded from
        // the coverage percentage, and they are frequently the cheapest thing
        // to close because the client already owns something in the category.
        .filter((control) => control.status === 'gap' || control.status === 'partial')
        .map((control) => ({ frameworkCoverage, control })),
    )
    .map(({ frameworkCoverage, control }) => {
      const source = controlById.get(control.controlId);
      const risk =
        source === undefined
          ? { risk: 'low' as ResidualRisk, why: 'control not found in the supplied frameworks' }
          : residualRiskFor(source, frameworkCoverage.inScope, weightByCategory, assumptions);
      return { frameworkCoverage, control, ...risk };
    });

  // Worst first, and deterministic all the way down: this list is rendered,
  // exported and diffed between scenarios.
  graded.sort((a, b) => {
    const byRisk = RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk);
    if (byRisk !== 0) return byRisk;
    if (a.frameworkCoverage.inScope !== b.frameworkCoverage.inScope) {
      return a.frameworkCoverage.inScope ? -1 : 1;
    }
    return a.control.controlId.localeCompare(b.control.controlId);
  });

  const candidatesByControl = new Map<string, readonly GapCloser[]>(
    graded.map((entry) => [entry.control.controlId, closersFor(entry.control, inputs, eliminated)]),
  );

  const gaps: CoverageGap[] = [];
  const unclosable: string[] = [];

  for (const entry of graded) {
    const candidates = candidatesByControl.get(entry.control.controlId) ?? [];
    const best = candidates[0] ?? null;
    if (best === null) unclosable.push(entry.control.controlId);

    const partial = entry.control.status === 'partial';
    const rationale: string[] = [
      `Residual risk ${entry.risk}: ${entry.why}.`,
      ...entry.control.rationale,
    ];
    if (partial) {
      rationale.push(
        'The stack has the right kind of tool for this control and nothing in it claims this ' +
          'control specifically, so it is reported as partial and counted as uncovered. Often ' +
          'the cheapest thing on this list to close.',
      );
    }
    if (best === null) {
      rationale.push(
        `No product in the catalog can close this for this client: ` +
          `${entry.control.satisfiedBy.join(' / ')} is either absent from the catalog or ruled out ` +
          'for this environment. That is a gap in StackFit, and it is reported rather than hidden.',
      );
    } else {
      rationale.push(
        `Cheapest fix: ${best.productName} at ${best.annualSpend.amountMinor / 100} ${currency}/yr ` +
          `of procurement spend plus ${round(best.opsFte, 2)} FTE to run. ` +
          (best.closesFully
            ? 'It claims this control directly.'
            : 'It is the right category but does not claim this control, so it would move it to ' +
              'partial rather than covered.'),
      );
      if (best.needsRecheck) {
        rationale.push(
          `⚠ ${best.productName}'s price is graded ` +
            `${PRICING_CONFIDENCE_LABELS[best.pricingConfidence].toLowerCase()} and is due a ` +
            're-check; the fix cost above should not reach a client until it has been.',
        );
      }
    }

    gaps.push({
      controlId: entry.control.controlId,
      kind: partial ? 'partial' : 'gap',
      frameworkId: entry.frameworkCoverage.frameworkId,
      frameworkName: entry.frameworkCoverage.name,
      inScope: entry.frameworkCoverage.inScope,
      title: entry.control.title,
      mandatory: entry.control.mandatory,
      residualRisk: entry.risk,
      satisfiedBy: entry.control.satisfiedBy,
      cheapestCloser: best,
      remediationProductId: null,
      rationale,
    });
  }

  const purchases = planRemediation(gaps, candidatesByControl);
  const purchaseByControl = new Map<string, string>(
    purchases.flatMap((purchase) =>
      purchase.assignments.map(
        (assignment) => [assignment.gap.controlId, purchase.closer.productId] as const,
      ),
    ),
  );

  const remediation = purchases
    .map((entry): RemediationOption => {
      const { closer, assignments } = entry;
      const closed = assignments.map((assignment) => assignment.gap);
      const fully = assignments.filter((assignment) => assignment.closesFully).map((a) => a.gap);
      const partly = assignments.filter((assignment) => !assignment.closesFully).map((a) => a.gap);
      const worst = closed.reduce<ResidualRisk>(
        (worstSoFar, gap) => worseRisk(worstSoFar, gap.residualRisk),
        'low',
      );
      const frameworkIds = [...new Set(closed.map((gap) => gap.frameworkId))].sort();

      const upgrade = closer.upgradeFromTierId !== null;

      return {
        productId: closer.productId,
        productName: closer.productName,
        vendor: closer.vendor,
        category: closer.category,
        tierId: closer.tierId,
        tierName: closer.tierName,
        upgradeFromTierId: closer.upgradeFromTierId,
        upgradeFromTierName: closer.upgradeFromTierName,
        annualSpend: closer.annualSpend,
        oneTime: closer.oneTime,
        tco: closer.tco,
        opsFte: closer.opsFte,
        closesControls: fully.map((gap) => gap.controlId),
        partiallyClosesControls: partly.map((gap) => gap.controlId),
        frameworks: frameworkIds,
        worstResidualRisk: worst,
        rationale: [
          upgrade
            ? `Upgrading ${closer.productName} from ${closer.upgradeFromTierName} to ` +
              `${closer.tierName} closes ${fully.length} control(s) outright` +
              (partly.length > 0 ? ` and partly addresses ${partly.length} more` : '') +
              ` across ${frameworkIds.join(', ')}. No new tool to deploy, run or renew: the ` +
              'client already owns this product at a lower tier.'
            : `Adding ${closer.productName} — ${closer.tierName} (${closer.category}) closes ` +
              `${fully.length} control(s) outright` +
              (partly.length > 0 ? ` and partly addresses ${partly.length} more` : '') +
              ` across ${frameworkIds.join(', ')}.`,
          upgrade
            ? `The difference, not the price of the tier: ` +
              `${closer.annualSpend.amountMinor / 100} ${currency}/yr more procurement spend and ` +
              `${closer.tco.amountMinor / 100} ${currency} more over the horizon. ` +
              (closer.opsFte === 0
                ? 'No extra people are shown because operational burden is recorded per product ' +
                  'rather than per tier — a heavier SKU usually is more work to run, and this ' +
                  'catalog cannot yet say how much.'
                : `${round(closer.opsFte, 2)} more FTE to run.`)
            : `${closer.annualSpend.amountMinor / 100} ${currency}/yr of procurement spend, ` +
              `${closer.oneTime.amountMinor / 100} ${currency} to implement, and ` +
              `${closer.tco.amountMinor / 100} ${currency} over the horizon once the ` +
              `${round(closer.opsFte, 2)} FTE to run it is counted.`,
        ],
      };
    })
    .sort((a, b) => {
      const byRisk =
        RISK_ORDER.indexOf(a.worstResidualRisk) - RISK_ORDER.indexOf(b.worstResidualRisk);
      if (byRisk !== 0) return byRisk;
      const byCount = b.closesControls.length - a.closesControls.length;
      if (byCount !== 0) return byCount;
      if (a.annualSpend.amountMinor !== b.annualSpend.amountMinor) {
        return a.annualSpend.amountMinor - b.annualSpend.amountMinor;
      }
      return a.productId.localeCompare(b.productId) || a.tierId.localeCompare(b.tierId);
    });

  // The gap list and the shopping list are two views of one answer, so each gap
  // names the purchase that closes it rather than leaving the reader to guess
  // why its cheapest fix is not the one on the list.
  const reportedGaps = gaps.map((gap): CoverageGap => {
    const productId = purchaseByControl.get(gap.controlId) ?? null;
    const displaced =
      productId !== null &&
      gap.cheapestCloser !== null &&
      gap.cheapestCloser.productId !== productId;
    return {
      ...gap,
      remediationProductId: productId,
      rationale: displaced
        ? [
            ...gap.rationale,
            `The remediation plan closes this with ${productId} instead, which also closes other ` +
              'gaps: one purchase doing three jobs beats three purchases doing one each.',
          ]
        : gap.rationale,
    };
  });

  const inScopeCoverage = coverage.filter((framework) => framework.inScope);
  const summarised = inScopeCoverage.length > 0 ? inScopeCoverage : coverage;
  const coveredControls = summarised.reduce(
    (total, framework) => total + framework.coveredControls,
    0,
  );
  const addressableControls = summarised.reduce(
    (total, framework) => total + framework.addressableControls,
    0,
  );
  const summary: CoverageSummary = {
    frameworksInScope: inScopeCoverage.length,
    totalControls: summarised.reduce((total, framework) => total + framework.totalControls, 0),
    addressableControls,
    coveredControls,
    partialControls: summarised.reduce((total, framework) => total + framework.partialControls, 0),
    gapControls: summarised.reduce((total, framework) => total + framework.gapControls, 0),
    coveragePercent: percent(coveredControls, addressableControls),
  };

  const remediationAnnualSpend = sumMoney(
    currency,
    remediation.map((option) => option.annualSpend),
  );
  const remediationOneTime = sumMoney(
    currency,
    remediation.map((option) => option.oneTime),
  );
  const remediationOpsFte = round(
    remediation.reduce((total, option) => total + option.opsFte, 0),
    2,
  );

  const rationale: string[] = [
    `The ${bundle.kind} bundle covers ${summary.coveredControls} of ${summary.addressableControls} ` +
      'controls a purchase could satisfy' +
      (inScopeCoverage.length > 0
        ? `, across the ${inScopeCoverage.length} framework(s) the client selected.`
        : '. The client selected no framework, so this is measured against the reference ' +
          'frameworks supplied instead.'),
    `${summary.gapControls} gap(s) remain. Closing the ones this catalog can close costs ` +
      `${remediationAnnualSpend.amountMinor / 100} ${currency}/yr plus ` +
      `${remediationOneTime.amountMinor / 100} ${currency} one-time, and needs ` +
      `${remediationOpsFte} more FTE. Money and people are reported separately: a stated security ` +
      'budget is a procurement figure, and salary is not procurement.',
  ];
  if (summary.partialControls > 0) {
    rationale.push(
      `${summary.partialControls} control(s) are partial — the stack has the right kind of product ` +
        'but that product does not claim the control. Not counted as covered.',
    );
  }
  if (unclosable.length > 0) {
    rationale.push(
      `${unclosable.length} gap(s) cannot be closed from this catalog at all: ` +
        `${unclosable.join(', ')}. That is a gap in StackFit, not in the client.`,
    );
  }
  const mandatoryGaps = reportedGaps.filter((gap) => gap.mandatory && gap.inScope);
  if (mandatoryGaps.length > 0) {
    rationale.push(
      `⚠ ${mandatoryGaps.length} gap(s) are controls a selected framework marks mandatory: ` +
        `${mandatoryGaps.map((gap) => gap.controlId).join(', ')}. Those are obligations, not ` +
        'preferences.',
    );
  }

  return {
    currency,
    bundleKind: bundle.kind,
    frameworks: coverage,
    gaps: reportedGaps,
    remediation,
    remediationAnnualSpend,
    remediationOneTime,
    remediationOpsFte,
    unclosableGaps: unclosable,
    summary,
    rationale,
  };
}
