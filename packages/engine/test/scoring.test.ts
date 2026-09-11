// Fit scoring (PROJECT_SPEC §7.3).
//
// The arithmetic is checked against hand-workable numbers from the fixtures,
// not against the committed weights — those are exercised by the worked
// examples in the repo-root `data` project, so a tuning change does not break
// a unit test that was meant to assert the formula.

import type { AssetInventory, Framework, Product } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { computeSizing } from '../src/sizing.js';
import {
  effectiveWeights,
  hardFilter,
  rankWithinCategory,
  scoreProduct,
  scoreProducts,
  type ScoringInputs,
} from '../src/scoring.js';
import {
  buildCategoryWeights as buildCategoryWeightsFixture,
  buildClientProfile,
  buildFramework,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures.js';

function inventory(counts: Record<string, number>): AssetInventory {
  return {
    ...Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
    networkVendors: [],
  } as AssetInventory;
}

function buildInputs(overrides: Partial<ScoringInputs> = {}): ScoringInputs {
  const inv = overrides.inventory ?? inventory({ windowsServers: 10, windowsEndpoints: 10 });
  const profile = overrides.profile ?? buildClientProfile({ securityStaffFte: 2 });
  return {
    profile,
    inventory: inv,
    sizing: computeSizing(inv, profile, buildSizingAssumptions()),
    frameworks: [],
    weights: buildScoringWeights(),
    categoryWeights: buildCategoryWeightsFixture(),
    ...overrides,
  };
}

/** A product that covers both servers and workstations. */
function coveringProduct(overrides: Partial<Product> = {}): Product {
  const base = buildProduct();
  return {
    ...base,
    supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    ...overrides,
  };
}

describe('hard filters (§7.3 pass 1)', () => {
  it('eliminates a product the analyst has excluded', () => {
    const product = coveringProduct({ id: 'ruled-out' });
    const inputs = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, excludedProducts: ['ruled-out'] }),
    });
    expect(hardFilter(product, inputs).join(' ')).toContain('Excluded by the analyst');
  });

  it('eliminates a SaaS-only product in an air-gapped environment', () => {
    const base = buildProduct({ deploymentModes: ['cloud'] });
    const product = { ...base, supports: { ...base.supports, deviceClasses: ['server' as const] } };
    const inputs = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, deploymentPreference: 'air_gapped' }),
    });
    expect(hardFilter(product, inputs).join(' ')).toContain('air-gapped');
  });

  it('does not eliminate on a mere deployment preference', () => {
    // A cloud product for an on-prem-preferring client is not what they asked
    // for, but it is not unusable. That belongs in the score, not the filter.
    const inputs = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, deploymentPreference: 'on_prem' }),
    });
    expect(hardFilter(coveringProduct(), inputs)).toEqual([]);
  });

  it('eliminates above the scale ceiling and below the scale floor', () => {
    const inputs = buildInputs({
      inventory: inventory({ windowsServers: 20, windowsEndpoints: 20 }),
    });

    const base = coveringProduct();
    const tooSmall: Product = {
      ...base,
      supports: { ...base.supports, scaleFloor: 'large', scaleCeiling: 'enterprise' },
    };
    const tooBig: Product = {
      ...base,
      supports: { ...base.supports, scaleFloor: 'small', scaleCeiling: 'small' },
    };

    expect(hardFilter(tooSmall, inputs).join(' ')).toContain('below');
    // A 40-asset estate is `small`, which is inside a small–small band.
    expect(hardFilter(tooBig, inputs)).toEqual([]);
  });

  it('eliminates a product that reaches none of the assets its category exists to cover', () => {
    const base = buildProduct();
    const mailOnly: Product = {
      ...base,
      category: 'edr',
      supports: { ...base.supports, deviceClasses: ['mailbox'] },
    };
    // The fixture's non-email remit is server/workstation/mailbox, and this
    // estate has no mailboxes, so an EDR that only handles mailboxes reaches
    // nothing here.
    const inputs = buildInputs({ inventory: inventory({ windowsServers: 10 }) });
    expect(hardFilter(mailOnly, inputs).join(' ')).toContain('Supports none of the');
  });

  it('keeps an eliminated product in the results, with its reason', () => {
    // "Why was X not recommended" is a question analysts get asked on every call.
    const product = coveringProduct({ id: 'ruled-out' });
    const inputs = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, excludedProducts: ['ruled-out'] }),
    });
    const scores = scoreProducts([product], inputs);
    expect(scores).toHaveLength(1);
    expect(scores[0]?.eliminated).toBe(true);
    expect(scores[0]?.score).toBe(0);
    expect(scores[0]?.eliminationReasons.length).toBeGreaterThan(0);
  });
});

