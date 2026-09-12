// Fit scoring config (PROJECT_SPEC §7.3).
//
// The weights are tunable because they encode a point of view, not a fact: how
// much worse is a tool nobody can run than a tool that covers 10% less of the
// estate? That is an argument to have with an analyst, in a config file, not a
// constant buried in a scoring function (hard rule 6).

import { z } from 'zod';

import { AssetClass } from './asset-inventory';
import { EstateShape } from './infrastructure';
import { DeploymentMode, DeviceClass, ProcurementBias, ProductCategory } from './enums';

export const ScoringDimension = z.enum([
  /** Share of the assets this category is meant to cover that this product does. */
  'asset_coverage',
  /** Controls covered ÷ controls the client's frameworks demand of this category. */
  'compliance_fit',
  /** Penalises a tool that needs more people than the client has. */
  'ops_fit',
  /** How well the product's deployment modes match the client's preference. */
  'deployment_fit',
  /** Overlap with tools the client is keeping. */
  'integration_fit',
  /** How centred the client is in the product's supported scale band. */
  'scale_fit',
  'maturity',
]);
export type ScoringDimension = z.infer<typeof ScoringDimension>;

export const DimensionWeight = z
  .object({
    dimension: ScoringDimension,
    weight: z.number().min(0).max(100),
    basis: z.string().min(1),
  })
  .strict();
export type DimensionWeight = z.infer<typeof DimensionWeight>;

export const BiasDelta = z
  .object({
    dimension: ScoringDimension,
    /** Added to the dimension's weight before renormalising back to 100. */
    delta: z.number(),
    basis: z.string().min(1),
  })
  .strict();
export type BiasDelta = z.infer<typeof BiasDelta>;

export const BiasAdjustment = z
  .object({
    bias: ProcurementBias,
    deltas: z.array(BiasDelta).default([]),
  })
  .strict();
export type BiasAdjustment = z.infer<typeof BiasAdjustment>;

/**
 * What a category is *supposed* to cover.
 *
 * Asset coverage has to be measured against a category's remit, not against the
 * whole estate. An email gateway covers mailboxes and nothing else; scored
 * against every asset the client owns it would look permanently terrible, and
 * §7.4 step 2 compares fit scores across categories when it ranks value
 * density. Measured against its remit, a gateway that covers every mailbox
 * scores 100, which is the honest answer.
 */
export const CategoryRemit = z
  .object({
    category: ProductCategory,
    deviceClasses: z.array(DeviceClass).min(1),
    basis: z.string().min(1),
  })
  .strict();
export type CategoryRemit = z.infer<typeof CategoryRemit>;

export const OpsFitPolicy = z
  .object({
    /**
     * Share of the client's security FTE one product may consume before its
     * ops-fit score starts falling.
     */
    comfortableShareOfFte: z.number().min(0).max(1),
    /**
     * Share at which ops fit reaches zero. Beyond this the tool is not
     * operable by this team, whatever else it does well.
     */
    unusableShareOfFte: z.number().min(0),
    /**
     * Score given when the client has no security staff at all. Zero FTE is a
     * valid and very common answer (§5.1), and every self-run tool is then a
     * bad operational fit — but it must not divide by zero.
     */
    scoreWithNoSecurityStaff: z.number().min(0).max(100),
    basis: z.string().min(1),
  })
  .strict();
export type OpsFitPolicy = z.infer<typeof OpsFitPolicy>;

/** Deployment modes that suit an estate of a given shape. */
export const EstateDeploymentAffinity = z
  .object({
    shape: EstateShape,
    /** Empty means "nothing can be inferred from this shape" — scored neutral. */
    prefers: z.array(DeploymentMode).default([]),
    basis: z.string().min(1),
  })
  .strict();
export type EstateDeploymentAffinity = z.infer<typeof EstateDeploymentAffinity>;

/**
 * How deployment fit is scored (§7.3).
 *
 * Two different questions wear one field. When the analyst states a preference
 * — `on_prem`, `cloud`, `air_gapped` — a product that does not offer it is
 * genuinely not what the client asked for. When they state `hybrid`, which is
 * how this tool spells "no strong preference", there is nothing to miss: the
 * question becomes what the estate they actually run implies, and a weaker
 * signal deserves a gentler penalty than a stated one.
 *
 * Before this existed, "no preference" scored every cloud-only and every
 * on-prem-only product 30 out of 100, as though the client had demanded hybrid.
 */
