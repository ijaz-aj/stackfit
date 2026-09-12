import {
  coverageOfBundle,
  type Bundle,
  type PipelineResult,
  type UnfundedCategory,
} from '@stackfit/engine';
import type { CurrencyCode, Money, ProductCategory, ScaleClass } from '@stackfit/schema';

/**
 * The slice of a pipeline run the wizard's live readout needs.
 *
 * A `PipelineResult` carries the whole catalog, every score and every control;
 * sending that over the wire on each keystroke would be absurd. This is a
 * projection, not a second calculation. Every number below is copied from the
 * engine's output, never recomputed here (CONTRIBUTING.md hard rule 4).
 */

export interface EstimateSelection {
  readonly category: ProductCategory;
  readonly productId: string;
  readonly productName: string;
  readonly vendor: string;
  readonly fitScore: number;
  readonly mandatory: boolean;
  readonly annualSpend: Money;
  readonly annualRecurring: Money;
  readonly tco: Money;
}

export interface BundleSummary {
  readonly kind: Bundle['kind'];
  readonly selections: readonly EstimateSelection[];
  readonly annualSpend: Money;
  readonly annualRecurring: Money;
  readonly oneTime: Money;
  readonly tco: Money;
  readonly totalOpsFte: number;
  readonly withinAnnualCap: boolean;
  readonly withinOneTimeCap: boolean;
  readonly annualShortfall: Money | null;
  readonly minimumViableAnnual: Money | null;
  readonly oneTimeShortfall: Money | null;
  readonly minimumViableOneTime: Money | null;
  readonly unfundedMandatory: readonly ProductCategory[];
  readonly unfundedReasons: readonly UnfundedCategory[];
  readonly msspTotalAnnual: Money;
  readonly msspServiceLevel: string;
  readonly coveragePercent: number | null;
}

export interface EstimateSummary {
  readonly currency: CurrencyCode;
  readonly sizing: {
    readonly epsTotal: number;
    readonly gbPerDay: number;
    readonly licensedGbPerDay: number;
    readonly storageTb: number;
    readonly retentionDays: number;
    readonly monitoredAssetCount: number;
    readonly scaleClass: ScaleClass;
    readonly privilegedAccountCountEstimated: boolean;
  };
  readonly essential: BundleSummary;
  readonly recommended: BundleSummary;
  readonly phase2: BundleSummary;
  /** Categories the estate has nothing for, so nothing was recommended. */
  readonly ruledOutCategories: readonly ProductCategory[];
  /** Mandated by a framework but with nothing in the estate to protect. */
  readonly scopeQuestions: readonly ProductCategory[];
  readonly gapCount: number;
  readonly criticalGaps: readonly string[];
  /** Things an analyst must not put in front of a client without checking. */
  readonly warnings: readonly string[];
}

function summariseBundle(result: PipelineResult, bundle: Bundle): BundleSummary {
  return {
    kind: bundle.kind,
    selections: bundle.selections.map((selection) => ({
      category: selection.category,
      productId: selection.productId,
      productName: selection.productName,
      vendor: selection.vendor,
      fitScore: selection.fitScore,
      mandatory: selection.mandatory,
      annualSpend: selection.annualSpend,
      annualRecurring: selection.annualRecurring,
      tco: selection.tco,
    })),
    annualSpend: bundle.annualSpend,
    annualRecurring: bundle.annualRecurring,
    oneTime: bundle.oneTime,
    tco: bundle.tco,
    totalOpsFte: bundle.totalOpsFte,
    withinAnnualCap: bundle.withinAnnualCap,
    withinOneTimeCap: bundle.withinOneTimeCap,
    annualShortfall: bundle.annualShortfall,
    minimumViableAnnual: bundle.minimumViableAnnual,
    oneTimeShortfall: bundle.oneTimeShortfall,
    minimumViableOneTime: bundle.minimumViableOneTime,
    unfundedMandatory: bundle.unfundedMandatory,
    unfundedReasons: bundle.unfundedReasons,
    msspTotalAnnual: bundle.mssp.totalAnnual,
    msspServiceLevel: bundle.mssp.serviceLevel,
    coveragePercent: coverageOfBundle(result, bundle).summary.coveragePercent,
  };
}

/**
 * Warnings an analyst has to see before any of this reaches a client.
 *
 * Collected here rather than in a component because deciding *what is
 * worrying* is a judgement about the domain, not about layout.
 */
function warningsFrom(result: PipelineResult): string[] {
  const warnings: string[] = [];

  // The costing each selection was made on, tier included. Never a second
  // lookup by product id, which would read the wrong SKU's price.
  for (const selection of result.recommended.selections) {
    const { cost, productId } = selection;
    if (cost.hasPlaceholderPricing) {
      warnings.push(`${productId}: priced from a placeholder, not a real quote.`);
    } else if (cost.needsRecheck) {
      warnings.push(
        `${productId}: price is ${cost.pricingConfidence.replace(/_/g, ' ')} and due a re-check.`,
      );
    }
  }

  for (const framework of result.coverage.frameworks) {
    if (!framework.inScope) continue;
    if (framework.sourceQuality === 'provisional') {
      warnings.push(
        `${framework.name}: control list is provisional, not for a client-facing coverage claim.`,
      );
    } else if (framework.sourceQuality === 'secondary_sources') {
      warnings.push(
        `${framework.name}: control list is from secondary sources, not the publisher.`,
      );
    }
  }

  if (result.sizing.privilegedAccountCountEstimated) {
    warnings.push(
      'Privileged account count was estimated from IT headcount; it sizes any PAM licence.',
    );
  }

  return warnings;
}

export function summariseEstimate(result: PipelineResult): EstimateSummary {
  return {
    currency: result.recommended.currency,
    sizing: {
      epsTotal: result.sizing.epsTotal,
      gbPerDay: result.sizing.gbPerDay,
      licensedGbPerDay: result.sizing.licensedGbPerDay,
      storageTb: result.sizing.storageTb,
      retentionDays: result.sizing.retentionDays,
      monitoredAssetCount: result.sizing.monitoredAssetCount,
      scaleClass: result.sizing.scaleClass,
      privilegedAccountCountEstimated: result.sizing.privilegedAccountCountEstimated,
    },
    essential: summariseBundle(result, result.essential),
    recommended: summariseBundle(result, result.recommended),
    phase2: summariseBundle(result, result.phase2),
    ruledOutCategories: result.relevance
      .filter((entry) => !entry.applicable)
      .map((entry) => entry.category),
    scopeQuestions: result.rankings
      .filter((ranking) => ranking.mandatedButNotApplicable)
      .map((ranking) => ranking.category),
    gapCount: result.coverage.gaps.length,
    criticalGaps: result.coverage.gaps
      .filter((gap) => gap.residualRisk === 'critical')
      .map((gap) => gap.controlId),
    warnings: warningsFrom(result),
  };
}
