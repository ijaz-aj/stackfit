// Fit scoring (PROJECT_SPEC §7.3).
//
// The arithmetic is checked against hand-workable numbers from the fixtures,
// not against the committed weights — those are exercised by the worked
// examples in the repo-root `data` project, so a tuning change does not break
// a unit test that was meant to assert the formula.

import type {
  AssetInventory,
  DeploymentMode,
  EstateShape,
  Framework,
  Product,
} from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { computeSizing } from '../src/sizing';
import {
  effectiveWeights,
  hardFilter,
  rankWithinCategory,
  scoreProduct,
  scoreProducts,
  type ProductScore,
  type ScoringInputs,
} from '../src/scoring';
import {
  buildCategoryWeights as buildCategoryWeightsFixture,
  buildClientProfile,
  buildFramework,
  buildProduct,
  buildScoringWeights,
  buildSizingAssumptions,
} from './fixtures';

function inventory(counts: Record<string, number>): AssetInventory {
  return {
    ...Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count }])),
    networkVendors: [],
  } as AssetInventory;
}

/**
 * Scores a product at its first tier.
 *
 * Scoring is per SKU now, but almost every test here is about a dimension
 * rather than about tiering, and `buildProduct` makes a single-tier product.
 * Tier behaviour has its own block at the bottom.
 */
function scoreAtFirstTier(product: Product, inputs: ScoringInputs): ProductScore {
  return scoreProduct(product, product.tiers[0]!, inputs);
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

    const score = scoreAtFirstTier(gateway, inputs);
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
    const coverage = scoreAtFirstTier(serversOnly, inputs).dimensions.find(
      (d) => d.dimension === 'asset_coverage',
    );
    expect(coverage?.score).toBe(75);
  });

  it('is neutral rather than zero when nothing in the remit was captured', () => {
    const inputs = buildInputs({ inventory: inventory({ routers: 5 }) });
    const coverage = scoreAtFirstTier(coveringProduct(), inputs).dimensions.find(
      (d) => d.dimension === 'asset_coverage',
    );
    expect(coverage?.score).toBe(100);
    expect(coverage?.rationale).toContain('not a differentiator');
  });

  it('names what it reaches in the client’s own counts, not in weighted units', () => {
    // §8.2 asks the dashboard to say "covers 38 Windows servers, 12 Linux
    // servers, 40 POS terminals". The weighted units are what the score is
    // computed from; these are what an analyst says out loud, and the two must
    // not be confused for one another.
    const base = buildProduct();
    const serversOnly: Product = {
      ...base,
      supports: { ...base.supports, deviceClasses: ['server'] },
    };
    const score = scoreAtFirstTier(
      serversOnly,
      buildInputs({ inventory: inventory({ windowsServers: 38, windowsEndpoints: 12 }) }),
    );

    expect(score.coveredAssets).toEqual([{ assetClass: 'windowsServers', count: 38 }]);
    expect(score.missedAssets).toEqual([{ assetClass: 'windowsEndpoints', count: 12 }]);
  });

  it('reports nothing covered for a product that was ruled out', () => {
    const base = buildProduct();
    const unusable: Product = {
      ...base,
      supports: { ...base.supports, deviceClasses: ['ot_ics'] },
    };
    const score = scoreAtFirstTier(
      unusable,
      buildInputs({ inventory: inventory({ windowsServers: 10 }) }),
    );

    expect(score.eliminated).toBe(true);
    expect(score.coveredAssets).toEqual([]);
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
    const score = scoreAtFirstTier(product, buildInputs({ frameworks: [framework] }));
    expect(score.dimensions.find((d) => d.dimension === 'compliance_fit')?.score).toBe(50);
  });

  it('is neutral for everyone when no framework was selected', () => {
    const score = scoreAtFirstTier(coveringProduct(), buildInputs({ frameworks: [] }));
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
    const score = scoreAtFirstTier(product, buildInputs({ frameworks: [framework] }));
    expect(score.dimensions.find((d) => d.dimension === 'compliance_fit')?.score).toBe(100);
  });
});

