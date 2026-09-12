// Two scenarios, side by side (PROJECT_SPEC §11 phase 9).
//
// The point of cloning a scenario is to change one thing and see what it does:
// give them two security engineers, drop the budget, add PCI. A comparison that
// only showed the two answers would leave the analyst diffing by eye. This
// diffs both ends — what the analyst changed, and what it cost.
//
// Cells are the same typed cells the exports use, so one `renderCell` formats
// a comparison and a proposal alike, and money is never formatted here.
//
// Pure: no fs, no clock, no randomness.

import type {
  AssetClass,
  AssetInventory,
  ClientProfile,
  CurrencyCode,
  Money,
  ProductCategory,
} from '@stackfit/schema';
import { AssetClass as AssetClassEnum } from '@stackfit/schema';

import type { CoverageResult } from './coverage';
import { moneyInWords, subtractMoney } from './money';
import type { Bundle } from './portfolio';
import { CATEGORY_LABELS, type ProposalCell } from './proposal';
import type { SizingResult } from './sizing';

/**
 * `only-left` and `only-right` rather than "added"/"removed": neither side of a
 * comparison is the original. An analyst flipping the order must see the same
 * differences, not an inverted story about who changed what.
 */
export type ChangeKind = 'same' | 'changed' | 'only-left' | 'only-right';

export interface ValueChange {
  readonly label: string;
  readonly left: ProposalCell | null;
  readonly right: ProposalCell | null;
  /** Right minus left, where both sides are comparable. Null otherwise. */
  readonly delta: ProposalCell | null;
  readonly kind: ChangeKind;
}

export interface CategorySide {
  readonly productName: string;
  readonly tierName: string;
  readonly annualSpend: Money;
  readonly mandatory: boolean;
}

export interface CategoryChange {
  readonly category: ProductCategory;
  readonly categoryLabel: string;
  readonly left: CategorySide | null;
  readonly right: CategorySide | null;
  readonly kind: ChangeKind;
}

export interface ScenarioComparison {
  readonly leftName: string;
  readonly rightName: string;
  readonly currency: CurrencyCode;
  /**
   * Set when the two scenarios are priced in different currencies. Every money
   * figure below is then in its own currency and the deltas are suppressed,
   * because subtracting rupees from dollars produces a number that looks like
   * an answer.
   */
  readonly currencyMismatch: { readonly left: CurrencyCode; readonly right: CurrencyCode } | null;
  /** What the analyst changed. */
  readonly inputs: readonly ValueChange[];
  /** What it did to the numbers. */
  readonly headlines: readonly ValueChange[];
  /** What it did to the stack, one row per category either side funds. */
  readonly categories: readonly CategoryChange[];
  readonly coverage: readonly ValueChange[];
  /** Plain statements of the difference, for a summary line or an export. */
  readonly summary: readonly string[];
}

export interface ComparisonSide {
  readonly name: string;
  readonly profile: ClientProfile;
  readonly inventory: AssetInventory;
  readonly sizing: SizingResult;
  readonly bundle: Bundle;
  readonly coverage: CoverageResult;
}

const text = (value: string): ProposalCell => ({ kind: 'text', value });
const money = (value: Money): ProposalCell => ({ kind: 'money', value });
const number = (value: number, decimals = 0): ProposalCell => ({ kind: 'number', value, decimals });
const percent = (value: number | null): ProposalCell => ({ kind: 'percent', value });

function kindOf(left: unknown, right: unknown): ChangeKind {
  if (left === undefined || left === null) return right === undefined || right === null ? 'same' : 'only-right';
  if (right === undefined || right === null) return 'only-left';
  return left === right ? 'same' : 'changed';
}

function textChange(label: string, left: string, right: string): ValueChange {
  return {
    label,
    left: text(left),
    right: text(right),
    delta: null,
    kind: kindOf(left, right),
  };
}

function numberChange(label: string, left: number, right: number, decimals = 0): ValueChange {
  return {
    label,
    left: number(left, decimals),
    right: number(right, decimals),
    delta: left === right ? null : number(right - left, decimals),
    kind: left === right ? 'same' : 'changed',
  };
}

function moneyChange(label: string, left: Money, right: Money, comparable: boolean): ValueChange {
  const same = comparable && left.amountMinor === right.amountMinor;
  return {
    label,
    left: money(left),
    right: money(right),
    delta: !comparable || same ? null : money(subtractMoney(right, left)),
    kind: same ? 'same' : 'changed',
  };
}

