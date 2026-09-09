// @stackfit/engine — the pure recommendation + costing engine.
//
// Hard constraints (CONTRIBUTING.md): no React, no DB, no fetch, no fs, no Date.now(),
// no randomness. The same input must always produce the same output.
//
// Pipeline, each stage a pure function:
//   sizing → cost → scoring → portfolio → coverage
//
// Stages are added phase by phase; `cost` onward are still to come.

export const ENGINE_VERSION = '0.0.0';

export * from './sizing.js';
export * from './money.js';
export * from './freshness.js';
export * from './cost.js';
export * from './infrastructure.js';
