// Stage 3 of the pipeline: does this product fit this client? (PROJECT_SPEC §7.3)
//
// Two passes. Hard filters eliminate with a recorded reason; everything that
// survives gets a weighted score out of 100. Both halves carry rationale,
// because the UI shows "why this was picked" and "why this was ruled out" and
// neither is allowed to be a bare number (hard rule 5).
//
// Pure: no fs, no clock, no randomness. Config is handed in already parsed.

import type {
  AssetClass,
  AssetInventory,
  CategoryWeights,
  ClientProfile,
  DeploymentFitPolicy,
  DeploymentMode,
  DeviceClass,
  EstateShape,
  Framework,
  Product,
  ProductCategory,
  ProductTier,
  ScoringDimension,
  ScoringWeights,
} from '@stackfit/schema';
import {
  AssetClass as AssetClassEnum,
  ScaleClass,
  ScoringDimension as DimensionEnum,
} from '@stackfit/schema';

import { controlsClaimedBy } from './claims';
import { operationalFteFor } from './cost';
import type { SizingResult } from './sizing';

export interface ScoringInputs {
  readonly profile: ClientProfile;
  readonly inventory: AssetInventory;
  readonly sizing: SizingResult;
  /** The frameworks the analyst ticked, already loaded. Empty is normal. */
  readonly frameworks: readonly Framework[];
  readonly weights: ScoringWeights;
  /**
   * Surface weights, shared with the infrastructure stage.
   *
   * Asset coverage is measured in weighted surface units, not raw counts, for
   * exactly the reason `surfaceUnits` exists: 5,000 mailboxes is not more
   * estate than 4 firewalls. Counting raw assets here scored a SIEM that
   * ingested every server, domain controller and firewall at 0.5/100 in a
   * mailbox-heavy estate, on the heaviest-weighted dimension there is.
   */
  readonly categoryWeights: CategoryWeights;
  /**
   * The estate's shape, from the infrastructure stage.
   *
   * Used when the client states no deployment preference: what they run is then
   * the only evidence there is about what they should buy. Defaults to
   * `unknown`, which scores every product alike.
   */
  readonly estateShape?: EstateShape | undefined;
}

export interface DimensionScore {
  readonly dimension: ScoringDimension;
  /** 0–100 on this dimension alone. */
  readonly score: number;
  /** Weight actually used, after any procurement-bias adjustment. */
  readonly weight: number;
  /** score × weight / 100. Contributions sum to the overall score. */
  readonly contribution: number;
  readonly rationale: string;
}

/** One asset class and how many of them the client has. */
export interface AssetCount {
  readonly assetClass: AssetClass;
  readonly count: number;
}

export interface ProductScore {
  readonly productId: string;
  /**
   * The tier this score is for. A product is not one candidate, it is one per
   * SKU: Defender Plan 1 and Plan 2 cover different controls at different
   * prices, and recommending "Defender" without saying which is not a
   * recommendation a technical review survives.
   *
   * An eliminated product yields exactly one score, at its first tier, because
   * every hard filter in §7.3 is a property of the product rather than of what
   * you pay for it.
   */
  readonly tierId: string;
  readonly tierName: string;
  readonly category: ProductCategory;
  readonly eliminated: boolean;
  /** Set when eliminated. The UI shows this as "why this was ruled out". */
  readonly eliminationReasons: readonly string[];
  /** 0–100, or 0 when eliminated. */
  readonly score: number;
  readonly dimensions: readonly DimensionScore[];
  readonly opsFte: number;
  /**
   * What this product actually reaches in *their* environment, in raw counts
   * and in AssetClass declaration order (§8.2). Empty for an eliminated
   * product, which reaches nothing by definition.
   */
  readonly coveredAssets: readonly AssetCount[];
  /** Assets in its category's remit that it does not support. */
  readonly missedAssets: readonly AssetCount[];
  readonly rationale: readonly string[];
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / factor;
}

function countOf(inventory: AssetInventory, assetClass: AssetClass): number {
  return inventory[assetClass]?.count ?? 0;
}

