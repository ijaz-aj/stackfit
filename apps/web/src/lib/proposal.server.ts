import {
  buildProposal,
  justifyBundle,
  type PipelineResult,
  type ProposalCell,
  type ProposalDocument,
} from '@stackfit/engine';
import type { ClientProfile } from '@stackfit/schema';

import { engineData, today } from './config.server';
import { formatMoney, formatNumber } from './format';

/**
 * One place that turns engine output into the §8 proposal document, for every
 * renderer.
 *
 * Server-only: it reads the clock, which the engine may not. Same reasoning as
 * `resultsFor` — the alternative is each export assembling its own arguments
 * and the three of them drifting apart, which is the mistake this repo has now
 * corrected at four different layers.
 */
export function proposalFor(profile: ClientProfile, result: PipelineResult): ProposalDocument {
  return buildProposal({
    profile,
    sizing: result.sizing,
    products: result.products,
    recommended: result.recommended,
    essential: result.essential,
    ideal: result.ideal,
    coverage: result.coverage,
    justifications: justifyBundle(result.recommended, {
      scores: result.scores,
      candidates: result.candidates,
      productNames: new Map(
        result.products.map((product) => [
          product.id,
          { name: product.name, vendor: product.vendor },
        ]),
      ),
    }),
    assumptions: engineData().portfolioAssumptions,
    asOf: today(),
  });
}

/**
 * A proposal cell as a string. THE render boundary for the exports (hard rule
 * 1): money arrives here as integer minor units and leaves as text, and this is
 * the only place in the export path allowed to do that.
 *
 * Shared by every renderer on purpose. Three renderers formatting the same cell
 * their own way is three documents that disagree about the same number.
 */
export function renderCell(cell: ProposalCell): string {
  switch (cell.kind) {
    case 'text':
      return cell.value;
    case 'money':
      return formatMoney(cell.value);
    case 'number':
      return formatNumber(cell.value, cell.decimals);
    case 'percent':
      return cell.value === null ? '—' : `${formatNumber(cell.value, 1)}%`;
  }
}

/** A filename an analyst can find again, without a clock in the middle of it. */
export function proposalFilename(document: ProposalDocument, extension: string): string {
  const slug = document.preparedFor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'proposal'}-security-proposal-${document.asOf}.${extension}`;
}
