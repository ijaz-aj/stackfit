// Stage 6 of the pipeline: the client-facing proposal (PROJECT_SPEC §8).
//
// This builds a *document model*, not a document. Three renderers are required
// — an HTML preview, a DOCX and a PDF — and writing the content decisions three
// times is how three exports end up disagreeing about the same number.
//
// Money stays `Money` all the way through. Nothing here formats a currency,
// because formatting is the render boundary (hard rule 1) and each renderer
// owns its own. The same goes for dates: `asOf` is passed in, never read from a
// clock, so the same scenario exports byte-identically twice.
//
// Pure: no fs, no clock, no randomness.

import type {
  ClientProfile,
  CurrencyCode,
  Money,
  PortfolioAssumptions,
  Product,
  ProductCategory,
} from '@stackfit/schema';

import { coverageDisclaimer, type CoverageResult } from './coverage';
import type { CategoryJustification } from './justification';
import type { Bundle, BundleSelection } from './portfolio';
import type { SizingResult } from './sizing';

/**
 * PROJECT_SPEC §6 pricing rule 4, verbatim and non-negotiable: "Every export
 * carries…". The `{date}` placeholder is filled with the `asOf` the caller
 * passed, so it names the day the figures were read rather than the day the
 * file happened to be generated.
 */
export function proposalDisclaimer(asOf: string): string {
  return (
    `Indicative budgetary estimates based on published list pricing as of ${asOf}. ` +
    'Not a quote. Actual pricing subject to vendor negotiation, channel discount, and bundling.'
  );
}

/** A cell keeps its type so each renderer can format it its own way. */
export type ProposalCell =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'money'; readonly value: Money }
  | { readonly kind: 'number'; readonly value: number; readonly decimals: number }
  | { readonly kind: 'percent'; readonly value: number | null };

export type ProposalAlign = 'left' | 'right';

export interface ProposalColumn {
  readonly heading: string;
  readonly align: ProposalAlign;
}

export type ProposalBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'bullets'; readonly items: readonly string[] }
  | {
      readonly kind: 'table';
      readonly columns: readonly ProposalColumn[];
      readonly rows: readonly (readonly ProposalCell[])[];
      /** Rendered in bold, below the body. Absent when there is nothing to total. */
      readonly total?: readonly ProposalCell[];
    }
  | { readonly kind: 'callout'; readonly tone: 'warning' | 'note'; readonly text: string };

export interface ProposalSection {
  readonly heading: string;
  readonly blocks: readonly ProposalBlock[];
}

export interface RoadmapEntry {
  readonly phaseLabel: string;
  readonly horizon: string;
  readonly category: ProductCategory;
  /** Carried so a renderer never has to own its own copy of the label map. */
  readonly categoryLabel: string;
  readonly productName: string;
  readonly tierName: string;
  readonly mandatory: boolean;
  readonly typicalWeeks: number;
  readonly annualSpend: Money;
  readonly oneTime: Money;
}

/**
 * One row of the raw cost model §8 asks for: "Plus a raw XLSX/CSV of the cost
 * model for the analyst."
 *
 * Deliberately wider than anything the prose sections show. This is the sheet
 * an analyst pivots, argues with and pastes into their own model, so it carries
 * the four cost lines separately, the confidence grading and the price age —
 * everything needed to challenge a number rather than just read it.
 */
export interface CostModelRow {
  readonly category: ProductCategory;
  readonly categoryLabel: string;
  readonly productName: string;
  readonly vendor: string;
  readonly tierName: string;
  readonly mandatory: boolean;
  readonly fitScore: number;
  readonly licenceAnnual: Money;
  readonly supportAnnual: Money;
  readonly infraAnnual: Money;
  readonly opsFteAnnual: Money;
  readonly opsFte: number;
  readonly annualSpend: Money;
  readonly annualRecurring: Money;
  readonly oneTime: Money;
  readonly tco: Money;
  readonly pricingConfidence: string;
  readonly priceAge: string;
  readonly suiteDiscountApplied: boolean;
}

export interface ProposalDocument {
  readonly title: string;
  readonly preparedFor: string;
  readonly asOf: string;
  readonly currency: CurrencyCode;
  readonly disclaimer: string;
  readonly sections: readonly ProposalSection[];
  /** Exposed separately as well, because the XLSX export is a table not a document. */
  readonly roadmap: readonly RoadmapEntry[];
  /** Likewise: §8's "raw cost model for the analyst" is a sheet, not prose. */
  readonly costModel: readonly CostModelRow[];
}