/**
 * Weights after `procurementBias` shifts them, renormalised back to 100.
 *
 * Renormalising rather than letting the total drift keeps "out of 100" true,
 * which matters because §7.4 step 2 divides by this number.
 */
export function effectiveWeights(weights: ScoringWeights, profile: ClientProfile): Map<ScoringDimension, number> {
  const adjustment = weights.biasAdjustments.find((entry) => entry.bias === profile.procurementBias);
  const deltas = new Map(adjustment?.deltas.map((delta) => [delta.dimension, delta.delta]) ?? []);

  const adjusted = new Map<ScoringDimension, number>();
  let total = 0;
  // Declaration order keeps the floating-point total stable.
  for (const dimension of DimensionEnum.options) {
    const base = weights.dimensions.find((entry) => entry.dimension === dimension)?.weight ?? 0;
    const value = Math.max(0, base + (deltas.get(dimension) ?? 0));
    adjusted.set(dimension, value);
    total += value;
  }

  if (total === 0) return adjusted;
  for (const [dimension, value] of adjusted) {
    adjusted.set(dimension, (value * 100) / total);
  }
  return adjusted;
}

/**
 * Asset units this product reaches, and the units its category is expected to
 * reach, both in weighted surface units rather than raw counts.
 *
 * Measured against the category's remit rather than the whole estate: an email
 * gateway covers mailboxes and nothing else, and scoring it against every asset
 * the client owns would make it permanently unbuyable in the §7.4 value-density
 * ranking.
 */
function assetCoverage(
  product: Product,
  inventory: AssetInventory,
  weights: ScoringWeights,
  categoryWeights: CategoryWeights,
): {
  covered: number;
  inRemit: number;
  missedClasses: AssetClass[];
  coveredAssets: AssetCount[];
  missedAssets: AssetCount[];
} {
  const remit = weights.categoryRemits.find((entry) => entry.category === product.category);
  const remitClasses = new Set<DeviceClass>(remit?.deviceClasses ?? []);
  const supported = new Set<DeviceClass>(product.supports.deviceClasses);

  let covered = 0;
  let inRemit = 0;
  const missedClasses: AssetClass[] = [];
  const coveredAssets: AssetCount[] = [];
  const missedAssets: AssetCount[] = [];

  for (const assetClass of AssetClassEnum.options) {
    const count = countOf(inventory, assetClass);
    if (count === 0) continue;

    const deviceClass = weights.assetClassDeviceClass[assetClass];
    if (deviceClass === undefined || !remitClasses.has(deviceClass)) continue;

    // Weighted units, not raw counts — the same measure the infrastructure
    // stage uses, so a domain controller is not one mailbox.
    const units = count * (categoryWeights.surfaceUnits[assetClass]?.weight ?? 1);

    inRemit += units;
    if (supported.has(deviceClass)) {
      covered += units;
      // Raw counts alongside the weighted units: the units are what the score
      // is computed from, and the counts are what you say out loud — "covers 38
      // Windows servers and 40 POS terminals" (§8.2).
      coveredAssets.push({ assetClass, count });
    } else {
      missedClasses.push(assetClass);
      missedAssets.push({ assetClass, count });
    }
  }

  return { covered, inRemit, missedClasses, coveredAssets, missedAssets };
}

/**
 * Controls the client's frameworks ask of this category, and how many this
 * product covers *at this tier*.
 *
 * The tier matters: a lower SKU of the same product covers fewer controls, and
 * compliance fit is where that difference has to show up, because it is the
 * only dimension the catalog has evidence for. Everything else scores the same
 * for both tiers rather than being guessed at.
 */
function complianceCoverage(
  product: Product,
  tier: ProductTier,
  frameworks: readonly Framework[],
): { covered: number; required: number } {
  const claimed = controlsClaimedBy(product, tier.id);
  let required = 0;
  let covered = 0;

  for (const framework of frameworks) {
    for (const control of framework.controls) {
      if (!control.satisfiedBy.includes(product.category)) continue;
      required += 1;
      if (claimed.has(`${framework.id}:${control.id}`)) covered += 1;
    }
  }

  return { covered, required };
}

