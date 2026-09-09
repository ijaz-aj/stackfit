// @stackfit/schema — Zod schemas are the single source of truth for every input
// boundary and every catalog record. Types are inferred from Zod, never
// hand-written alongside a schema.

export const SCHEMA_PACKAGE_VERSION = '0.0.0';

export * from './enums.js';
export * from './money.js';
export * from './pricing.js';
export * from './product.js';
export * from './framework.js';
export * from './asset-inventory.js';
export * from './client-profile.js';
export * from './config.js';
export * from './sizing.js';