/** Profile fields an analyst actually varies between two runs of the same client. */
function profileChanges(left: ClientProfile, right: ClientProfile, comparable: boolean): ValueChange[] {
  const changes: ValueChange[] = [
    textChange('Industry', left.industry, right.industry),
    textChange('Region', left.region, right.region),
    numberChange('Employees', left.employeeCount, right.employeeCount),
    numberChange('IT staff', left.itStaffCount, right.itStaffCount),
    numberChange('Security staff (FTE)', left.securityStaffFte, right.securityStaffFte, 2),
    textChange('SOC posture', left.hasSoc, right.hasSoc),
    textChange('Risk tolerance', left.riskTolerance, right.riskTolerance),
    textChange('Data sensitivity', left.dataSensitivity, right.dataSensitivity),
    textChange('Environment', left.environment, right.environment),
    textChange('Deployment constraint', left.deploymentConstraint, right.deploymentConstraint),
    textChange('Procurement bias', left.procurementBias, right.procurementBias),
    textChange(
      'Compliance',
      left.compliance.length === 0 ? 'none' : [...left.compliance].sort().join(', '),
      right.compliance.length === 0 ? 'none' : [...right.compliance].sort().join(', '),
    ),
    numberChange('Budget horizon (years)', left.budget.horizonYears, right.budget.horizonYears),
  ];

  // Both caps, because both bind and they bind independently. Comparing only
  // the annual one left the headline demo — the same client with a larger
  // implementation budget — reporting "no differences" in its inputs panel
  // beside a completely different recommended stack.
  const capChange = (label: string, leftCap: Money | null, rightCap: Money | null): void => {
    if (leftCap === null && rightCap === null) return;
    changes.push({
      label,
      left: leftCap === null ? text('none') : money(leftCap),
      right: rightCap === null ? text('none') : money(rightCap),
      delta:
        comparable && leftCap !== null && rightCap !== null && leftCap.amountMinor !== rightCap.amountMinor
          ? money(subtractMoney(rightCap, leftCap))
          : null,
      kind:
        leftCap === null || rightCap === null
          ? kindOf(leftCap, rightCap)
          : leftCap.amountMinor === rightCap.amountMinor
            ? 'same'
            : 'changed',
    });
  };

  capChange('Annual budget cap', left.budget.annualCap, right.budget.annualCap);
  capChange('One-time budget cap', left.budget.oneTimeCap, right.budget.oneTimeCap);

  return changes.filter((change) => change.kind !== 'same');
}

/** Asset classes whose counts differ. Walked in declaration order, so it is stable. */
function inventoryChanges(left: AssetInventory, right: AssetInventory): ValueChange[] {
  const changes: ValueChange[] = [];

  for (const assetClass of AssetClassEnum.options) {
    const leftCount = left[assetClass as AssetClass]?.count;
    const rightCount = right[assetClass as AssetClass]?.count;
    if (leftCount === undefined && rightCount === undefined) continue;
    if (leftCount === rightCount) continue;

    changes.push({
      label: assetClass,
      left: leftCount === undefined ? text('not asked') : number(leftCount),
      right: rightCount === undefined ? text('not asked') : number(rightCount),
      delta:
        leftCount === undefined || rightCount === undefined ? null : number(rightCount - leftCount),
      kind: kindOf(leftCount, rightCount),
    });
  }

  return changes;
}

function headlineChanges(left: ComparisonSide, right: ComparisonSide, comparable: boolean): ValueChange[] {
  return [
    numberChange('Controls funded', left.bundle.selections.length, right.bundle.selections.length),
    moneyChange('Annual spend', left.bundle.annualSpend, right.bundle.annualSpend, comparable),
    moneyChange('Total annual cost', left.bundle.annualRecurring, right.bundle.annualRecurring, comparable),
    moneyChange('One-time', left.bundle.oneTime, right.bundle.oneTime, comparable),
    moneyChange('TCO over the horizon', left.bundle.tco, right.bundle.tco, comparable),
    numberChange('Operational FTE', left.bundle.totalOpsFte, right.bundle.totalOpsFte, 2),
    numberChange('Estimated GB/day', left.sizing.gbPerDay, right.sizing.gbPerDay, 2),
    numberChange('Monitored assets', left.sizing.monitoredAssetCount, right.sizing.monitoredAssetCount),
  ];
}

function coverageChanges(left: CoverageResult, right: CoverageResult): ValueChange[] {
  const frameworks = new Set([
    ...left.frameworks.map((framework) => framework.frameworkId),
    ...right.frameworks.map((framework) => framework.frameworkId),
  ]);

  const changes: ValueChange[] = [];
  for (const id of frameworks) {
    const leftFramework = left.frameworks.find((framework) => framework.frameworkId === id);
    const rightFramework = right.frameworks.find((framework) => framework.frameworkId === id);
    const leftPercent = leftFramework?.coveragePercent ?? null;
    const rightPercent = rightFramework?.coveragePercent ?? null;

    changes.push({
      label: leftFramework?.name ?? rightFramework?.name ?? id,
      left: leftFramework === undefined ? text('not in scope') : percent(leftPercent),
      right: rightFramework === undefined ? text('not in scope') : percent(rightPercent),
      delta:
        leftPercent === null || rightPercent === null || leftPercent === rightPercent
          ? null
          : number(rightPercent - leftPercent, 1),
      kind:
        leftFramework === undefined || rightFramework === undefined
          ? kindOf(leftFramework, rightFramework)
          : leftPercent === rightPercent
            ? 'same'
            : 'changed',
    });
  }

  return changes;
}