/**
 * How each estate shape reads in a sentence.
 *
 * The enum value is StackFit's vocabulary, not English — `on_prem_centric` with
 * its underscores swapped produces "a on prem centric estate". These strings are
 * wording rather than a tunable assumption, so they stay in code; nothing here
 * changes a number.
 */
const ESTATE_PHRASE: Readonly<Record<EstateShape, string>> = {
  saas_centric: 'a SaaS-centric estate',
  cloud_native: 'a cloud-native estate',
  on_prem_centric: 'a self-hosted estate',
  hybrid: 'an estate split between owned infrastructure and cloud',
  ot_heavy: 'an OT-heavy estate',
  unknown: 'an estate nobody has described yet',
};

/** `on_prem` reads as `on-prem`, `air_gapped` as `air-gapped`. */
function modeName(mode: DeploymentMode): string {
  return mode.replace(/_/g, '-');
}

/**
 * Deployment fit (§7.3), from what the client asked for — or, when they asked
 * for nothing, from what they actually run.
 *
 * `hybrid` is how this tool spells "no strong preference"; it is the wording on
 * the wizard's own dropdown. Treating it as a *demand* for a hybrid product
 * scored every cloud-only and every on-prem-only tool 30 out of 100 for a
 * client who had expressed no opinion at all — marking down precisely the
 * products that suited their estate best. When nothing is stated, the estate
 * decides, and the note says which of the two happened so nobody mistakes
 * StackFit's reading of the asset counts for something the client said.
 */
function deploymentFit(
  product: Product,
  profile: ClientProfile,
  estateShape: EstateShape,
  policy: DeploymentFitPolicy,
): { score: number; note: string } {
  const modes = product.supports.deploymentModes;
  const stated = profile.deploymentPreference;
  const deploysAs = modes.map(modeName).join('/');

  if (stated !== 'hybrid') {
    if (modes.includes(stated)) {
      return {
        score: policy.statedMatch,
        note: `Supports the client's preferred ${modeName(stated)} deployment directly.`,
      };
    }
    if (modes.includes('hybrid')) {
      return {
        score: policy.statedHybridFallback,
        note: `No native ${modeName(stated)} mode, but a hybrid deployment can usually be shaped to fit.`,
      };
    }
    return {
      score: policy.statedMismatch,
      note: `Deploys as ${deploysAs}, against a stated preference for ${modeName(stated)}. Workable, but not what they asked for.`,
    };
  }

  const affinity = policy.byEstateShape.find((entry) => entry.shape === estateShape);
  const prefers = affinity?.prefers ?? [];

  if (prefers.length === 0) {
    return {
      score: policy.noSignal,
      note:
        estateShape === 'unknown'
          ? 'No deployment preference stated and no inventory captured, so this dimension is neutral for every product. An absent answer is not evidence against anything.'
          : `No deployment preference stated, and ${ESTATE_PHRASE[estateShape]} does not imply one. Scored neutral.`,
    };
  }

  const matched = prefers.find((mode) => modes.includes(mode));
  if (matched !== undefined) {
    return {
      score: policy.inferredMatch,
      note: `No preference was stated, so the estate decides: this is ${ESTATE_PHRASE[estateShape]}, and ${modeName(matched)} deployment suits it. ${affinity?.basis ?? ''}`.trim(),
    };
  }
  if (modes.includes('hybrid')) {
    return {
      score: policy.inferredHybridFallback,
      note: `No preference was stated. This deploys hybrid, which fits ${ESTATE_PHRASE[estateShape]} well enough without being the obvious shape for it.`,
    };
  }
  return {
    score: policy.inferredMismatch,
    note: `No preference was stated, and ${ESTATE_PHRASE[estateShape]} points at ${prefers.map(modeName).join(' or ')} rather than ${deploysAs}. Marked down, not ruled out — this is StackFit reading the asset counts, not something the client said.`,
  };
}

