// @stackfit/engine — the pure recommendation + costing engine.
//
// Hard constraints (CONTRIBUTING.md): no React, no DB, no fetch, no fs, no Date.now(),
// no randomness. The same input must always produce the same output.
//
// Pipeline, each stage a pure function:
//   sizing → cost → scoring → portfolio → coverage

export const ENGINE_VERSION = '0.0.0';

export * from './sizing';
export * from './money';
export * from './freshness';
export * from './claims';
export * from './cost';
export * from './infrastructure';
export * from './scoring';
export * from './portfolio';
export * from './coverage';
export * from './proposal';
export * from './pipeline';