export interface ProposalInputs {
  readonly profile: ClientProfile;
  readonly sizing: SizingResult;
  readonly products: readonly Product[];
  readonly recommended: Bundle;
  readonly essential: Bundle;
  readonly ideal: Bundle;
  readonly coverage: CoverageResult;
  /**
   * Why each selection beat the alternatives, from `justifyBundle`.
   *
   * Passed in rather than computed here: `justification.ts` already depends on
   * this module for its category labels, and the proposal calling it back would
   * make the two circular. Empty is valid and simply omits the section.
   */
  readonly justifications: readonly CategoryJustification[];
  readonly assumptions: PortfolioAssumptions;
  /** The date the figures were read. Passed in — the engine has no clock. */
  readonly asOf: string;
}

const text = (value: string): ProposalCell => ({ kind: 'text', value });
const money = (value: Money): ProposalCell => ({ kind: 'money', value });
const number = (value: number, decimals = 0): ProposalCell => ({ kind: 'number', value, decimals });
const percent = (value: number | null): ProposalCell => ({ kind: 'percent', value });

/**
 * Service levels are enum values in the rate card and prose in a proposal.
 * "mdr" in the middle of a client-facing sentence reads as a typo.
 */
const SERVICE_LEVEL_LABELS: Readonly<Record<string, string>> = {
  monitoring: 'Monitoring',
  mdr: 'Managed detection and response',
  managed_security: 'Fully managed security',
};

export const CATEGORY_LABELS: Readonly<Record<ProductCategory, string>> = {
  siem: 'SIEM',
  edr: 'EDR',
  ndr: 'Network detection',
  pam: 'Privileged access',
  iam: 'Identity',
  vulnerability_management: 'Vulnerability management',
  email_security: 'Email security',
  soar: 'Automation',
  backup: 'Backup and recovery',
  ngfw: 'Firewall',
  asset_discovery: 'Asset discovery',
  deception: 'Deception',
  mdr: 'Managed detection',
};

/** Mandatory first, then by category weight — the order the money was spent in. */
function inDeliveryOrder(selections: readonly BundleSelection[]): BundleSelection[] {
  return [...selections].sort(
    (a, b) =>
      Number(b.mandatory) - Number(a.mandatory) ||
      b.categoryWeight - a.categoryWeight ||
      a.category.localeCompare(b.category),
  );
}

/**
 * Assigns the bundle to delivery phases by how much elapsed time each can
 * absorb, across the configured number of parallel workstreams.
 *
 * The final phase is open-ended — the schema enforces it — so a long programme
 * cannot silently lose its tail.
 */
export function buildRoadmap(inputs: ProposalInputs): RoadmapEntry[] {
  const { recommended, products, assumptions } = inputs;
  const { phases, parallelWorkstreams } = assumptions.roadmap;

  const weeksByProduct = new Map(
    products.map((product) => [product.id, product.implementation.typicalWeeks]),
  );

  const entries: RoadmapEntry[] = [];
  let phaseIndex = 0;
  let elapsedInPhase = 0;

  for (const selection of inDeliveryOrder(recommended.selections)) {
    const typicalWeeks = weeksByProduct.get(selection.productId) ?? 0;
    // Parallel workstreams shorten the wall-clock a deployment consumes, they
    // do not shorten the deployment.
    const elapsed = typicalWeeks / parallelWorkstreams;

    // Advance while this product would overrun the phase — but never past the
    // last one, which has no ceiling.
    while (phaseIndex < phases.length - 1) {
      const ceiling = phases[phaseIndex]?.elapsedWeeks;
      if (ceiling === null || ceiling === undefined) break;
      // A phase that has not started yet always takes the next product, however
      // long it is, so a single slow deployment cannot skip a phase entirely.
      if (elapsedInPhase === 0 || elapsedInPhase + elapsed <= ceiling) break;
      phaseIndex += 1;
      elapsedInPhase = 0;
    }

    const phase = phases[phaseIndex];
    elapsedInPhase += elapsed;

    entries.push({
      phaseLabel: phase?.label ?? 'Unscheduled',
      horizon: phase?.horizon ?? '',
      category: selection.category,
      categoryLabel: CATEGORY_LABELS[selection.category],
      productName: selection.productName,
      tierName: selection.tierName,
      mandatory: selection.mandatory,
      typicalWeeks,
      annualSpend: selection.annualSpend,
      oneTime: selection.oneTime,
    });
  }

  return entries;
}