function scaleFit(product: Product, sizing: SizingResult): { score: number; note: string } {
  const order = ScaleClass.options;
  const client = order.indexOf(sizing.scaleClass);
  const floor = order.indexOf(product.supports.scaleFloor);
  const ceiling = order.indexOf(product.supports.scaleCeiling);

  // Dead centre of the supported band scores 100; each step towards an edge costs.
  const distanceFromFloor = client - floor;
  const distanceFromCeiling = ceiling - client;
  const margin = Math.min(distanceFromFloor, distanceFromCeiling);
  const score = margin >= 1 ? 100 : 75;

  return {
    score,
    note:
      margin >= 1
        ? `A ${sizing.scaleClass} environment sits comfortably inside this product's ${product.supports.scaleFloor}–${product.supports.scaleCeiling} band.`
        : `A ${sizing.scaleClass} environment is at the edge of this product's ${product.supports.scaleFloor}–${product.supports.scaleCeiling} band, so it will fit but with little headroom.`,
  };
}

function integrationFit(
  product: Product,
  profile: ClientProfile,
): { score: number; note: string } {
  if (profile.retainedTools.length === 0) {
    return {
      score: 100,
      note: 'The client is keeping no existing tools, so there is nothing for this to clash with.',
    };
  }

  const integrations = new Set(product.integrations);
  const matched = profile.retainedTools.filter((tool) => integrations.has(tool));
  const score = (matched.length / profile.retainedTools.length) * 100;

  return {
    score,
    note:
      matched.length === 0
        ? `Declares no integration with any of the ${profile.retainedTools.length} tool(s) the client is keeping.`
        : `Integrates with ${matched.length} of ${profile.retainedTools.length} retained tool(s): ${matched.join(', ')}.`,
  };
}

function opsFit(
  opsFte: number,
  profile: ClientProfile,
  weights: ScoringWeights,
): { score: number; note: string } {
  const policy = weights.opsFit;

  if (profile.securityStaffFte === 0) {
    return {
      score: policy.scoreWithNoSecurityStaff,
      note:
        `The client has no security staff, so every self-run tool is a poor operational fit. ` +
        `This one needs ${round(opsFte, 2)} FTE. A managed alternative is the honest answer here.`,
    };
  }

  const share = opsFte / profile.securityStaffFte;
  if (share <= policy.comfortableShareOfFte) {
    return {
      score: 100,
      note: `Needs ${round(opsFte, 2)} FTE of the ${profile.securityStaffFte} available (${round(share * 100, 0)}%), which this team can absorb.`,
    };
  }
  if (share >= policy.unusableShareOfFte) {
    return {
      score: 0,
      note: `⚠ Needs ${round(opsFte, 2)} FTE against ${profile.securityStaffFte} available (${round(share * 100, 0)}%). This team cannot run it, whatever else it does well.`,
    };
  }

  // Linear between comfortable and unusable.
  const span = policy.unusableShareOfFte - policy.comfortableShareOfFte;
  const score = ((policy.unusableShareOfFte - share) / span) * 100;
  return {
    score,
    note: `Needs ${round(opsFte, 2)} FTE of the ${profile.securityStaffFte} available (${round(share * 100, 0)}%), which is more than this team can comfortably carry.`,
  };
}

/**
 * Pass 1 (§7.3): eliminate, with a recorded reason.
 *
 * Deliberately narrow. Only conditions that make a product genuinely unusable
 * eliminate; everything else is a score, because a hard filter is invisible to
 * the analyst in a way a low score is not.
 *
 * In particular `deploymentPreference` only eliminates when it is `air_gapped`,
 * which is a requirement rather than a preference — a SaaS product in an
 * air-gapped site cannot work at all, whereas an on-prem product for a
 * cloud-preferring client is merely not what they wanted, and that is what the
 * deployment-fit dimension is for.
 */
