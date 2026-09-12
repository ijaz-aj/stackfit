/*
 * Chart sizing, in a module with no `'use client'` on it.
 *
 * This is not tidiness. `cost-charts.tsx` is a client module, and every export
 * of a client module, a plain function included, becomes a client reference
 * proxy when a server component imports it. The server renders the results page,
 * so calling this there threw "Attempted to call categoryChartHeight() from the
 * server but categoryChartHeight is on the client" and the whole page fell
 * through to the error boundary.
 *
 * Nothing caught it: `tsc` types a client reference as the function it stands
 * for, eslint has no rule for it, and the charts' own tests import from the
 * client module directly, which is legal. It is a boundary violation that only
 * exists at runtime, in the server render. A shared module with no directive is
 * importable from both sides and cannot have the problem.
 */

/**
 * One row per category, plus room for the axis and legend.
 *
 * The cash flow chart beside it is given the same number. The two cards sit in
 * one grid row and stretch to the taller of them, so a chart that sizes itself
 * independently leaves a band of empty panel under the shorter one, which
 * reads as a chart that failed to load rather than one with three data points.
 *
 * The floor matters for a four-product Operable bundle: without it that card
 * would be 168px of axis and legend with four hairlines in the middle.
 */
export function categoryChartHeight(rows: number): number {
  return Math.max(220, rows * 26 + 64);
}
