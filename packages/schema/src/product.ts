// Catalog record (PROJECT_SPEC §5.3). One YAML file per category under
// data/catalog/, each holding a list of these.

import { z } from 'zod';

import {
  CloudPlatform,
  DeploymentMode,
  DeviceClass,
  EstimateConfidence,
  FrameworkId,
  LicenceModel,
  Maturity,
  OsFamily,
  ProductCategory,
  ScaleClass,
  SkillLevel,
} from './enums';
import { PricingRule, Source } from './pricing';

/** Lowercase kebab-case. Used for product ids, tier slugs and integration keys. */
export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a lowercase kebab-case slug');
export type Slug = z.infer<typeof Slug>;

const FRAMEWORK_ID_ALTERNATION = FrameworkId.options
  .map((id) => id.replace(/[.]/g, '\\.'))
  .join('|');

/**
 * A control id namespaced by its framework, e.g. `nist-csf-2.0:DE.CM` or
 * `pci-dss-4.0:10`. `pnpm catalog:validate` additionally checks that the
 * control actually exists in data/frameworks — hard rule 2 covers invented
 * compliance mappings, not just invented prices.
 */
export const ControlId = z
  .string()
  .regex(
    new RegExp(`^(?:${FRAMEWORK_ID_ALTERNATION}):[A-Za-z0-9][A-Za-z0-9.\\-]*$`),
    'expected a control id of the form <framework-id>:<control>, e.g. nist-csf-2.0:DE.CM',
  );
export type ControlId = z.infer<typeof ControlId>;

/**
 * What a tier's cap counts. Every member maps to a figure the sizing stage
 * already produces, because a cap the engine cannot measure is a cap it cannot
 * enforce — and an unenforceable cap belongs in `allowances`, not here.
 */
export const TierCapUnit = z.enum([
  'users',
  'mailboxes',
  'endpoints',
  'servers',
  'monitored_assets',
  'privileged_accounts',
]);
export type TierCapUnit = z.infer<typeof TierCapUnit>;

/** A hard ceiling the vendor places on a tier. Enforced: over it, the tier is out. */
export const TierCap = z
  .object({
    unit: TierCapUnit,
    maxUnits: z.number().int().positive(),
    /** What the vendor actually says, in their words. A cap with no wording is a rumour. */
    note: z.string().min(1),
  })
  .strict();
export type TierCap = z.infer<typeof TierCap>;

/**
 * Something the client must already hold for this tier to exist at its stated
 * price — the shape of Microsoft's free Entra ID tier, which is only free
 * inside a subscription they are already paying for.
 *
 * Unmet by default and deliberately so. A prerequisite nobody has confirmed is
 * a prerequisite that is probably not met, and the failure mode of assuming
 * otherwise is a zero-cost tier beating every priced option on a client who
 * cannot actually take it.
 */
export const TierPrerequisite = z
  .object({
    /** Shown to the analyst, e.g. "an Azure or Microsoft 365 subscription". */
    description: z.string().min(1),
    /**
     * Any one of these appearing in `ClientProfile.retainedTools` satisfies it.
     * Not restricted to catalog product ids: a prerequisite is often a
     * subscription this catalog does not sell, and the analyst ticks what the
     * client holds.
     */
    satisfiedByRetainedTool: z.array(Slug).min(1),
  })
  .strict();
export type TierPrerequisite = z.infer<typeof TierPrerequisite>;

/**
 * The conditions attached to a tier beyond its price.
 *
 * Phase 7 hit seven of these in one pass — user caps, mailbox caps, asset
 * caps, workflow caps, metered executions, prerequisite subscriptions — and
 * had nowhere to put any of them. Four were approximated by pinning
 * `scaleCeiling` to `small`, which is wrong in both directions, and two tiers
 * were left out of the catalog entirely because a zero-cost tier with an
 * unmodelled condition beats every priced option by construction.
 *
 * Three kinds, because the three behave differently:
 *
 *   caps          — measurable against the sizing stage, so enforced. Over the
 *                   cap the tier is eliminated with a stated reason.
 *   prerequisites — measurable against `retainedTools`, so enforced the same
 *                   way, and unmet unless the analyst says otherwise.
 *   allowances    — genuinely unmeasurable here (live workflows, monthly
 *                   executions). Never enforced; carried into the tier's
 *                   scoring rationale so an analyst sees it instead of it
 *                   living only in prose nobody reads.
 */