describe('asset coverage is scored against the category remit', () => {
  it('gives an email product full marks for covering every mailbox', () => {
    // Scored against the whole estate this product would look terrible, and
    // §7.4 step 2 would never buy it. Against its remit it is perfect.
    const base = buildProduct();
    const gateway: Product = {
      ...base,
      category: 'email_security',
      supports: { ...base.supports, deviceClasses: ['mailbox'] },
    };
    const inputs = buildInputs({
      inventory: inventory({ windowsServers: 500, windowsEndpoints: 500, m365Seats: 40 }),
    });

    const score = scoreProduct(gateway, inputs);
    const coverage = score.dimensions.find((d) => d.dimension === 'asset_coverage');
    expect(coverage?.score).toBe(100);
  });

  it('scores partial coverage proportionally', () => {
    const base = buildProduct();
    const serversOnly: Product = {
      ...base,
      supports: { ...base.supports, deviceClasses: ['server'] },
    };
    // 30 servers of 40 in-remit assets = 75%.
    const inputs = buildInputs({
      inventory: inventory({ windowsServers: 30, windowsEndpoints: 10 }),
    });
    const coverage = scoreProduct(serversOnly, inputs).dimensions.find(
      (d) => d.dimension === 'asset_coverage',
    );
    expect(coverage?.score).toBe(75);
  });

  it('is neutral rather than zero when nothing in the remit was captured', () => {
    const inputs = buildInputs({ inventory: inventory({ routers: 5 }) });
    const coverage = scoreProduct(coveringProduct(), inputs).dimensions.find(
      (d) => d.dimension === 'asset_coverage',
    );
    expect(coverage?.score).toBe(100);
    expect(coverage?.rationale).toContain('not a differentiator');
  });
});

describe('compliance fit', () => {
  const framework: Framework = buildFramework({
    id: 'pci-dss-4.0',
    name: 'PCI DSS',
    sourceQuality: 'secondary_sources',
    version: '4.0',
    controls: [
      { id: '10', title: 'Log and monitor', satisfiedBy: ['siem'], mandatory: true },
      { id: '11', title: 'Test security', satisfiedBy: ['siem'], mandatory: true },
      { id: '5', title: 'Anti-malware', satisfiedBy: ['edr'], mandatory: true },
    ],
  });

  it('scores controls covered against controls the frameworks ask of this category', () => {
    // Two SIEM controls are asked for; this product claims one.
    const product = { ...coveringProduct(), controlsCovered: ['pci-dss-4.0:10'] };
    const score = scoreProduct(product, buildInputs({ frameworks: [framework] }));
    expect(score.dimensions.find((d) => d.dimension === 'compliance_fit')?.score).toBe(50);
  });

  it('is neutral for everyone when no framework was selected', () => {
    const score = scoreProduct(coveringProduct(), buildInputs({ frameworks: [] }));
    const fit = score.dimensions.find((d) => d.dimension === 'compliance_fit');
    expect(fit?.score).toBe(100);
    expect(fit?.rationale).toContain('No compliance frameworks were selected');
  });

  it('ignores controls asked of other categories', () => {
    // The EDR control must not count against a SIEM's denominator.
    const product = {
      ...coveringProduct(),
      controlsCovered: ['pci-dss-4.0:10', 'pci-dss-4.0:11'],
    };
    const score = scoreProduct(product, buildInputs({ frameworks: [framework] }));
    expect(score.dimensions.find((d) => d.dimension === 'compliance_fit')?.score).toBe(100);
  });
});

