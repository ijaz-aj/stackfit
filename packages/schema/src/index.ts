// @stackfit/schema: Zod schemas are the single source of truth for every input
// boundary and every catalog record. Types are inferred from Zod, never
// hand-written alongside a schema.

export const SCHEMA_PACKAGE_VERSION = '0.0.0';

export * from './dates';
export * from './enums';
export * from './money';
export * from './freshness';
export * from './pricing';
export * from './product';
export * from './framework';
export * from './asset-inventory';
export * from './client-profile';
export * from './preset';
export * from './config';
export * from './infrastructure';
export * from './sizing';
export * from './sizing-overrides';
export * from './cost';
export * from './scoring';
export * from './portfolio';
export * from './coverage';
