// The §8 proposal: a document model three renderers share.
//
// The tests that matter here are the ones about honesty — the mandated
// disclaimer, the shortfall that must not be absorbed, the estimated prices
// that must be named — and the roadmap, which is the only genuinely new
// recommendation in this stage.

import type { AssetInventory, ClientProfile, ProductCategory } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import {
  buildProposal,
  buildRoadmap,
  justifyBundle,
  proposalDisclaimer,
  runPipeline,
  type ProposalBlock,
  type ProposalInputs,
  type ProposalSection,
} from '../src/index';
import {
  buildCategoryWeights,
  buildClientProfile,
  buildCostInputs,
  buildCoverageAssumptions,
  buildMsspRateCard,
  buildPortfolioAssumptions,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });
const AS_OF = '2026-09-12';

function inventory(counts: Record<string, number>): AssetInventory {
  return {
    ...Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
    networkVendors: [],
  } as AssetInventory;
}

/** A priced, self-hostable product in a category, with a stated deployment time. */
function product(id: string, category: ProductCategory, annualMinor: number, typicalWeeks: number) {
  const base = buildProduct({
    id,
    pricing: [
      { model: 'flat_tiered', tiers: [{ minUnits: 0, maxUnits: null, flatPrice: usd(annualMinor) }] },
    ],
    implementation: { effortDays: 5, skillLevel: 'generalist', typicalWeeks, confidence: 'analyst_estimate' },
  });
  return {
    ...base,
    category,
    vendor: `${id} Inc.`,
    supports: { ...base.supports, deviceClasses: ['server' as const, 'workstation' as const] },
  };
}

function proposalInputs(
  overrides: { profile?: Partial<ClientProfile>; products?: ReturnType<typeof product>[] } = {},
): ProposalInputs {
  const profile = buildClientProfile({
    orgName: 'Acme Health',
    employeeCount: 300,
    securityStaffFte: 1,
    budget: { annualCap: usd(50_000_00), oneTimeCap: null, currency: 'USD', horizonYears: 3 },
    ...overrides.profile,
  });
  const inv = inventory({ windowsServers: 40, windowsEndpoints: 200 });
  const products = overrides.products ?? [
    product('quick-edr', 'edr', 1_000_00, 2),
    product('slow-siem', 'siem', 2_000_00, 20),
    product('mid-iam', 'iam', 500_00, 8),
  ];

  const result = runPipeline({
    profile,
    inventory: inv,
    products,
    frameworks: new Map(),
    sizingAssumptions: buildSizingAssumptions(),
    categoryWeights: buildCategoryWeights(),
    scoringWeights: buildScoringWeights(),
    portfolioAssumptions: buildPortfolioAssumptions(),
    coverageAssumptions: buildCoverageAssumptions(),
    mssp: buildMsspRateCard(),
    costInputs: buildCostInputs(),
  });

  return {
    profile,
    sizing: result.sizing,
    products,
    recommended: result.recommended,
    justifications: justifyBundle(result.recommended, {
      scores: result.scores,
      candidates: result.candidates,
      productNames: new Map(
        products.map((entry) => [entry.id, { name: entry.name, vendor: entry.vendor }]),
      ),
    }),
    essential: result.essential,
    ideal: result.ideal,
    coverage: result.coverage,
    assumptions: buildPortfolioAssumptions(),
    asOf: AS_OF,
  };
}

const blocksOf = (section: ProposalSection | undefined): readonly ProposalBlock[] =>
  section?.blocks ?? [];

const allText = (document: ReturnType<typeof buildProposal>): string =>
  document.sections
    .flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => {
        if (block.kind === 'paragraph' || block.kind === 'callout') return [block.text];
        if (block.kind === 'bullets') return [...block.items];
        return block.rows.flatMap((row) =>
          row.map((cell) => (cell.kind === 'text' ? cell.value : '')),
        );
      }),
    ])
    .join('\n');

describe('the mandated disclaimer', () => {
  it('is the §6 rule 4 wording, verbatim, with the date it was priced', () => {
    // Not paraphrasable. This is the sentence that stops a budgetary estimate
    // being read as a quote, and the spec gives it word for word.
    expect(proposalDisclaimer(AS_OF)).toBe(
      'Indicative budgetary estimates based on published list pricing as of 2026-09-12. ' +
        'Not a quote. Actual pricing subject to vendor negotiation, channel discount, and bundling.',
    );
  });

  it('appears in every proposal, as a warning rather than a footnote', () => {
    const document = buildProposal(proposalInputs());
    expect(document.disclaimer).toBe(proposalDisclaimer(AS_OF));

    const assumptions = document.sections.find(
      (section) => section.heading === 'Assumptions and disclaimers',
    );
    const callouts = blocksOf(assumptions).filter((block) => block.kind === 'callout');
    expect(callouts.some((block) => block.kind === 'callout' && block.text === document.disclaimer)).toBe(true);
  });

  it('names the date the figures were read, not the date the file was made', () => {
    // The engine has no clock, so this can only come from the caller — which is
    // also what makes the same scenario export identically twice.
    const document = buildProposal({ ...proposalInputs(), asOf: '2025-01-01' });
    expect(document.disclaimer).toContain('as of 2025-01-01');
  });
});

