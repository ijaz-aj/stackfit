// The shape of a client's estate, and what that shape implies about which
// product categories are worth buying.
//
// This exists because of a gap in PROJECT_SPEC §7.4 step 1, which ranks
// categories by "risk-reduction weight, adjusted by industry and compliance".
// A client with no compliance obligation therefore got a ranking driven only by
// generic risk weights — so an all-SaaS consultancy and an all-on-prem
// manufacturer received the same stack. Infrastructure is the missing term, and
// for an unregulated client it is the *only* term that should be driving the
// recommendation.
//
// Network detection sold to a company with no network is not a defensible
// recommendation, and neither is a firewall sold to a company whose entire
// estate is someone else's SaaS.

import { z } from 'zod';

import { AssetClass } from './asset-inventory';
import { Industry, ProductCategory } from './enums';

/**
 * The attack surfaces an estate can present. Every asset class maps to exactly
 * one of these, so the shares across an estate sum to 1 and a "share of estate"
 * figure means something.
 */
export const InfrastructureSurface = z.enum([
  /** Laptops and desktops — where most malware ultimately executes. */
  'endpoint',
  /** Servers, hypervisors, containers, databases, internal apps. */
  'on_prem_server',
  /** Firewalls, VPN concentrators, routers, switches, load balancers. */
  'network_edge',
  /** Internet-facing web applications. */
  'public_app',
  /** AWS accounts, Azure subscriptions, GCP projects and their workloads. */
  'cloud_iaas',
  /** M365 / Workspace seats and other critical SaaS — the identity perimeter. */
  'saas_identity',
  /** OT / ICS / SCADA, and the IoT / CCTV / POS estate. */
  'ot_ics',
  /** Privileged, service and remote-user accounts. */
  'identity',
]);
export type InfrastructureSurface = z.infer<typeof InfrastructureSurface>;

/**
 * A plain-language summary of the estate, for the intake screen and the
 * proposal. Derived, never captured — the analyst enters counts, not a label.
 */
export const EstateShape = z.enum([
  /** Work happens in someone else's SaaS; little or no owned infrastructure. */
  'saas_centric',
  /** Owned workloads, but in public cloud rather than a server room. */
  'cloud_native',
  /** Servers, network and endpoints the client operates themselves. */
  'on_prem_centric',
  /** Material weight in both owned infrastructure and cloud/SaaS. */
  'hybrid',
  /** Enough OT / ICS / IoT that it drives the recommendation. */
  'ot_heavy',
  /** No inventory captured. Nothing can be inferred and nothing is pretended. */
  'unknown',
]);
export type EstateShape = z.infer<typeof EstateShape>;

// ---------------------------------------------------------------------------
// Config: data/config/category-weights.yaml
// ---------------------------------------------------------------------------

/**
 * How much attack surface one unit of an asset class represents.
 *
 * Raw counts cannot be compared across classes — an estate with 5,000 M365
 * seats and 4 firewalls is not 99.9% "SaaS". These weights are what make a
 * share-of-estate figure meaningful, and they are the same kind of analyst
 * estimate as the EPS coefficients in sizing-assumptions.yaml.
 */
export const SurfaceUnit = z
  .object({
    surface: InfrastructureSurface,
    /** Attack-surface units per asset. Relative, not absolute — only ratios matter. */
    weight: z.number().nonnegative(),
    /** Mandatory: a weight cannot land without stating where it came from. */
    basis: z.string().min(1),
  })
  .strict();
export type SurfaceUnit = z.infer<typeof SurfaceUnit>;

/**
 * How a product category's value scales with the presence of a surface.
 *
 * 1.0 is neutral. Above 1 means the category is worth more to an estate shaped
 * this way; below 1 means it is worth less. Only deviations from neutral are
 * written down, and each one has to justify itself.
 */
export const SurfaceAffinity = z
  .object({
    surface: InfrastructureSurface,
    multiplier: z.number().nonnegative(),
    basis: z.string().min(1),
  })
  .strict();
export type SurfaceAffinity = z.infer<typeof SurfaceAffinity>;

export const CategoryWeight = z
  .object({
    category: ProductCategory,
    /**
     * Generic risk reduction, 0–100, before the estate is considered. This is
     * the §7.4 step 1 weight.
     */
    baseRiskReduction: z.number().min(0).max(100),
    basis: z.string().min(1),
    /**
     * Surfaces on which this category can do its job at all. If an estate has
     * none of them, the category is not applicable and is dropped with a reason
     * rather than ranked last — recommending NDR to an estate with no network
     * is not a cheaper recommendation, it is a wrong one.
     */
    requiresAnyOf: z.array(InfrastructureSurface).min(1),
    /** Only the surfaces where this category deviates from neutral. */
    affinities: z.array(SurfaceAffinity).default([]),
  })
  .strict()
  .superRefine((weight, ctx) => {
    const seen = new Set<InfrastructureSurface>();
    weight.affinities.forEach((affinity, index) => {
      if (seen.has(affinity.surface)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['affinities', index, 'surface'],
          message: `duplicate affinity for ${affinity.surface}`,
        });
      }
      seen.add(affinity.surface);
    });
  });
export type CategoryWeight = z.infer<typeof CategoryWeight>;

/**
 * Sector-specific adjustment to a category's weight (§7.4 step 1 asks for
 * "adjusted by industry and compliance"). Only deviations from neutral are
 * written down, same as surface affinities.
 */
export const IndustryModifier = z
  .object({
    industry: Industry,
    category: ProductCategory,
    multiplier: z.number().nonnegative(),
    basis: z.string().min(1),
  })
  .strict();
export type IndustryModifier = z.infer<typeof IndustryModifier>;

export const CategoryWeights = z
  .object({
    notes: z.string().min(1).optional(),
    /**
     * Share of total surface units, above which a surface counts as material
     * when naming the estate shape. Tunable because it is a judgement call.
     */
    materialSurfaceShare: z.number().min(0).max(1),
    /** Share of OT/ICS surface at or above which the estate reads as ot_heavy. */
    otHeavyShare: z.number().min(0).max(1),
    /**
     * Share of the workload-bearing estate (owned infrastructure / cloud / SaaS)
     * one locus must reach to name the shape. Below it, the estate is hybrid.
     */
    dominantLocusShare: z.number().min(0).max(1),
    surfaceUnits: z.record(AssetClass, SurfaceUnit),
    categories: z.array(CategoryWeight).min(1),
    industryModifiers: z.array(IndustryModifier).default([]),
  })
  .strict()
  .superRefine((config, ctx) => {
    // Every asset class needs a surface, or an estate silently loses part of
    // itself and every share below is computed against a wrong denominator.
    for (const assetClass of AssetClass.options) {
      if (config.surfaceUnits[assetClass] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['surfaceUnits', assetClass],
          message: `no surface mapping for asset class ${assetClass}`,
        });
      }
    }

    const seen = new Set<string>();
    config.categories.forEach((weight, index) => {
      if (seen.has(weight.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categories', index, 'category'],
          message: `duplicate weight for category ${weight.category}`,
        });
      }
      seen.add(weight.category);
    });

    // A category with no weight would be silently unrankable in portfolio.
    for (const category of ProductCategory.options) {
      if (!seen.has(category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categories'],
          message: `no weight for product category ${category}`,
        });
      }
    }
  });
export type CategoryWeights = z.infer<typeof CategoryWeights>;