export const DeploymentFitPolicy = z
  .object({
    /** The product offers exactly what the analyst asked for. */
    statedMatch: z.number().min(0).max(100),
    /** No native mode, but hybrid can usually be shaped to fit. */
    statedHybridFallback: z.number().min(0).max(100),
    /** Workable, but not what they asked for. */
    statedMismatch: z.number().min(0).max(100),
    /** The product suits the estate the client actually runs. */
    inferredMatch: z.number().min(0).max(100),
    inferredHybridFallback: z.number().min(0).max(100),
    /** Softer than `statedMismatch`: an inferred preference is a weaker signal. */
    inferredMismatch: z.number().min(0).max(100),
    /**
     * No preference stated and nothing inferable from the estate. Every product
     * scores the same: silence is not evidence, and this repo does not penalise
     * on silence anywhere else either.
     */
    noSignal: z.number().min(0).max(100),
    byEstateShape: z.array(EstateDeploymentAffinity).min(1),
    basis: z.string().min(1),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const seen = new Set(policy.byEstateShape.map((entry) => entry.shape));
    for (const shape of EstateShape.options) {
      if (!seen.has(shape)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['byEstateShape'],
          message: `no deployment affinity declared for estate shape ${shape}`,
        });
      }
    }
  });
export type DeploymentFitPolicy = z.infer<typeof DeploymentFitPolicy>;

export const ScoringWeights = z
  .object({
    notes: z.string().min(1).optional(),
    dimensions: z.array(DimensionWeight).min(1),
    biasAdjustments: z.array(BiasAdjustment).default([]),
    opsFit: OpsFitPolicy,
    deploymentFit: DeploymentFitPolicy,
    /** Score by maturity band, 0–100. */
    maturityScores: z.object({
      emerging: z.number().min(0).max(100),
      established: z.number().min(0).max(100),
      legacy: z.number().min(0).max(100),
    }),
    /** Which asset classes belong to which device class. A definition, not an estimate. */
    assetClassDeviceClass: z.record(AssetClass, DeviceClass),
    categoryRemits: z.array(CategoryRemit).min(1),
  })
  .strict()
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    config.dimensions.forEach((dimension, index) => {
      if (seen.has(dimension.dimension)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dimensions', index, 'dimension'],
          message: `duplicate weight for ${dimension.dimension}`,
        });
      }
      seen.add(dimension.dimension);
    });
    for (const dimension of ScoringDimension.options) {
      if (!seen.has(dimension)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dimensions'],
          message: `no weight for scoring dimension ${dimension}`,
        });
      }
    }

    // A score presented as "out of 100" has to actually be out of 100.
    const total = config.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (Math.abs(total - 100) > 1e-9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dimensions'],
        message: `dimension weights sum to ${total}, not 100`,
      });
    }

    for (const assetClass of AssetClass.options) {
      if (config.assetClassDeviceClass[assetClass] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['assetClassDeviceClass', assetClass],
          message: `no device class mapped for asset class ${assetClass}`,
        });
      }
    }

    const seenRemits = new Set<string>();
    config.categoryRemits.forEach((remit, index) => {
      if (seenRemits.has(remit.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categoryRemits', index, 'category'],
          message: `duplicate remit for ${remit.category}`,
        });
      }
      seenRemits.add(remit.category);
    });
    for (const category of ProductCategory.options) {
      if (!seenRemits.has(category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categoryRemits'],
          message: `no remit for product category ${category}`,
        });
      }
    }

    const seenBias = new Set<string>();
    config.biasAdjustments.forEach((adjustment, index) => {
      if (seenBias.has(adjustment.bias)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['biasAdjustments', index, 'bias'],
          message: `duplicate adjustment for ${adjustment.bias}`,
        });
      }
      seenBias.add(adjustment.bias);
    });

    if (config.opsFit.unusableShareOfFte <= config.opsFit.comfortableShareOfFte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opsFit', 'unusableShareOfFte'],
        message: 'unusableShareOfFte must be above comfortableShareOfFte',
      });
    }
  });
export type ScoringWeights = z.infer<typeof ScoringWeights>;