export const TierLimits = z
  .object({
    caps: z.array(TierCap).default([]),
    prerequisites: z.array(TierPrerequisite).default([]),
    allowances: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .superRefine((limits, ctx) => {
    if (
      limits.caps.length === 0 &&
      limits.prerequisites.length === 0 &&
      limits.allowances.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'an empty limits block says nothing — omit the field entirely rather than declaring no limits',
      });
    }

    const seen = new Set<string>();
    limits.caps.forEach((cap, index) => {
      if (seen.has(cap.unit)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['caps', index, 'unit'],
          message: `two caps on "${cap.unit}" — the tighter one is the only one that can bite`,
        });
      }
      seen.add(cap.unit);
    });
  });
export type TierLimits = z.infer<typeof TierLimits>;

export const ProductTier = z
  .object({
    id: Slug,
    name: z.string().min(1),
    capabilities: z.array(z.string().min(1)).default([]),
    /**
     * Usually one rule. More than one covers products billed on two axes at
     * once (a platform fee plus a per-endpoint rate, say).
     */
    pricing: z.array(PricingRule).min(1),
    /**
     * Controls this tier claims *on top of* the product-level list.
     *
     * Capabilities are sold by tier and control claims were not, so a product
     * whose cheapest tier was selected could be credited with a control only
     * its top tier delivers — Defender Plan 1 was being credited with CIS 7
     * continuous vulnerability management while the same entry's own tier list
     * put that in Plan 2.
     *
     * Additive, never subtractive: the product-level list is what every tier
     * does, so a stage that has not picked a tier yet under-credits rather than
     * over-credits, and the client-facing coverage figure uses the tier
     * actually selected.
     */
    controlsCovered: z.array(ControlId).default([]),
    /**
     * Caps, prerequisites and allowances attached to this tier. Optional
     * because most tiers have none; a tier that does have one and does not
     * declare it is the bug this field exists to stop.
     */
    limits: TierLimits.optional(),
  })
  .strict();
export type ProductTier = z.infer<typeof ProductTier>;

export const ProductSupport = z
  .object({
    os: z.array(OsFamily).default([]),
    deviceClasses: z.array(DeviceClass).min(1),
    cloudPlatforms: z.array(CloudPlatform).default([]),
    deploymentModes: z.array(DeploymentMode).min(1),
    /**
     * Scale band this product is sensible in. Scoring hard-filters anything
     * whose environment falls outside it (§7.3) — an enterprise SIEM aimed at a
     * 20-person shop is as wrong an answer as an under-powered one.
     */
    scaleFloor: ScaleClass,
    scaleCeiling: ScaleClass,
    airGapCapable: z.boolean(),
  })
  .strict()
  .superRefine((support, ctx) => {
    const order = ScaleClass.options;
    if (order.indexOf(support.scaleCeiling) < order.indexOf(support.scaleFloor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scaleCeiling'],
        message: `scaleCeiling (${support.scaleCeiling}) is below scaleFloor (${support.scaleFloor})`,
      });
    }
    if (support.airGapCapable && !support.deploymentModes.includes('air_gapped')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['airGapCapable'],
        message: 'airGapCapable is true but deploymentModes does not include air_gapped',
      });
    }
  });
export type ProductSupport = z.infer<typeof ProductSupport>;

/**
 * Operational cost in people. Mandatory: a TCO that omits it is a bug, not a
 * simplification (CONTRIBUTING.md hard rule 8). This is the field that stops "Wazuh
 * is free" from being the answer to every question.
 *
 * ⚠ **This is the effort to administer the tool, not to staff a SOC with it.**
 * Deployment, tuning, rule and content maintenance, upgrades, integrations,
 * troubleshooting. It deliberately excludes continuous monitoring: published
 * benchmarks put in-house 24/7 SIEM operation at several analysts across
 * shifts, which is a different and much larger quantity driven by the hours a
 * client wants covered rather than by the product they bought.
 *
 * The distinction matters because the two are easily conflated and the answers
 * differ by an order of magnitude. A client who reads a 0.6 FTE SIEM figure as
 * "what it takes to get value from a SIEM" has been misled; a client who reads
 * it as "what it takes to keep the SIEM running" has not. Every surface that
 * shows an FTE figure says which one it is.
 */