function executiveSummary(inputs: ProposalInputs): ProposalSection {
  const { profile, recommended, coverage, sizing } = inputs;
  const inScope = coverage.frameworks.filter((framework) => framework.inScope);
  const blocks: ProposalBlock[] = [];

  blocks.push({
    kind: 'paragraph',
    text:
      `${profile.orgName} operates an estate of ${sizing.monitoredAssetCount} monitored asset(s) ` +
      `across ${profile.employeeCount} staff, with ${profile.securityStaffFte} dedicated security ` +
      `FTE. This proposal recommends ${recommended.selections.length} security control(s), ` +
      `costed over ${profile.budget.horizonYears} years.`,
  });

  const summary: string[] = [];
  if (inScope.length > 0) {
    const named = inScope
      .map((framework) => `${framework.name} at ${framework.coveragePercent ?? 0}%`)
      .join(', ');
    summary.push(`Compliance coverage achieved: ${named}.`);
  } else {
    summary.push(
      'No compliance framework was selected, so the recommendation is driven by the ' +
        'infrastructure and the risk it carries rather than by an obligation.',
    );
  }
  summary.push(
    `Operational effort to run the recommended stack: ${round(recommended.totalOpsFte, 2)} FTE. ` +
      'This is people, not licence, and it is the cost most often left out of a comparison.',
  );
  if (!recommended.withinAnnualCap) {
    summary.push('⚠ The recommended stack exceeds the stated annual budget — see Costs.');
  }
  blocks.push({ kind: 'bullets', items: summary });

  if (recommended.unfundedMandatory.length > 0) {
    blocks.push({
      kind: 'callout',
      tone: 'warning',
      text:
        'The stated budget does not cover every control the selected frameworks require. ' +
        `Unfunded: ${recommended.unfundedMandatory.map((category) => CATEGORY_LABELS[category]).join(', ')}. ` +
        'This proposal reports the shortfall rather than presenting a stack that does not meet the obligation.',
    });
  }

  return { heading: 'Executive summary', blocks };
}

function currentState(inputs: ProposalInputs): ProposalSection {
  const { sizing, profile } = inputs;

  const rows: (readonly ProposalCell[])[] = [
    [text('Monitored assets'), number(sizing.monitoredAssetCount)],
    [text('Endpoints'), number(sizing.endpointCount)],
    [text('Servers'), number(sizing.serverCount)],
    [text('Privileged accounts'), number(sizing.privilegedAccountCount)],
    [text('Estimated events per second'), number(sizing.epsTotal, 1)],
    [text('Estimated log volume (GB/day)'), number(sizing.gbPerDay, 2)],
    [text('Log retention required (days)'), number(sizing.retentionDays)],
    [text('Estimated log storage (TB)'), number(sizing.storageTb, 2)],
    [text('Security staff (FTE)'), number(profile.securityStaffFte, 2)],
  ];

  const blocks: ProposalBlock[] = [
    {
      kind: 'paragraph',
      text:
        'Every figure below is derived from the asset inventory captured during scoping. ' +
        'They drive the sizing and therefore the cost of every recommendation in this document; ' +
        'correcting any of them changes the numbers that follow.',
    },
    {
      kind: 'table',
      columns: [
        { heading: 'Measure', align: 'left' },
        { heading: 'Value', align: 'right' },
      ],
      rows,
    },
  ];

  if (sizing.privilegedAccountCountEstimated) {
    blocks.push({
      kind: 'callout',
      tone: 'note',
      text:
        'The privileged account count was estimated from IT headcount rather than captured. ' +
        'It sizes privileged access licensing, so it is worth confirming before this becomes a quote.',
    });
  }

  return { heading: 'Current state', blocks };
}

function recommendedStack(inputs: ProposalInputs): ProposalSection {
  const { recommended } = inputs;

  const rows = inDeliveryOrder(recommended.selections).map((selection) => [
    text(CATEGORY_LABELS[selection.category]),
    text(`${selection.productName} — ${selection.tierName}`),
    text(selection.mandatory ? 'Required by compliance' : 'Risk-reduction'),
    money(selection.annualSpend),
  ]);

  return {
    heading: 'Recommended stack',
    blocks: [
      {
        kind: 'paragraph',
        text:
          'One product per category. Where a category is marked as required by compliance, a ' +
          'selected framework mandates it and the recommendation is not discretionary.',
      },
      {
        kind: 'table',
        columns: [
          { heading: 'Category', align: 'left' },
          { heading: 'Product', align: 'left' },
          { heading: 'Driver', align: 'left' },
          { heading: 'Annual spend', align: 'right' },
        ],
        rows,
        total: [text('Total'), text(''), text(''), money(recommended.annualSpend)],
      },
    ],
  };
}

