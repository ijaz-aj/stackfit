// @stackfit/engine — the pure recommendation + costing engine.
//
// Hard constraints (CONTRIBUTING.md): no React, no DB, no fetch, no fs, no Date.now(),
// no randomness. The same input must always produce the same output.
//
// Pipeline, each stage a pure function (built out in Phases 2–4):
//   sizing → cost → scoring → portfolio → coverage
//
// Nothing real lives here yet. This constant exists only so Phase 0 has a unit
// under test and a green `pnpm test`.

export const ENGINE_VERSION = '0.0.0';