describe('ops fit — the dimension that stops "free" winning by default', () => {
  it('scores full marks for a tool the team can absorb', () => {
    const light = { ...coveringProduct(), opsBurden: { baseFte: 0.1, ftePerThousandAssets: 0 } };
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 2 }) });
    expect(scoreProduct(light, inputs).dimensions.find((d) => d.dimension === 'ops_fit')?.score).toBe(
      100,
    );
  });

  it('scores zero for a tool that would need more than the whole team', () => {
    const heavy = { ...coveringProduct(), opsBurden: { baseFte: 3, ftePerThousandAssets: 0 } };
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 2 }) });
    const fit = scoreProduct(heavy, inputs).dimensions.find((d) => d.dimension === 'ops_fit');
    expect(fit?.score).toBe(0);
    expect(fit?.rationale).toContain('cannot run it');
  });

  it('handles a client with no security staff without dividing by zero', () => {
    // Zero security FTE is valid, common, and must not produce NaN.
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 0 }) });
    const fit = scoreProduct(coveringProduct(), inputs).dimensions.find(
      (d) => d.dimension === 'ops_fit',
    );
    expect(fit?.score).toBe(15);
    expect(Number.isNaN(fit?.score ?? NaN)).toBe(false);
  });

  it('degrades between comfortable and unusable rather than falling off a cliff', () => {
    const midweight = {
      ...coveringProduct(),
      opsBurden: { baseFte: 1.55, ftePerThousandAssets: 0 },
    };
    // 1.55 of 2.0 FTE = 77.5% share, between 35% and 120%.
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 2 }) });
    const score = scoreProduct(midweight, inputs).dimensions.find(
      (d) => d.dimension === 'ops_fit',
    )?.score;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe('procurement bias shifts the weights', () => {
  it('raises the ops-fit weight for an open-source-first buyer', () => {
    const weights = buildScoringWeights();
    const neutral = effectiveWeights(weights, buildClientProfile());
    const oss = effectiveWeights(weights, buildClientProfile({ procurementBias: 'open_source_first' }));
    expect(oss.get('ops_fit')).toBeGreaterThan(neutral.get('ops_fit') ?? 0);
  });

  it('renormalises to 100 so the score stays out of 100', () => {
    for (const bias of ['no_preference', 'open_source_first', 'commercial'] as const) {
      const weights = effectiveWeights(buildScoringWeights(), buildClientProfile({ procurementBias: bias }));
      const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(100, 6);
    }
  });

  it('penalises an operationally heavy tool harder for an open-source-first buyer', () => {
    const heavy = { ...coveringProduct(), opsBurden: { baseFte: 3, ftePerThousandAssets: 0 } };
    const profile = { securityStaffFte: 2 };
    const neutral = scoreProduct(heavy, buildInputs({ profile: buildClientProfile(profile) })).score;
    const oss = scoreProduct(
      heavy,
      buildInputs({
        profile: buildClientProfile({ ...profile, procurementBias: 'open_source_first' }),
      }),
    ).score;
    expect(oss).toBeLessThan(neutral);
  });
});

describe('the overall score', () => {
  it('sums the weighted contributions and stays within 0–100', () => {
    const score = scoreProduct(coveringProduct(), buildInputs());
    const summed = score.dimensions.reduce((sum, d) => sum + d.contribution, 0);
    expect(score.score).toBeCloseTo(summed, 1);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it('gives every dimension a rationale (hard rule 5)', () => {
    const score = scoreProduct(coveringProduct(), buildInputs());
    expect(score.dimensions).toHaveLength(7);
    for (const dimension of score.dimensions) {
      expect(dimension.rationale.length, `${dimension.dimension} has no rationale`).toBeGreaterThan(0);
    }
  });

  it('ranks within a category, best first', () => {
    const good = { ...coveringProduct(), id: 'good', maturity: 'established' as const };
    const worse = { ...coveringProduct(), id: 'worse', maturity: 'legacy' as const };
    const ranked = rankWithinCategory(scoreProducts([worse, good], buildInputs()), 'siem');
    expect(ranked.map((entry) => entry.productId)).toEqual(['good', 'worse']);
  });

  it('is deterministic', () => {
    const inputs = buildInputs();
    expect(scoreProduct(coveringProduct(), inputs)).toEqual(scoreProduct(coveringProduct(), inputs));
  });
});

describe('regressions', () => {
  it('measures asset coverage in weighted units, not raw counts', () => {
    // Was: a SIEM ingesting every server, domain controller and firewall scored
    // 0.5/100 in a mailbox-heavy estate, because 5,000 seats outnumbered 26
    // pieces of infrastructure one-for-one — on the heaviest-weighted dimension
    // there is. Mailboxes are worth a fraction of a server, and coverage has to
    // use the same weighted units the infrastructure stage does.
    const base = buildProduct();
    const siem: Product = {
      ...base,
      category: 'siem',
      supports: {
        ...base.supports,
        deviceClasses: ['server', 'domain_controller', 'firewall', 'network_device'],
      },
    };
    const inputs = buildInputs({
      inventory: inventory({
        windowsServers: 20,
        windowsDomainControllers: 2,
        firewalls: 4,
        m365Seats: 5000,
      }),
      weights: {
        ...buildScoringWeights(),
        categoryRemits: buildScoringWeights().categoryRemits.map((remit) =>
          remit.category === 'siem'
            ? {
                ...remit,
                deviceClasses: ['server', 'domain_controller', 'firewall', 'mailbox'] as never,
              }
            : remit,
        ),
      },
      categoryWeights: buildCategoryWeightsFixture({
        windowsServers: 4,
        windowsDomainControllers: 25,
        firewalls: 10,
        m365Seats: 0.15,
      }),
    });

    const coverage = scoreProduct(siem, inputs).dimensions.find(
      (d) => d.dimension === 'asset_coverage',
    );
    // 20×4 + 2×25 + 4×10 = 170 covered, against 170 + 5000×0.15 = 920 in remit.
    expect(coverage?.score).toBeCloseTo(18.5, 0);
    // The raw-count answer was 26/5026. Anything near that is the bug returning.
    expect(coverage?.score).toBeGreaterThan(5);
  });
});