/**
 * Why each product, and not the ones beside it (§8.2).
 *
 * A proposal that lists what was chosen invites exactly one question, and
 * answering it in the room is not the same as answering it in the document. One
 * row per rejected SKU, carrying the reason the engine actually decided on.
 */
function whyTheseProducts(inputs: ProposalInputs): ProposalSection {
  const blocks: ProposalBlock[] = [
    {
      kind: 'paragraph',
      text:
        'Every product in the catalogue that could serve each category was scored against this ' +
        'client’s own environment, not in the abstract. The tables below name what else was ' +
        'considered and why it was not selected, so the choice can be checked rather than taken ' +
        'on trust.',
    },
    {
      kind: 'paragraph',
      text:
        'Only products that competed are listed. Where one was ruled out before scoring — too ' +
        'large or too small for this estate, no support for a device class it would have to ' +
        'cover, or excluded for this client — the count appears beside its category and the ' +
        'reason is on the scoping dashboard.',
    },
    {
      kind: 'paragraph',
      text:
        'Two things hold for every row below, so they are stated once here rather than repeated ' +
        'in each. Costs are compared on total annual cost, people included, because a comparison ' +
        'on licence alone systematically flatters self-hosted options — most of what they cost ' +
        'is the people who run them. And only one product per category is funded, so a strong ' +
        'product can appear here having lost on nothing but price.',
    },
  ];

  for (const justification of inputs.justifications) {
    blocks.push({ kind: 'paragraph', text: `${justification.categoryLabel}. ${justification.headline}` });

    // Contenders only. The headline above already states how many were ruled
    // out before scoring, so nothing is concealed by leaving them out of the
    // table — only the per-product reason moves to the dashboard.
    const contenders = justification.alternatives.filter(
      (alternative) => alternative.kind !== 'eliminated',
    );
    if (contenders.length === 0) continue;

    blocks.push({
      kind: 'table',
      columns: [
        { heading: 'Considered', align: 'left' },
        { heading: 'Fit', align: 'right' },
        { heading: 'Annual spend', align: 'right' },
        { heading: 'Why not selected', align: 'left' },
      ],
      rows: contenders.map((alternative) => [
        text(`${alternative.productName} — ${alternative.tierName}`),
        number(alternative.fitScore, 1),
        // Every contender was costed; only a ruled-out product is not, and
        // those do not reach this table.
        alternative.annualSpend === null ? text('not costed') : money(alternative.annualSpend),
        text(alternative.verdict),
      ]),
    });
  }

  return { heading: 'Why these products', blocks };
}