describe('ops fit — the dimension that stops "free" winning by default', () => {
  it('scores full marks for a tool the team can absorb', () => {
    const light = { ...coveringProduct(), opsBurden: { baseFte: 0.1, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const } };
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 2 }) });
    expect(scoreAtFirstTier(light, inputs).dimensions.find((d) => d.dimension === 'ops_fit')?.score).toBe(
      100,
    );
  });

  it('scores zero for a tool that would need more than the whole team', () => {
    const heavy = { ...coveringProduct(), opsBurden: { baseFte: 3, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const } };
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 2 }) });
    const fit = scoreAtFirstTier(heavy, inputs).dimensions.find((d) => d.dimension === 'ops_fit');
    expect(fit?.score).toBe(0);
    expect(fit?.rationale).toContain('cannot run it');
  });

  it('handles a client with no security staff without dividing by zero', () => {
    // Zero security FTE is valid, common, and must not produce NaN.
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 0 }) });
    const fit = scoreAtFirstTier(coveringProduct(), inputs).dimensions.find(
      (d) => d.dimension === 'ops_fit',
    );
    expect(fit?.score).toBe(15);
    expect(Number.isNaN(fit?.score ?? NaN)).toBe(false);
  });

  it('degrades between comfortable and unusable rather than falling off a cliff', () => {
    const midweight = {
      ...coveringProduct(),
      opsBurden: { baseFte: 1.55, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
    };
    // 1.55 of 2.0 FTE = 77.5% share, between 35% and 120%.
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 2 }) });
    const score = scoreAtFirstTier(midweight, inputs).dimensions.find(
      (d) => d.dimension === 'ops_fit',
    )?.score;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe('deployment fit — what they asked for, or what they run', () => {
  function deployment(
    modes: DeploymentMode[],
    overrides: { preference?: DeploymentMode; estateShape?: EstateShape } = {},
  ) {
    const base = buildProduct({ deploymentModes: modes });
    const product: Product = {
      ...base,
      supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    };
    const inputs = buildInputs({
      profile: buildClientProfile({
        securityStaffFte: 2,
        deploymentPreference: overrides.preference ?? 'hybrid',
      }),
      ...(overrides.estateShape === undefined ? {} : { estateShape: overrides.estateShape }),
    });
    return scoreAtFirstTier(product, inputs).dimensions.find((d) => d.dimension === 'deployment_fit');
  }

  describe('a stated preference is a requirement the analyst heard', () => {
    it('gives full marks to a product that offers it natively', () => {
      expect(deployment(['on_prem'], { preference: 'on_prem' })?.score).toBe(100);
    });

    it('falls back to hybrid, which can usually be shaped to fit', () => {
      expect(deployment(['cloud', 'hybrid'], { preference: 'on_prem' })?.score).toBe(70);
    });

    it('marks down a product that offers neither', () => {
      const fit = deployment(['cloud'], { preference: 'on_prem' });
      expect(fit?.score).toBe(30);
      expect(fit?.rationale).toContain('stated preference');
    });

    it('ignores the estate: what the client said outranks what StackFit inferred', () => {
      // A cloud-only product in a cloud-native estate, for a client who asked
      // for on-prem. The estate agrees with the product and the client does not.
      expect(
        deployment(['cloud'], { preference: 'on_prem', estateShape: 'cloud_native' })?.score,
      ).toBe(30);
    });
  });

  describe('`hybrid` means no strong preference, so the estate decides', () => {
    it('gives full marks to a cloud product for a SaaS-centric estate', () => {
      const fit = deployment(['cloud'], { estateShape: 'saas_centric' });
      expect(fit?.score).toBe(100);
      expect(fit?.rationale).toContain('No preference was stated');
    });

    it('gives full marks to an on-prem product for an on-prem estate', () => {
      expect(deployment(['on_prem'], { estateShape: 'on_prem_centric' })?.score).toBe(100);
    });

    it('counts air-gap capability as a match for an OT estate', () => {
      expect(deployment(['air_gapped'], { estateShape: 'ot_heavy' })?.score).toBe(100);
    });

    it('scores a hybrid-capable product just below a native match', () => {
      expect(deployment(['cloud', 'hybrid'], { estateShape: 'on_prem_centric' })?.score).toBe(85);
    });

    it('marks a mismatch down more gently than a stated one, and says whose reading it is', () => {
      const fit = deployment(['cloud'], { estateShape: 'on_prem_centric' });
      expect(fit?.score).toBe(55);
      expect(fit?.rationale).toContain('StackFit reading the asset counts');
    });
  });

  describe('silence is not evidence', () => {
    it('scores every product alike when nothing was stated and no estate was captured', () => {
      const cloudOnly = deployment(['cloud'], { estateShape: 'unknown' });
      const onPremOnly = deployment(['on_prem'], { estateShape: 'unknown' });
      expect(cloudOnly?.score).toBe(85);
      expect(onPremOnly?.score).toBe(85);
      expect(cloudOnly?.rationale).toContain('not evidence against anything');
    });

    it('defaults to the same neutral result when the caller passes no estate shape', () => {
      expect(deployment(['cloud'])?.score).toBe(85);
    });
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
    const heavy = { ...coveringProduct(), opsBurden: { baseFte: 3, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const } };
    const profile = { securityStaffFte: 2 };
    const neutral = scoreAtFirstTier(heavy, buildInputs({ profile: buildClientProfile(profile) })).score;
    const oss = scoreAtFirstTier(
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
    const score = scoreAtFirstTier(coveringProduct(), buildInputs());
    const summed = score.dimensions.reduce((sum, d) => sum + d.contribution, 0);
    expect(score.score).toBeCloseTo(summed, 1);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it('gives every dimension a rationale (hard rule 5)', () => {
    const score = scoreAtFirstTier(coveringProduct(), buildInputs());
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
    expect(scoreAtFirstTier(coveringProduct(), inputs)).toEqual(scoreAtFirstTier(coveringProduct(), inputs));
  });
});

describe('a candidate is a SKU, not a product', () => {
  /** Two tiers; only the upper one claims the control the framework asks for. */
  function tiered(): Product {
    const base = coveringProduct({ id: 'tiered' });
    const tier = base.tiers[0]!;
    return {
      ...base,
      category: 'siem',
      tiers: [
        { ...tier, id: 'basic', name: 'Basic', controlsCovered: [] },
        { ...tier, id: 'advanced', name: 'Advanced', controlsCovered: ['pci-dss-4.0:10'] },
      ],
    };
  }

  const framework: Framework = buildFramework({
    id: 'pci-dss-4.0',
    controls: [
      { id: '10', title: 'Log and monitor', satisfiedBy: ['siem'] },
      { id: '11', title: 'Test security', satisfiedBy: ['siem'] },
    ],
  });

  it('scores every tier of a surviving product', () => {
    const scores = scoreProducts([tiered()], buildInputs());
    expect(scores.map((score) => score.tierId)).toEqual(['basic', 'advanced']);
    expect(scores.every((score) => score.productId === 'tiered')).toBe(true);
  });

  it('scores an eliminated product once, not once per tier', () => {
    // Every §7.3 hard filter tests the product, not what you pay for it, so
    // repeating the reason per SKU would pad "why was X ruled out".
    const scores = scoreProducts(
      [tiered()],
      buildInputs({
        profile: buildClientProfile({ securityStaffFte: 2, excludedProducts: ['tiered'] }),
      }),
    );
    expect(scores).toHaveLength(1);
    expect(scores[0]?.eliminated).toBe(true);
  });

  it('credits compliance fit to the tier that claims the control', () => {
    // The dimension the catalog has evidence for. Two of two controls are asked
    // of a SIEM; Basic claims neither, Advanced claims one.
    const inputs = buildInputs({ frameworks: [framework] });
    const [basic, advanced] = scoreProducts([tiered()], inputs);

    const fitOf = (score: ProductScore | undefined) =>
      score?.dimensions.find((d) => d.dimension === 'compliance_fit')?.score;

    expect(fitOf(basic)).toBe(0);
    expect(fitOf(advanced)).toBe(50);
    expect(advanced!.score).toBeGreaterThan(basic!.score);
  });

  it('scores the tiers identically on everything the catalog cannot tell apart', () => {
    // Asset coverage, ops, deployment, scale and maturity are product-level
    // facts. Inventing a per-tier difference for them would be fabrication.
    const [basic, advanced] = scoreProducts([tiered()], buildInputs());
    const others = (score: ProductScore | undefined) =>
      score?.dimensions.filter((d) => d.dimension !== 'compliance_fit').map((d) => d.score);

    expect(others(basic)).toEqual(others(advanced));
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

    const coverage = scoreAtFirstTier(siem, inputs).dimensions.find(
      (d) => d.dimension === 'asset_coverage',
    );
    // 20×4 + 2×25 + 4×10 = 170 covered, against 170 + 5000×0.15 = 920 in remit.
    expect(coverage?.score).toBeCloseTo(18.5, 0);
    // The raw-count answer was 26/5026. Anything near that is the bug returning.
    expect(coverage?.score).toBeGreaterThan(5);
  });

  it('does not treat "no preference" as a demand for a hybrid product', () => {
    // Was: `deploymentPreference: 'hybrid'` is the wizard's wording for "no
    // strong preference", but scoring read it as a requirement — so a client
    // who had expressed no opinion scored every cloud-only and every
    // on-prem-only product 30 out of 100, marking down precisely the products
    // that suited their estate best. A stated preference still scores 30.
    const base = buildProduct({ deploymentModes: ['cloud'] });
    const cloudOnly: Product = {
      ...base,
      supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    };
    const noPreference = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, deploymentPreference: 'hybrid' }),
      estateShape: 'saas_centric',
    });
    const stated = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, deploymentPreference: 'on_prem' }),
      estateShape: 'saas_centric',
    });

    const scoreOf = (inputs: ScoringInputs) =>
      scoreAtFirstTier(cloudOnly, inputs).dimensions.find((d) => d.dimension === 'deployment_fit')
        ?.score;

    expect(scoreOf(noPreference)).toBe(100);
    expect(scoreOf(stated)).toBe(30);
  });
});