describe('the document model', () => {
  it('carries every section §8 asks for, plus the one it does not', () => {
    // "Why these products" is an addition, not one of §8's own. §8.2 asks the
    // dashboard for a runner-up; a client reading the exported document has the
    // same question and nobody in the room to answer it, so every rejected SKU
    // and the reason it lost are stated here too.
    const headings = buildProposal(proposalInputs()).sections.map((section) => section.heading);
    expect(headings).toEqual([
      'Executive summary',
      'Current state',
      'Recommended stack',
      'Why these products',
      'Costs',
      'Compliance coverage',
      'Roadmap',
      'Assumptions and disclaimers',
    ]);
  });

  it('lists contenders only, and still says how many were ruled out', () => {
    // A product eliminated before scoring gets a row on the dashboard but not
    // in the client document: eighteen rows of "not applicable" trebled the
    // length of this section to say nothing a reader can act on. The count
    // stays in the prose, so nothing is concealed by the trim.
    const document = buildProposal(
      proposalInputs({
        products: [
          product('quick-edr', 'edr', 1_000_00, 2),
          product('slow-siem', 'siem', 2_000_00, 20),
          product('dearer-siem', 'siem', 9_000_00, 20),
          product('mid-iam', 'iam', 500_00, 8),
        ],
        profile: { excludedProducts: ['dearer-siem'] },
      }),
    );
    const section = document.sections.find((entry) => entry.heading === 'Why these products');
    const rows = (section?.blocks ?? []).flatMap((block) =>
      block.kind === 'table' ? block.rows : [],
    );

    const named = rows
      .map((row) => (row[0]?.kind === 'text' ? row[0].value : ''))
      .join(' | ');
    expect(named).not.toContain('dearer-siem');

    // The prose still accounts for it.
    const prose = (section?.blocks ?? [])
      .map((block) => (block.kind === 'paragraph' ? block.text : ''))
      .join(' ');
    expect(prose).toContain('ruled out before scoring');

    // And no surviving row is one that was never costed.
    for (const row of rows) {
      expect(row[2]?.kind === 'text' ? row[2].value : '').not.toBe('not costed');
    }
  });

  it('names what else was considered, and why each one lost', () => {
    // The default fixture has one product per category, so there is genuinely
    // nothing to compare. Give the SIEM category a rival and the section fills.
    const document = buildProposal(
      proposalInputs({
        products: [
          product('quick-edr', 'edr', 1_000_00, 2),
          product('slow-siem', 'siem', 2_000_00, 20),
          product('dearer-siem', 'siem', 9_000_00, 20),
          product('mid-iam', 'iam', 500_00, 8),
        ],
      }),
    );
    const section = document.sections.find((entry) => entry.heading === 'Why these products');
    const tables = section?.blocks.filter((block) => block.kind === 'table') ?? [];

    expect(section).toBeDefined();
    expect(tables.length).toBeGreaterThan(0);
    // Every row carries a verdict, never a bare score the reader has to interpret.
    for (const table of tables) {
      if (table.kind !== 'table') continue;
      for (const row of table.rows) {
        const verdict = row[row.length - 1];
        expect(verdict?.kind).toBe('text');
        expect(verdict?.kind === 'text' ? verdict.value.length : 0).toBeGreaterThan(10);
      }
    }
  });

  it('keeps money as money, so no renderer inherits a rounded string', () => {
    // Hard rule 1: formatting is the render boundary, and there are three
    // renderers. A number formatted here would be formatted once and read three
    // times, which is how three exports come to disagree.
    const document = buildProposal(proposalInputs());
    const cells = document.sections
      .flatMap((section) => section.blocks)
      .flatMap((block) => (block.kind === 'table' ? [...block.rows.flat(), ...(block.total ?? [])] : []));

    const moneyCells = cells.filter((cell) => cell.kind === 'money');
    expect(moneyCells.length).toBeGreaterThan(0);
    for (const cell of moneyCells) {
      expect(cell.kind === 'money' && Number.isInteger(cell.value.amountMinor)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const inputs = proposalInputs();
    expect(JSON.stringify(buildProposal(inputs))).toBe(JSON.stringify(buildProposal(inputs)));
  });

  it('names every product priced on an estimate rather than a published rate', () => {
    // §6 rule 3 in the export: a client must never be handed a budget figure
    // that looks published when it is not.
    const document = buildProposal(proposalInputs());
    const estimated = document.sections
      .find((section) => section.heading === 'Assumptions and disclaimers')
      ?.blocks.filter((block) => block.kind === 'callout');

    // The fixture prices everything at public_list, so there is nothing to warn
    // about — and the absence must be an absence, not a silent omission.
    expect(estimated?.length).toBe(1);
  });
});

describe('the roadmap', () => {
  it('sequences compliance obligations before discretionary risk reduction', () => {
    const inputs = proposalInputs();
    const withMandate: ProposalInputs = {
      ...inputs,
      recommended: {
        ...inputs.recommended,
        selections: inputs.recommended.selections.map((selection) => ({
          ...selection,
          // Make the lowest-weight category the mandated one, so weight order
          // alone would not put it first.
          mandatory: selection.category === 'iam',
          categoryWeight: selection.category === 'iam' ? 1 : 100,
        })),
      },
    };

    const roadmap = buildRoadmap(withMandate);
    expect(roadmap[0]?.category).toBe('iam');
    expect(roadmap[0]?.mandatory).toBe(true);
  });

  it('puts everything somewhere, however long the programme runs', () => {
    // The final phase is open-ended and the schema enforces it, because a
    // product with nowhere to go would silently vanish from the plan.
    const slow = [
      product('a', 'edr', 100_00, 40),
      product('b', 'siem', 100_00, 40),
      product('c', 'iam', 100_00, 40),
    ];
    const inputs = proposalInputs({ products: slow });
    const roadmap = buildRoadmap(inputs);

    expect(roadmap).toHaveLength(inputs.recommended.selections.length);
    expect(roadmap.every((entry) => entry.phaseLabel !== 'Unscheduled')).toBe(true);
  });

  it('never lets one slow deployment skip a phase entirely', () => {
    // A product longer than a whole phase still has to start somewhere. If an
    // empty phase could be overrun, the first phase of the plan would be blank
    // whenever the first deployment was a big one.
    const inputs = proposalInputs({
      products: [product('very-slow', 'siem', 100_00, 100), product('quick', 'edr', 100_00, 1)],
    });
    const roadmap = buildRoadmap(inputs);
    const phases = inputs.assumptions.roadmap.phases;

    expect(roadmap[0]?.phaseLabel).toBe(phases[0]?.label);
  });

  it('spreads work across phases rather than piling it into the first', () => {
    const inputs = proposalInputs({
      products: [
        product('a', 'edr', 100_00, 20),
        product('b', 'siem', 100_00, 20),
        product('c', 'iam', 100_00, 20),
      ],
    });
    const roadmap = buildRoadmap(inputs);
    const distinctPhases = new Set(roadmap.map((entry) => entry.phaseLabel));
    expect(distinctPhases.size).toBeGreaterThan(1);
  });
});

describe('what a proposal must not hide', () => {
  it('reports an unfunded compliance obligation instead of quietly recommending less', () => {
    const inputs = proposalInputs();
    const starved: ProposalInputs = {
      ...inputs,
      recommended: {
        ...inputs.recommended,
        unfundedMandatory: ['pam'] as readonly ProductCategory[],
      },
    };

    const summary = buildProposal(starved).sections.find(
      (section) => section.heading === 'Executive summary',
    );
    const warnings = blocksOf(summary).filter(
      (block) => block.kind === 'callout' && block.tone === 'warning',
    );

    expect(warnings).toHaveLength(1);
    expect(allText(buildProposal(starved))).toContain('Privileged access');
  });

  it('says when the recommended stack is over budget', () => {
    const inputs = proposalInputs();
    const over: ProposalInputs = {
      ...inputs,
      recommended: { ...inputs.recommended, withinAnnualCap: false },
    };
    expect(allText(buildProposal(over))).toContain('exceeds the stated annual budget');
  });

  it('flags an estimated privileged-account count, because it sizes PAM licensing', () => {
    const inputs = proposalInputs();
    const estimated: ProposalInputs = {
      ...inputs,
      sizing: { ...inputs.sizing, privilegedAccountCountEstimated: true },
    };
    expect(allText(buildProposal(estimated))).toContain('estimated from IT headcount');
  });
});