function sideOf(bundle: Bundle, category: ProductCategory): CategorySide | null {
  const selection = bundle.selections.find((entry) => entry.category === category);
  if (selection === undefined) return null;
  return {
    productName: selection.productName,
    tierName: selection.tierName,
    annualSpend: selection.annualSpend,
    mandatory: selection.mandatory,
  };
}

function categoryChanges(left: Bundle, right: Bundle): CategoryChange[] {
  const categories = new Set<ProductCategory>([
    ...left.selections.map((selection) => selection.category),
    ...right.selections.map((selection) => selection.category),
  ]);

  return [...categories]
    .sort((a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b]))
    .map((category) => {
      const leftSide = sideOf(left, category);
      const rightSide = sideOf(right, category);

      const kind: ChangeKind =
        leftSide === null
          ? 'only-right'
          : rightSide === null
            ? 'only-left'
            : leftSide.productName === rightSide.productName &&
                leftSide.tierName === rightSide.tierName
              ? 'same'
              : 'changed';

      return {
        category,
        categoryLabel: CATEGORY_LABELS[category],
        left: leftSide,
        right: rightSide,
        kind,
      };
    });
}

/**
 * Statements of fact about the difference, in the order an analyst would say
 * them out loud. Deliberately not a narrative: the tool reports what changed,
 * and the analyst decides what it means.
 */
function summarise(
  left: ComparisonSide,
  right: ComparisonSide,
  categories: readonly CategoryChange[],
  comparable: boolean,
): string[] {
  const lines: string[] = [];

  const swapped = categories.filter((change) => change.kind === 'changed');
  const onlyRight = categories.filter((change) => change.kind === 'only-right');
  const onlyLeft = categories.filter((change) => change.kind === 'only-left');

  if (swapped.length === 0 && onlyLeft.length === 0 && onlyRight.length === 0) {
    lines.push('Both scenarios recommend exactly the same stack.');
  }

  for (const change of swapped) {
    lines.push(
      `${change.categoryLabel}: ${change.left?.productName} → ${change.right?.productName}.`,
    );
  }
  if (onlyRight.length > 0) {
    lines.push(
      `Funded only in ${right.name}: ${onlyRight.map((change) => change.categoryLabel).join(', ')}.`,
    );
  }
  if (onlyLeft.length > 0) {
    lines.push(
      `Funded only in ${left.name}: ${onlyLeft.map((change) => change.categoryLabel).join(', ')}.`,
    );
  }

  if (comparable) {
    const delta = right.bundle.annualSpend.amountMinor - left.bundle.annualSpend.amountMinor;
    if (delta !== 0) {
      lines.push(
        `Annual spend is ${delta > 0 ? 'higher' : 'lower'} in ${right.name} by ` +
          `${moneyInWords({ amountMinor: Math.abs(delta), currency: right.bundle.currency })}.`,
      );
    }
  }

  const fteDelta = right.bundle.totalOpsFte - left.bundle.totalOpsFte;
  if (Math.abs(fteDelta) >= 0.01) {
    lines.push(
      `Operational effort is ${fteDelta > 0 ? 'higher' : 'lower'} in ${right.name} by ` +
        `${Math.abs(Math.round(fteDelta * 100) / 100)} FTE. That is people, and it is not in the ` +
        'budget cap.',
    );
  }

  for (const side of [left, right]) {
    if (side.bundle.unfundedMandatory.length > 0) {
      lines.push(
        `⚠ ${side.name} leaves a compliance obligation unfunded: ` +
          `${side.bundle.unfundedMandatory.map((category) => CATEGORY_LABELS[category]).join(', ')}.`,
      );
    }
  }

  return lines;
}

/** Two scenarios, diffed at both ends (§11 phase 9). */
export function compareScenarios(left: ComparisonSide, right: ComparisonSide): ScenarioComparison {
  const comparable = left.bundle.currency === right.bundle.currency;
  const categories = categoryChanges(left.bundle, right.bundle);

  const summary = summarise(left, right, categories, comparable);
  if (!comparable) {
    summary.unshift(
      `⚠ These scenarios are priced in different currencies — ${left.bundle.currency} against ` +
        `${right.bundle.currency}. Every money figure below is in its own currency and no ` +
        'difference is shown, because subtracting one from the other would produce a number that ' +
        'looks like an answer.',
    );
  }

  return {
    leftName: left.name,
    rightName: right.name,
    currency: left.bundle.currency,
    currencyMismatch: comparable
      ? null
      : { left: left.bundle.currency, right: right.bundle.currency },
    inputs: [
      ...profileChanges(left.profile, right.profile, comparable),
      ...inventoryChanges(left.inventory, right.inventory),
    ],
    headlines: headlineChanges(left, right, comparable),
    categories,
    coverage: coverageChanges(left.coverage, right.coverage),
    summary,
  };
}
