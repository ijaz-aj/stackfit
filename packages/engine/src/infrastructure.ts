// Derives the shape of a client's estate from their asset inventory, and turns
// that shape into a per-category relevance weight.
//
// This fills a gap in PROJECT_SPEC §7.4 step 1, which ranks categories by
// "risk-reduction weight, adjusted by industry and compliance". A client with
// no compliance obligation was therefore ranked on generic weights alone, and
// two clients with completely different infrastructure got the same stack.
// Compliance promotes a category to mandatory; infrastructure decides whether
// the category is worth anything at all. For an unregulated client it is the
// only signal there is.
//
// Pure: no fs, no clock, no randomness. Config is handed in already parsed.
// Every sum walks the enums in declaration order so a reordered inventory
// object cannot change a floating-point total.

import type {
  AssetClass,
  AssetInventory,
  CategoryWeights,
  EstateShape,
  InfrastructureSurface,
  ProductCategory,
} from '@stackfit/schema';
import {
  AssetClass as AssetClassEnum,
  InfrastructureSurface as SurfaceEnum,
  ProductCategory as ProductCategoryEnum,
} from '@stackfit/schema';

/** One asset class's contribution to a surface. */
export interface SurfaceContributor {
  readonly assetClass: AssetClass;
  readonly count: number;
  /** count × the class's surface weight. */
  readonly units: number;
}

export interface SurfaceBreakdown {
  readonly surface: InfrastructureSurface;
  readonly units: number;
  /** Share of the estate's total surface units, 0–1. */
  readonly share: number;
  readonly present: boolean;
  /** Share is at or above `materialSurfaceShare`. */
  readonly material: boolean;
  /** Contributing classes with a non-zero count, in AssetClass order. */
  readonly contributors: readonly SurfaceContributor[];
}

export interface InfrastructureProfile {
  readonly shape: EstateShape;
  readonly totalUnits: number;
  /** Every surface, in declaration order, including absent ones. */
  readonly surfaces: readonly SurfaceBreakdown[];
  readonly materialSurfaces: readonly InfrastructureSurface[];
  /** Hard rule 5: a number with no explanation does not ship. */
  readonly rationale: readonly string[];
}

export interface CategoryRelevance {
  readonly category: ProductCategory;
  /**
   * False when the estate has none of the surfaces this category acts on. Such
   * a category is dropped rather than ranked last: recommending network
   * detection to a client with no network is not a cheaper recommendation, it
   * is a wrong one.
   */
  readonly applicable: boolean;
  /** baseRiskReduction × estateMultiplier, or 0 when not applicable. */
  readonly weight: number;
  readonly baseRiskReduction: number;
  /** Affinity-weighted mean across the estate's surface shares. 1.0 is neutral. */
  readonly estateMultiplier: number;
  readonly rationale: readonly string[];
}

/** Rounds half away from zero, matching the money helpers rather than Math.round. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / factor;
}

function countOf(inventory: AssetInventory, assetClass: AssetClass): number {
  const line = inventory[assetClass];
  return line?.count ?? 0;
}

/**
 * Stage 1b: what shape is this estate?
 *
 * Raw asset counts cannot be compared across classes (5,000 mailboxes is not
 * "more estate" than 4 firewalls) so each class contributes
 * `count × surfaceUnits[class].weight` instead of its raw count.
 */