function costs(inputs: ProposalInputs): ProposalSection {
  const { recommended, essential, ideal, profile } = inputs;

  const compare = (bundle: Bundle, label: string): readonly ProposalCell[] => [
    text(label),
    number(bundle.selections.length),
    money(bundle.annualSpend),
    money(bundle.annualRecurring),
    money(bundle.tco),
  ];

  const blocks: ProposalBlock[] = [
    {
      kind: 'paragraph',
      text:
        'Annual spend is procurement — licence, support and infrastructure. Total annual cost ' +
        'adds the operational people required to run the stack, which is not a procurement line ' +
        'but is a real cost. Both are shown because a comparison that omits the second ' +
        'systematically flatters self-hosted and open-source options.',
    },
    {
      kind: 'table',
      columns: [
        { heading: 'Option', align: 'left' },
        { heading: 'Controls', align: 'right' },
        { heading: 'Annual spend', align: 'right' },
        { heading: 'Total annual cost', align: 'right' },
        { heading: `${profile.budget.horizonYears}-year TCO`, align: 'right' },
      ],
      rows: [
        compare(essential, 'Essential — minimum defensible'),
        compare(recommended, 'Recommended'),
        compare(ideal, 'Ideal — no budget constraint'),
      ],
    },
  ];

  if (recommended.annualShortfall !== null) {
    blocks.push({
      kind: 'callout',
      tone: 'warning',
      text:
        'The controls required by the selected frameworks cost more than the stated annual ' +
        'budget. The shortfall and the minimum viable budget are stated rather than absorbed ' +
        'by quietly recommending less.',
    });
  }

  // A separate callout, not a clause in the one above. The reader's response to
  // each is different — one is a recurring budget conversation, the other a
  // one-off project-funding one — and a proposal that blurs them invites the
  // client to solve the wrong problem.
  if (recommended.oneTimeShortfall !== null) {
    blocks.push({
      kind: 'callout',
      tone: 'warning',
      text:
        'Standing up the required controls costs more than the stated one-time budget. This is ' +
        'a separate constraint from the annual one: raising the recurring budget does not pay ' +
        'for the implementation, and the figure below is what it would take.',
    });
  }

  const mssp = recommended.mssp;
  const serviceLevel = SERVICE_LEVEL_LABELS[mssp.serviceLevel] ?? mssp.serviceLevel;

  blocks.push({
    kind: 'paragraph',
    text:
      `Build versus buy. The same outcome can be bought as a service: ${serviceLevel} covering ` +
      `${mssp.coversCategories.length} of the ${recommended.selections.length} recommended ` +
      'categories. It is shown in full below rather than as a headline, because a managed fee ' +
      'that covers only part of the stack is not comparable to the stack until the rest is added ' +
      'back.',
  });

  blocks.push({
    kind: 'table',
    columns: [
      { heading: 'Managed alternative', align: 'left' },
      { heading: 'Annual', align: 'right' },
    ],
    rows: [
      [text(`${serviceLevel} — service fee`), money(mssp.annual)],
      [
        text(
          mssp.uncoveredCategories.length === 0
            ? 'Residual — none, the service covers every recommended category'
            : `Residual — still the client's to buy: ${mssp.uncoveredCategories
                .map((category) => CATEGORY_LABELS[category])
                .join(', ')}`,
        ),
        money(mssp.residualAnnual),
      ],
    ],
    total: [text('Total annual, managed route'), money(mssp.totalAnnual)],
  });

  return { heading: 'Costs', blocks };
}

function roadmapSection(inputs: ProposalInputs, roadmap: readonly RoadmapEntry[]): ProposalSection {
  const { assumptions } = inputs;

  const rows = roadmap.map((entry) => [
    text(entry.phaseLabel),
    text(CATEGORY_LABELS[entry.category]),
    text(`${entry.productName} — ${entry.tierName}`),
    number(entry.typicalWeeks),
    money(entry.annualSpend),
  ]);

  const phaseNotes = assumptions.roadmap.phases.map(
    (phase) => `${phase.label} (${phase.horizon}): ${phase.basis}`,
  );

  return {
    heading: 'Roadmap',
    blocks: [
      {
        kind: 'paragraph',
        text:
          'Sequenced by compliance obligation first, then by risk reduction, and bounded by how ' +
          `much delivery the client can absorb — ${assumptions.roadmap.parallelWorkstreams} ` +
          'parallel workstream(s). Elapsed weeks are the vendor-typical deployment time for each ' +
          'product, not effort days.',
      },
      {
        kind: 'table',
        columns: [
          { heading: 'Phase', align: 'left' },
          { heading: 'Category', align: 'left' },
          { heading: 'Product', align: 'left' },
          { heading: 'Weeks', align: 'right' },
          { heading: 'Annual spend', align: 'right' },
        ],
        rows,
      },
      { kind: 'bullets', items: phaseNotes },
    ],
  };
}

function coverageSection(inputs: ProposalInputs): ProposalSection {
  const { coverage } = inputs;

  const rows = coverage.frameworks.map((framework) => [
    text(framework.name),
    text(framework.inScope ? 'Selected' : 'Reference only'),
    number(framework.coveredControls),
    number(framework.addressableControls),
    percent(framework.coveragePercent),
  ]);

  const blocks: ProposalBlock[] = [
    {
      kind: 'callout',
      tone: 'warning',
      text: coverageDisclaimer(),
    },
    {
      kind: 'paragraph',
      text:
        'Coverage counts a control as covered only where a selected product claims it. A ' +
        'category of the right kind being present is counted as partial, not covered, and ' +
        'controls that no product category can satisfy are outside the denominator entirely. ' +
        'These percentages are therefore lower than a category-level reading would give, and ' +
        'deliberately so.',
    },
    {
      kind: 'table',
      columns: [
        { heading: 'Framework', align: 'left' },
        { heading: 'Status', align: 'left' },
        { heading: 'Covered', align: 'right' },
        { heading: 'Addressable', align: 'right' },
        { heading: 'Coverage', align: 'right' },
      ],
      rows,
    },
  ];

  if (coverage.unclosableGaps.length > 0) {
    blocks.push({
      kind: 'callout',
      tone: 'note',
      text:
        `${coverage.unclosableGaps.length} control(s) in scope cannot be closed by any product ` +
        'in this catalog. They are listed here rather than omitted, because a gap the tool ' +
        'cannot fix is still a gap the client has.',
    });
  }

  return { heading: 'Compliance coverage', blocks };
}

