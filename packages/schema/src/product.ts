// Catalog record (PROJECT_SPEC §5.3). One YAML file per category under
// data/catalog/, each holding a list of these.

import { z } from 'zod';

import {
  CloudPlatform,
  DeploymentMode,
  DeviceClass,
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
 */
export const OpsBurden = z
  .object({
    /** FTE needed to run this at all, before any scaling. */
    baseFte: z.number().nonnegative().max(20),
    /** Additional FTE per 1,000 monitored assets. */
    ftePerThousandAssets: z.number().nonnegative().max(10),
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