export function computeInfrastructureProfile(
  inventory: AssetInventory,
  config: CategoryWeights,
): InfrastructureProfile {
  const unitsBySurface = new Map<InfrastructureSurface, number>();
  const contributorsBySurface = new Map<InfrastructureSurface, SurfaceContributor[]>();
  for (const surface of SurfaceEnum.options) {
    unitsBySurface.set(surface, 0);
    contributorsBySurface.set(surface, []);
  }

  let totalUnits = 0;
  // Declaration order, so the floating-point total is order-stable.
  for (const assetClass of AssetClassEnum.options) {
    const count = countOf(inventory, assetClass);
    if (count === 0) continue;

    const mapping = config.surfaceUnits[assetClass];
    // The schema guarantees a mapping for every class; this is belt and braces.
    if (mapping === undefined) continue;

    const units = count * mapping.weight;
    unitsBySurface.set(mapping.surface, (unitsBySurface.get(mapping.surface) ?? 0) + units);
    contributorsBySurface.get(mapping.surface)?.push({ assetClass, count, units: round(units, 3) });
    totalUnits += units;
  }

  const surfaces: SurfaceBreakdown[] = SurfaceEnum.options.map((surface) => {
    const units = unitsBySurface.get(surface) ?? 0;
    const share = totalUnits === 0 ? 0 : units / totalUnits;
    return {
      surface,
      units: round(units, 3),
      share: round(share, 4),
      present: units > 0,
      material: share >= config.materialSurfaceShare,
      contributors: contributorsBySurface.get(surface) ?? [],
    };
  });

  const shareOf = (surface: InfrastructureSurface): number =>
    totalUnits === 0 ? 0 : (unitsBySurface.get(surface) ?? 0) / totalUnits;

  const rationale: string[] = [];
  const materialSurfaces = surfaces.filter((s) => s.material).map((s) => s.surface);

  const shape = classifyShape(shareOf, totalUnits, config, rationale);

  if (totalUnits === 0) {
    rationale.push(
      'No asset counts were captured, so no infrastructure signal is available. ' +
        'Category ranking will fall back to generic risk weights alone.',
    );
  } else {
    rationale.push(
      `Estate totals ${round(totalUnits, 1)} weighted surface units across ` +
        `${surfaces.filter((s) => s.present).length} of ${SurfaceEnum.options.length} surfaces.`,
    );
    for (const surface of surfaces) {
      if (!surface.material) continue;
      rationale.push(
        `${surface.surface} is ${round(surface.share * 100, 1)}% of the estate ` +
          `(${round(surface.units, 1)} units), which is material.`,
      );
    }
    const absent = surfaces.filter((s) => !s.present).map((s) => s.surface);
    if (absent.length > 0) {
      rationale.push(
        `No assets at all on: ${absent.join(', ')}. Categories that act only on ` +
          'those surfaces are not applicable to this client.',
      );
    }
  }

  return { shape, totalUnits: round(totalUnits, 3), surfaces, materialSurfaces, rationale };
}

/**
 * Names the estate from where the computing actually lives: owned
 * infrastructure, cloud tenancy, or SaaS. Endpoints and accounts are excluded
 * from that judgement because every estate has them, so they say nothing about
 * its shape.
 */
function classifyShape(
  shareOf: (surface: InfrastructureSurface) => number,
  totalUnits: number,
  config: CategoryWeights,
  rationale: string[],
): EstateShape {
  if (totalUnits === 0) return 'unknown';

  const otShare = shareOf('ot_ics');
  if (otShare >= config.otHeavyShare) {
    rationale.push(
      `OT, ICS and IoT are ${round(otShare * 100, 1)}% of the estate, at or above the ` +
        `${round(config.otHeavyShare * 100, 1)}% threshold, so this reads as an OT-heavy ` +
        'environment where availability and safety outrank confidentiality.',
    );
    return 'ot_heavy';
  }

  const onPrem = shareOf('on_prem_server') + shareOf('network_edge') + shareOf('public_app');
  const cloud = shareOf('cloud_iaas');
  const saas = shareOf('saas_identity');
  const locus = onPrem + cloud + saas;

  if (locus === 0) {
    rationale.push(
      'Only endpoints, accounts or OT were captured, and nothing that says where this ' +
        "client's computing actually happens. The estate shape is left unknown rather " +
        'than guessed.',
    );
    return 'unknown';
  }

  const onPremShare = onPrem / locus;
  const cloudShare = cloud / locus;
  const saasShare = saas / locus;
  const threshold = config.dominantLocusShare;

  if (onPremShare >= threshold) {
    rationale.push(
      `${round(onPremShare * 100, 1)}% of the workload-bearing estate is infrastructure the ` +
        'client runs themselves, so recommendations lean to controls that need somewhere to sit.',
    );
    return 'on_prem_centric';
  }
  if (saasShare >= threshold) {
    rationale.push(
      `${round(saasShare * 100, 1)}% of the workload-bearing estate is SaaS. Identity and mail ` +
        'are the perimeter here; there is little network to defend and few hosts to agent.',
    );
    return 'saas_centric';
  }
  if (cloudShare >= threshold) {
    rationale.push(
      `${round(cloudShare * 100, 1)}% of the workload-bearing estate is cloud tenancy, so the ` +
        'control plane and its logs matter more than any physical boundary.',
    );
    return 'cloud_native';
  }

  rationale.push(
    `The estate splits ${round(onPremShare * 100, 1)}% owned infrastructure / ` +
      `${round(cloudShare * 100, 1)}% cloud / ${round(saasShare * 100, 1)}% SaaS, with none ` +
      `reaching the ${round(threshold * 100, 1)}% mark, so it is treated as hybrid and has to ` +
      'be defended on more than one front.',
  );
  return 'hybrid';
}