export const OpsBurden = z
  .object({
    /** FTE needed to run this at all, before any scaling. */
    baseFte: z.number().nonnegative().max(20),
    /** Additional FTE per 1,000 monitored assets. */
    ftePerThousandAssets: z.number().nonnegative().max(10),
    /**
     * How well grounded these two numbers are. Mandatory for the same reason
     * `pricingConfidence` is: this figure decides whether a free tool is cheap
     * or expensive, and a guess and a measurement must not look alike.
     */
    confidence: EstimateConfidence,
  })
  .strict();
export type OpsBurden = z.infer<typeof OpsBurden>;

export const Implementation = z
  .object({
    /** Professional-services days to stand it up. */
    effortDays: z.number().nonnegative().max(500),
    skillLevel: SkillLevel,
    /** Elapsed calendar weeks, which is not effortDays/5 — it includes waiting. */
    typicalWeeks: z.number().nonnegative().max(104),
    /**
     * Graded separately from `opsBurden.confidence`: a vendor that publishes a
     * professional-services day count often says nothing about who runs the
     * thing afterwards, and the two claims fail independently.
     */
    confidence: EstimateConfidence,
  })
  .strict();
export type Implementation = z.infer<typeof Implementation>;

export const Product = z
  .object({
    id: Slug,
    name: z.string().min(1),
    vendor: z.string().min(1),
    category: ProductCategory,
    subcategory: z.string().min(1).optional(),
    licenceModel: LicenceModel,
    tiers: z.array(ProductTier).min(1),
    supports: ProductSupport,
    /** Other product ids or protocols: `syslog`, `otel`, `cef`, `wazuh`, ... */
    integrations: z.array(Slug).default([]),
    controlsCovered: z.array(ControlId).default([]),
    opsBurden: OpsBurden,
    implementation: Implementation,
    maturity: Maturity,
    strengths: z.array(z.string().min(1)).default([]),
    weaknesses: z.array(z.string().min(1)).default([]),
    bestFor: z.array(z.string().min(1)).default([]),
    avoidWhen: z.array(z.string().min(1)).default([]),
    /**
     * Sources for the *capability* claims above (supported platforms, control
     * coverage, licence model). Price sources live on each PricingRule.
     */
    sources: z.array(Source).min(1),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((product, ctx) => {
    const seenTierIds = new Set<string>();
    product.tiers.forEach((tier, index) => {
      if (seenTierIds.has(tier.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tiers', index, 'id'],
          message: `duplicate tier id "${tier.id}" within product "${product.id}"`,
        });
      }
      seenTierIds.add(tier.id);
    });

    // An open-source product whose every tier is zero_licence but which claims
    // no operational cost is exactly the dishonesty hard rule 8 exists to stop.
    const everyTierIsFree = product.tiers.every((tier) =>
      tier.pricing.every((rule) => rule.model === 'zero_licence'),
    );
    if (
      everyTierIsFree &&
      product.opsBurden.baseFte === 0 &&
      product.opsBurden.ftePerThousandAssets === 0 &&
      product.implementation.effortDays === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opsBurden'],
        message:
          'a zero-licence product with zero opsBurden and zero implementation effort is not free, it is unpriced',
      });
    }

    // Same convention as a placeholder price: an ungrounded effort figure has
    // to be findable by grepping for TODO, or it is indistinguishable from a
    // researched one at a glance.
    const notes = product.notes ?? '';
    for (const field of ['opsBurden', 'implementation'] as const) {
      if (product[field].confidence === 'placeholder' && !notes.includes('TODO')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field, 'confidence'],
          message: `${field}.confidence is placeholder, so notes must carry a TODO saying what is still unknown`,
        });
      }
    }
  });
export type Product = z.infer<typeof Product>;

/** The shape of one `data/catalog/*.yaml` file. */
export const CatalogFile = z
  .object({
    category: ProductCategory,
    products: z.array(Product).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    file.products.forEach((product, index) => {
      if (product.category !== file.category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['products', index, 'category'],
          message: `product "${product.id}" is category "${product.category}" but lives in the "${file.category}" catalog file`,
        });
      }
    });
  });
export type CatalogFile = z.infer<typeof CatalogFile>;