export function hardFilter(product: Product, inputs: ScoringInputs): string[] {
  const { profile, inventory, sizing, weights, categoryWeights } = inputs;
  const reasons: string[] = [];

  if (profile.excludedProducts.includes(product.id)) {
    reasons.push('Excluded by the analyst for this client.');
  }

  if (profile.deploymentPreference === 'air_gapped' && !product.supports.airGapCapable) {
    reasons.push(
      `This environment is air-gapped and ${product.name} cannot run air-gapped ` +
        `(supports ${product.supports.deploymentModes.join('/')}).`,
    );
  }

  const order = ScaleClass.options;
  const client = order.indexOf(sizing.scaleClass);
  if (client < order.indexOf(product.supports.scaleFloor)) {
    reasons.push(
      `A ${sizing.scaleClass} environment is below this product's ${product.supports.scaleFloor} floor — ` +
        'it is built for larger estates and would be overweight here.',
    );
  }
  if (client > order.indexOf(product.supports.scaleCeiling)) {
    reasons.push(
      `A ${sizing.scaleClass} environment is above this product's ${product.supports.scaleCeiling} ceiling — ` +
        'it would not carry this estate.',
    );
  }

  // Covers the §7.3 "does not support a required OS / device class / cloud
  // platform" filter in the only form that is safe to automate: if a product
  // reaches none of the assets its own category exists to protect, it does
  // nothing here.
  const coverage = assetCoverage(product, inventory, weights, categoryWeights);
  if (coverage.inRemit > 0 && coverage.covered === 0) {
    reasons.push(
      `Supports none of the ${coverage.inRemit} asset(s) a ${product.category} product would be ` +
        `bought to cover in this environment (it handles ${product.supports.deviceClasses.join(', ')}).`,
    );
  }

  return reasons;
}

/** Pass 2 (§7.3): weighted score out of 100 over the surviving products. */
export function scoreProduct(
  product: Product,
  tier: ProductTier,
  inputs: ScoringInputs,
): ProductScore {
  const { profile, inventory, sizing, frameworks, weights, categoryWeights } = inputs;

  const opsFte = operationalFteFor(product, sizing.monitoredAssetCount);
  const eliminationReasons = hardFilter(product, inputs);

  if (eliminationReasons.length > 0) {
    return {
      productId: product.id,
      tierId: tier.id,
      tierName: tier.name,
      category: product.category,
      eliminated: true,
      eliminationReasons,
      score: 0,
      dimensions: [],
      opsFte: round(opsFte, 3),
      coveredAssets: [],
      missedAssets: [],
      rationale: [`${product.name} was ruled out before scoring.`, ...eliminationReasons],
    };
  }

  const weightFor = effectiveWeights(weights, profile);

  const coverage = assetCoverage(product, inventory, weights, categoryWeights);
  const coverageScore = coverage.inRemit === 0 ? 100 : (coverage.covered / coverage.inRemit) * 100;
  const coverageNote =
    coverage.inRemit === 0
      ? `No assets in this category's remit were captured, so coverage is not a differentiator here and is scored neutral.`
      : `Reaches ${round(coverage.covered, 1)} of ${round(coverage.inRemit, 1)} weighted asset unit(s) in a ${product.category}'s remit` +
        (coverage.missedClasses.length > 0 ? `; misses ${coverage.missedClasses.join(', ')}.` : '.');

  const compliance = complianceCoverage(product, tier, frameworks);
  const complianceScore =
    compliance.required === 0 ? 100 : (compliance.covered / compliance.required) * 100;
  const complianceNote =
    frameworks.length === 0
      ? 'No compliance frameworks were selected, so this dimension is neutral for every product.'
      : compliance.required === 0
        ? `The selected frameworks ask nothing of a ${product.category}, so this dimension is neutral.`
        : `Covers ${compliance.covered} of the ${compliance.required} control(s) the selected frameworks ask of a ${product.category}.`;

  const ops = opsFit(opsFte, profile, weights);
  const deployment = deploymentFit(
    product,
    profile,
    inputs.estateShape ?? 'unknown',
    weights.deploymentFit,
  );
  const integration = integrationFit(product, profile);
  const scale = scaleFit(product, sizing);
  const maturityScore = weights.maturityScores[product.maturity];

  const raw: Record<ScoringDimension, { score: number; rationale: string }> = {
    asset_coverage: { score: coverageScore, rationale: coverageNote },
    compliance_fit: { score: complianceScore, rationale: complianceNote },
    ops_fit: { score: ops.score, rationale: ops.note },
    deployment_fit: { score: deployment.score, rationale: deployment.note },
    integration_fit: { score: integration.score, rationale: integration.note },
    scale_fit: { score: scale.score, rationale: scale.note },
    maturity: {
      score: maturityScore,
      rationale: `Maturity is "${product.maturity}", scored ${maturityScore}.`,
    },
  };

  const dimensions: DimensionScore[] = DimensionEnum.options.map((dimension) => {
    const weight = weightFor.get(dimension) ?? 0;
    const entry = raw[dimension];
    return {
      dimension,
      score: round(entry.score, 1),
      weight: round(weight, 2),
      contribution: round((entry.score * weight) / 100, 2),
      rationale: entry.rationale,
    };
  });

  const total = dimensions.reduce((sum, dimension) => sum + dimension.contribution, 0);

  const rationale: string[] = [
    `${product.name} scores ${round(total, 1)}/100 for this client.`,
    ...dimensions
      .slice()
      .sort((a, b) => b.contribution - a.contribution)
      .map(
        (dimension) =>
          `${dimension.dimension} ${dimension.score}/100 × weight ${dimension.weight} = ` +
          `${dimension.contribution}. ${dimension.rationale}`,
      ),
  ];

  if (profile.procurementBias !== 'no_preference') {
    rationale.push(
      `Weights were shifted for a "${profile.procurementBias}" procurement bias and renormalised to 100.`,
    );
  }

  return {
    productId: product.id,
    tierId: tier.id,
    tierName: tier.name,
    category: product.category,
    eliminated: false,
    eliminationReasons: [],
    score: round(total, 1),
    dimensions,
    opsFte: round(opsFte, 3),
    coveredAssets: coverage.coveredAssets,
    missedAssets: coverage.missedAssets,
    rationale,
  };
}