function assumptionsSection(inputs: ProposalInputs): ProposalSection {
  const { asOf, recommended } = inputs;

  const estimated = recommended.selections.filter(
    (selection) => selection.cost.pricingConfidence !== 'public_list',
  );

  const blocks: ProposalBlock[] = [
    { kind: 'callout', tone: 'warning', text: proposalDisclaimer(asOf) },
    {
      kind: 'bullets',
      items: [
        'Operational FTE is an analyst estimate throughout, not a vendor figure. It is the ' +
          'number most likely to be wrong and the one that most changes a comparison between ' +
          'commercial and open-source options.',
        'Discount assumptions are applied by deal size and are stated wherever they bite. They ' +
          'are assumptions, not quoted discounts.',
        'Sizing coefficients are analyst estimates from industry rules of thumb. The current ' +
          'state section lists every derived figure so each can be challenged.',
        'Currency conversion uses the rate recorded in the configuration on the date shown. A ' +
          'multi-year total quoted at a stale rate is wrong by however far the currency has moved.',
      ],
    },
  ];

  if (estimated.length > 0) {
    blocks.push({
      kind: 'callout',
      tone: 'warning',
      text:
        `${estimated.length} of ${recommended.selections.length} recommended product(s) are ` +
        'priced on an analyst estimate rather than a published vendor rate, because the vendor ' +
        'publishes none: ' +
        estimated.map((selection) => selection.productName).join(', ') +
        '. Obtain a quote before treating these figures as budget.',
    });
  }

  return { heading: 'Assumptions and disclaimers', blocks };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return (scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)) / factor;
}

/**
 * The recommended bundle as a flat table, one row per selection.
 *
 * Reads `selection.cost` rather than looking the product's cost up again by id:
 * a suite-discounted selection is costed a second time inside the portfolio
 * stage, and the by-id figure is the undiscounted one. Re-deriving it here
 * would put a licence line in the analyst's spreadsheet that disagrees with the
 * total in the proposal.
 */
export function buildCostModel(inputs: ProposalInputs): CostModelRow[] {
  return inDeliveryOrder(inputs.recommended.selections).map((selection) => ({
    category: selection.category,
    categoryLabel: CATEGORY_LABELS[selection.category],
    productName: selection.productName,
    vendor: selection.vendor,
    tierName: selection.tierName,
    mandatory: selection.mandatory,
    fitScore: selection.fitScore,
    licenceAnnual: selection.cost.licenceAnnual,
    supportAnnual: selection.cost.supportAnnual,
    infraAnnual: selection.cost.infraAnnual,
    opsFteAnnual: selection.cost.opsFteAnnual,
    opsFte: selection.cost.opsFte,
    annualSpend: selection.annualSpend,
    annualRecurring: selection.annualRecurring,
    oneTime: selection.oneTime,
    tco: selection.tco,
    pricingConfidence: selection.cost.pricingConfidence,
    priceAge: selection.cost.freshness.status,
    suiteDiscountApplied: selection.suiteDiscountApplied,
  }));
}

/** §8's proposal, as a document model every renderer can read. */
export function buildProposal(inputs: ProposalInputs): ProposalDocument {
  const roadmap = buildRoadmap(inputs);

  return {
    costModel: buildCostModel(inputs),
    title: 'Security stack proposal',
    preparedFor: inputs.profile.orgName,
    asOf: inputs.asOf,
    currency: inputs.recommended.currency,
    disclaimer: proposalDisclaimer(inputs.asOf),
    roadmap,
    sections: [
      executiveSummary(inputs),
      currentState(inputs),
      recommendedStack(inputs),
      whyTheseProducts(inputs),
      costs(inputs),
      coverageSection(inputs),
      roadmapSection(inputs, roadmap),
      assumptionsSection(inputs),
    ],
  };
}
