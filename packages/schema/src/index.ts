// @stackfit/schema — Zod schemas are the single source of truth for every input
// boundary and every catalog record. Types are inferred from Zod, never
// hand-written alongside a schema.
//
// Phase 1 populates this package: ClientProfile, AssetInventory, Product,
// PricingRule, Framework, plus the Money value object (integer minor units +
// ISO currency code). Intentionally empty until then.

export const SCHEMA_PACKAGE_VERSION = '0.0.0';