/**
 * Scores a whole catalog, one entry per sellable SKU.
 *
 * Every tier of every surviving product is scored separately, because the tier
 * is part of the recommendation: Plan 1 and Plan 2 of the same product claim
 * different controls at different prices, and a bundle has to name which one it
 * is quoting.
 *
 * An eliminated product appears exactly once, not once per tier. Every hard
 * filter in §7.3 tests the product — the analyst excluded it, it cannot run
 * air-gapped, it is outside the scale band, it reaches none of the assets its
 * category exists for — and none of those change with what you pay. Repeating
 * one reason per SKU would pad "why was X ruled out" with the same sentence
 * three times.
 *
 * Catalog order, then tier declaration order, so the output is stable.
 */
export function scoreProducts(
  products: readonly Product[],
  inputs: ScoringInputs,
): readonly ProductScore[] {
  return products.flatMap((product) => {
    const first = product.tiers[0];
    if (first === undefined) return [];

    const eliminated = scoreProduct(product, first, inputs);
    if (eliminated.eliminated) return [eliminated];

    return product.tiers.map((tier) => scoreProduct(product, tier, inputs));
  });
}

/**
 * Surviving SKUs for one category, best first. Ties break on catalog order, so
 * the cheaper tier of a product that scores identically at both is listed
 * first — a tie on fit is decided by price later, and this keeps the order
 * stable rather than arbitrary.
 */
export function rankWithinCategory(
  scores: readonly ProductScore[],
  category: ProductCategory,
): readonly ProductScore[] {
  return scores
    .map((score, index) => ({ score, index }))
    .filter(({ score }) => !score.eliminated && score.category === category)
    .sort((a, b) => b.score.score - a.score.score || a.index - b.index)
    .map(({ score }) => score);
}
