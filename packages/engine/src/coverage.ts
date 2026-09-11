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

import type { ProductCost } from './cost';
import type { CategoryRelevance } from './infrastructure';
import { sumMoney } from './money';
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

export interface CoverageGap {
  readonly controlId: string;
  readonly frameworkId: string;
  readonly frameworkName: string;
  readonly inScope: boolean;
  readonly title: string;
  readonly mandatory: boolean;
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
  readonly costs: ReadonlyMap<string, ProductCost>;
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

  const claimsByProduct = new Map<string, ReadonlySet<string>>(
    products.map((product) => [product.id, new Set(product.controlsCovered)]),
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
    if (!inScope) {
      rationale.push(
        'The client did not select this framework. It is a reference view of the stack, not a ' +
          'compliance position.',
      );
    }
    if (framework.sourceQuality !== 'publisher_verified') {
      rationale.push(
        `⚠ This framework's control list is graded ${framework.sourceQuality}, and any coverage ` +
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
function closersFor(
  control: ControlCoverage,
  inputs: CoverageInputs,
  eliminated: ReadonlySet<string>,
): readonly GapCloser[] {
  const { products, costs, profile } = inputs;
  const satisfying = new Set(control.satisfiedBy);

  return products
    .filter((product) => satisfying.has(product.category))
    .filter((product) => !eliminated.has(product.id))
    .filter((product) => !profile.excludedProducts.includes(product.id))
    .flatMap((product): GapCloser[] => {
      const cost = costs.get(product.id);
      if (cost === undefined) return [];
      return [
        {
          productId: product.id,
          productName: product.name,
          vendor: product.vendor,
          category: product.category,
          closesFully: product.controlsCovered.includes(control.controlId),
          annualSpend: cost.procurementAnnual,
          oneTime: cost.implementationOneTime,
          tco: cost.tco,
          opsFte: cost.opsFte,
          pricingConfidence: cost.pricingConfidence,
          needsRecheck: cost.needsRecheck,
        },
      ];
    })
    .sort((a, b) => {
      if (a.closesFully !== b.closesFully) return a.closesFully ? -1 : 1;
      if (a.annualSpend.amountMinor !== b.annualSpend.amountMinor) {
        return a.annualSpend.amountMinor - b.annualSpend.amountMinor;
      }
      if (a.tco.amountMinor !== b.tco.amountMinor) return a.tco.amountMinor - b.tco.amountMinor;
      return a.productId.localeCompare(b.productId);
    });
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
          const entry = tally.get(candidate.productId) ?? { closer: candidate, assignments: [] };
          entry.assignments.push({ gap, closesFully: candidate.closesFully });
          tally.set(candidate.productId, entry);
        }
      }
      if (tally.size === 0) break;

      const [best] = [...tally.values()].sort((a, b) => {
        // A purchase already on the list costs nothing more to use again.
        const aPlanned = planned.has(a.closer.productId);
        const bPlanned = planned.has(b.closer.productId);
        if (aPlanned !== bPlanned) return aPlanned ? -1 : 1;
        const byCount = b.assignments.length - a.assignments.length;
        if (byCount !== 0) return byCount;
        if (a.closer.annualSpend.amountMinor !== b.closer.annualSpend.amountMinor) {
          return a.closer.annualSpend.amountMinor - b.closer.annualSpend.amountMinor;
        }
        if (a.closer.tco.amountMinor !== b.closer.tco.amountMinor) {
          return a.closer.tco.amountMinor - b.closer.tco.amountMinor;
        }
        return a.closer.productId.localeCompare(b.closer.productId);
      });
      if (best === undefined) break;

      for (const assignment of best.assignments) remaining.delete(assignment.gap.controlId);
      const existing = planned.get(best.closer.productId);
      if (existing === undefined) {
        planned.set(best.closer.productId, best);
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
        .filter((control) => control.status === 'gap')
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
    graded.map((entry) => [
      entry.control.controlId,
      closersFor(entry.control, inputs, eliminated),
    ]),
  );

  const gaps: CoverageGap[] = [];
  const unclosable: string[] = [];

  for (const entry of graded) {
    const candidates = candidatesByControl.get(entry.control.controlId) ?? [];
    const best = candidates[0] ?? null;
    if (best === null) unclosable.push(entry.control.controlId);

    const rationale: string[] = [
      `Residual risk ${entry.risk}: ${entry.why}.`,
      ...entry.control.rationale,
    ];
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
          `⚠ ${best.productName}'s price is graded ${best.pricingConfidence} and is due a ` +
            're-check; the fix cost above should not reach a client until it has been.',
        );
      }
    }

    gaps.push({
      controlId: entry.control.controlId,
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

      return {
        productId: closer.productId,
        productName: closer.productName,
        vendor: closer.vendor,
        category: closer.category,
        annualSpend: closer.annualSpend,
        oneTime: closer.oneTime,
        tco: closer.tco,
        opsFte: closer.opsFte,
        closesControls: fully.map((gap) => gap.controlId),
        partiallyClosesControls: partly.map((gap) => gap.controlId),
        frameworks: frameworkIds,
        worstResidualRisk: worst,
        rationale: [
          `Adding ${closer.productName} (${closer.category}) closes ${fully.length} control(s) ` +
            'outright' +
            (partly.length > 0 ? ` and partly addresses ${partly.length} more` : '') +
            ` across ${frameworkIds.join(', ')}.`,
          `${closer.annualSpend.amountMinor / 100} ${currency}/yr of procurement spend, ` +
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
      return a.productId.localeCompare(b.productId);
    });

  // The gap list and the shopping list are two views of one answer, so each gap
  // names the purchase that closes it rather than leaving the reader to guess
  // why its cheapest fix is not the one on the list.
  const reportedGaps = gaps.map((gap): CoverageGap => {
    const productId = purchaseByControl.get(gap.controlId) ?? null;
    const displaced =
      productId !== null && gap.cheapestCloser !== null && gap.cheapestCloser.productId !== productId;
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