/**
 * Stage 1c: how much is each product category worth to *this* estate?
 *
 * The weight is `baseRiskReduction × estateMultiplier`, where the multiplier is
 * the affinity-weighted mean of the estate's surface shares. Because the shares
 * sum to 1, a category with no stated affinities scores exactly its base
 * weight, and every deviation is traceable to a surface the client actually has.
 *
 * This does not consider compliance. Compliance promotes a category to
 * mandatory in `portfolio.ts`; this says what the infrastructure alone is
 * asking for, which for a client with no obligations is the whole answer.
 */
export function computeCategoryRelevance(
  profile: InfrastructureProfile,
  config: CategoryWeights,
): readonly CategoryRelevance[] {
  const shareBySurface = new Map<InfrastructureSurface, number>(
    profile.surfaces.map((surface) => [surface.surface, surface.share]),
  );
  const presentSurfaces = new Set<InfrastructureSurface>(
    profile.surfaces.filter((surface) => surface.present).map((surface) => surface.surface),
  );
  const byCategory = new Map(config.categories.map((weight) => [weight.category, weight]));

  // ProductCategory declaration order keeps the output stable.
  return ProductCategoryEnum.options.map((category): CategoryRelevance => {
    const weight = byCategory.get(category);
    // The schema requires a weight for every category; this keeps the types honest.
    if (weight === undefined) {
      return {
        category,
        applicable: false,
        weight: 0,
        baseRiskReduction: 0,
        estateMultiplier: 0,
        rationale: [`No weight is configured for ${category}, so it cannot be ranked.`],
      };
    }

    const rationale: string[] = [];

    const satisfied = weight.requiresAnyOf.filter((surface) => presentSurfaces.has(surface));
    if (profile.totalUnits > 0 && satisfied.length === 0) {
      rationale.push(
        `Not applicable: ${category} acts on ${weight.requiresAnyOf.join(' or ')}, and this ` +
          'estate has none of those. Ruled out rather than ranked last, because buying it ' +
          'would protect nothing.',
      );
      return {
        category,
        applicable: false,
        weight: 0,
        baseRiskReduction: weight.baseRiskReduction,
        estateMultiplier: 0,
        rationale,
      };
    }

    const affinityBySurface = new Map(
      weight.affinities.map((affinity) => [affinity.surface, affinity]),
    );

    // Neutral multiplier when there is no inventory to reason from.
    let estateMultiplier = 1;
    if (profile.totalUnits > 0) {
      let sum = 0;
      for (const surface of SurfaceEnum.options) {
        const share = shareBySurface.get(surface) ?? 0;
        if (share === 0) continue;
        sum += share * (affinityBySurface.get(surface)?.multiplier ?? 1);
      }
      estateMultiplier = sum;
    }

    const scored = weight.baseRiskReduction * estateMultiplier;

    rationale.push(`Base risk-reduction weight ${weight.baseRiskReduction}: ${weight.basis}`);

    if (profile.totalUnits === 0) {
      rationale.push(
        'No inventory was captured, so the estate multiplier is left at 1.0 and this is the ' +
          'generic weight rather than a fitted one.',
      );
    } else {
      // Name only the affinities that actually moved the number, biggest first.
      const movers = weight.affinities
        .map((affinity) => ({
          affinity,
          share: shareBySurface.get(affinity.surface) ?? 0,
        }))
        .filter((entry) => entry.share > 0 && entry.affinity.multiplier !== 1)
        .sort(
          (a, b) =>
            Math.abs(b.share * (b.affinity.multiplier - 1)) -
            Math.abs(a.share * (a.affinity.multiplier - 1)),
        );

      for (const { affinity, share } of movers) {
        const direction = affinity.multiplier > 1 ? 'raises' : 'lowers';
        rationale.push(
          `${affinity.surface} is ${round(share * 100, 1)}% of the estate and ${direction} this ` +
            `to ×${affinity.multiplier}: ${affinity.basis}`,
        );
      }

      rationale.push(
        `Estate multiplier ×${round(estateMultiplier, 3)} against a ${profile.shape} estate, ` +
          `giving a weight of ${round(scored, 1)}.`,
      );
    }

    return {
      category,
      applicable: true,
      weight: round(scored, 1),
      baseRiskReduction: weight.baseRiskReduction,
      estateMultiplier: round(estateMultiplier, 3),
      rationale,
    };
  });
}

/** Applicable categories, most relevant first. Ties break on declaration order. */
export function rankCategories(
  relevance: readonly CategoryRelevance[],
): readonly CategoryRelevance[] {
  return relevance
    .filter((entry) => entry.applicable)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.weight - a.entry.weight || a.index - b.index)
    .map(({ entry }) => entry);
}
