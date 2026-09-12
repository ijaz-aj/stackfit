// Fit scoring (PROJECT_SPEC §7.3).
//
// The arithmetic is checked against hand-workable numbers from the fixtures,
// not against the committed weights — those are exercised by the worked
// examples in the repo-root `data` project, so a tuning change does not break
// a unit test that was meant to assert the formula.

import type {
  AssetInventory,
  ClientEnvironment,
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
      profile: buildClientProfile({ securityStaffFte: 2, environment: 'air_gapped' }),
    });
    expect(hardFilter(product, inputs).join(' ')).toContain('air-gapped');
  });

  it('does not eliminate a cloud product for an on-premises estate', () => {
    // Where a client's assets live and how a tool is delivered are different
    // questions. A cloud-delivered EDR protects on-premises endpoints perfectly
    // well, so this belongs in the score, not the filter — eliminating here
    // would remove every cloud-delivered product from every on-prem client.
    const base = buildProduct({ deploymentModes: ['cloud'] });
    const cloudOnly = { ...base, supports: { ...base.supports, deviceClasses: ['server' as const] } };
    const inputs = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, environment: 'on_prem' }),
    });
    expect(hardFilter(cloudOnly, inputs)).toEqual([]);
    expect(hardFilter(coveringProduct(), inputs)).toEqual([]);
  });

  describe('a procurement policy does eliminate, because it is a rule not a fit', () => {
    function withModes(modes: DeploymentMode[]) {
      const base = buildProduct({ deploymentModes: modes });
      return { ...base, supports: { ...base.supports, deviceClasses: ['server' as const] } };
    }

    it('rules out a cloud-only product where SaaS is not permitted', () => {
      const inputs = buildInputs({
        profile: buildClientProfile({
          securityStaffFte: 2,
          environment: 'on_prem',
          deploymentConstraint: 'saas_not_permitted',
        }),
      });
      expect(hardFilter(withModes(['cloud']), inputs).join(' ')).toContain('cloud-only');
    });

    it('keeps a product that can also be self-hosted', () => {
      // A hybrid mode satisfies the policy: it can be delivered the permitted way.
      const inputs = buildInputs({
        profile: buildClientProfile({
          securityStaffFte: 2,
          environment: 'on_prem',
          deploymentConstraint: 'saas_not_permitted',
        }),
      });
      expect(hardFilter(withModes(['cloud', 'hybrid']), inputs)).toEqual([]);
      expect(hardFilter(withModes(['on_prem']), inputs)).toEqual([]);
    });

    it('rules out a self-hosted-only product for a client who will not self-host', () => {
      const inputs = buildInputs({
        profile: buildClientProfile({
          securityStaffFte: 2,
          environment: 'cloud',
          deploymentConstraint: 'self_hosted_not_permitted',
        }),
      });
      expect(hardFilter(withModes(['on_prem']), inputs).join(' ')).toContain('will not self-host');
      expect(hardFilter(withModes(['cloud']), inputs)).toEqual([]);
    });

    it('eliminates nothing when no policy was stated', () => {
      const inputs = buildInputs({
        profile: buildClientProfile({ securityStaffFte: 2, environment: 'cloud' }),
      });
      for (const modes of [['cloud'], ['on_prem'], ['cloud', 'hybrid']] as DeploymentMode[][]) {
        expect(hardFilter(withModes(modes), inputs)).toEqual([]);
      }
    });
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
    expect(Number.isNaN(fit?.score ?? NaN)).toBe(false);
    expect(fit?.score).toBeGreaterThan(0);
  });

  it('still separates a managed service from a self-hosted platform at zero staff', () => {
    // Was: the zero-staff branch returned a flat constant for every product, so
    // a service needing almost no client-side effort and a platform needing
    // most of an engineer scored identically — for the client who cares about
    // the difference more than anyone. PROJECT_SPEC §12.2 requires the
    // opposite, and the flat score made it unassertable.
    const inputs = buildInputs({ profile: buildClientProfile({ securityStaffFte: 0 }) });

    const opsFitOf = (baseFte: number) =>
      scoreAtFirstTier(
        {
          ...coveringProduct(),
          opsBurden: { baseFte, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
        },
        inputs,
      ).dimensions.find((d) => d.dimension === 'ops_fit')?.score ?? -1;

    const managed = opsFitOf(0.1);
    const selfHosted = opsFitOf(0.6);

    expect(managed).toBeGreaterThan(selfHosted);
    // Past the unusable threshold everything sits on the floor together, which
    // is correct: at that point the client cannot run any of them.
    expect(selfHosted).toBe(15);
    expect(opsFitOf(2)).toBe(15);
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
    overrides: { environment?: ClientEnvironment; estateShape?: EstateShape } = {},
  ) {
    const base = buildProduct({ deploymentModes: modes });
    const product: Product = {
      ...base,
      supports: { ...base.supports, deviceClasses: ['server', 'workstation'] },
    };
    const inputs = buildInputs({
      profile: buildClientProfile({
        securityStaffFte: 2,
        environment: overrides.environment ?? 'not_asked',
      }),
      ...(overrides.estateShape === undefined ? {} : { estateShape: overrides.estateShape }),
    });
    return scoreAtFirstTier(product, inputs).dimensions.find((d) => d.dimension === 'deployment_fit');
  }

  describe('the environment the client runs is a fact, not a wish', () => {
    it('gives full marks to a product that offers it natively', () => {
      expect(deployment(['on_prem'], { environment: 'on_prem' })?.score).toBe(100);
    });

    it('falls back to hybrid, which can usually be shaped to fit', () => {
      expect(deployment(['cloud', 'hybrid'], { environment: 'on_prem' })?.score).toBe(70);
    });

    it('marks down a product that offers neither', () => {
      const fit = deployment(['cloud'], { environment: 'on_prem' });
      expect(fit?.score).toBe(30);
      expect(fit?.rationale).toContain('environment the client');
    });

    it('ignores the estate: what the client said outranks what StackFit inferred', () => {
      // A cloud-only product in a cloud-native estate, for a client who asked
      // for on-prem. The estate agrees with the product and the client does not.
      expect(
        deployment(['cloud'], { environment: 'on_prem', estateShape: 'cloud_native' })?.score,
      ).toBe(30);
    });
  });

  describe('`not_asked` is the only value that lets the estate decide', () => {
    it('gives full marks to a cloud product for a SaaS-centric estate', () => {
      const fit = deployment(['cloud'], { estateShape: 'saas_centric' });
      expect(fit?.score).toBe(100);
      expect(fit?.rationale).toContain('environment was not asked');
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

  describe('a hybrid client runs both, so both delivery models are native to them', () => {
    // The defect this pins: `hybrid` used to be the wizard's wording for "no
    // strong preference", so a client who genuinely ran both had their answer
    // discarded, was scored by inference from asset counts, and was told in
    // writing on a client-facing page that "no preference was stated".

    it('gives full marks to a product that deploys either way', () => {
      const fit = deployment(['cloud', 'hybrid'], { environment: 'hybrid' });
      expect(fit?.score).toBe(100);
      expect(fit?.rationale).toContain('covers both halves');
    });

    it('treats a cloud-only product as a real fit, not a mismatch', () => {
      // 85, not 30. They run cloud — it is native to half their estate.
      const fit = deployment(['cloud'], { environment: 'hybrid' });
      expect(fit?.score).toBe(85);
      expect(fit?.rationale).toContain('native to the cloud half');
    });

    it('treats an on-prem-only product the same way, from the other side', () => {
      const fit = deployment(['on_prem'], { environment: 'hybrid' });
      expect(fit?.score).toBe(85);
      expect(fit?.rationale).toContain('native to the on-premises half');
    });

    it('never claims the client said nothing, and never reads the estate instead', () => {
      // The sentence that reached a client-facing proposal for a client who
      // had answered the question.
      for (const modes of [['cloud'], ['on_prem'], ['cloud', 'hybrid']] as const) {
        const fit = deployment([...modes], { environment: 'hybrid', estateShape: 'saas_centric' });
        expect(fit?.rationale).not.toContain('not asked');
        expect(fit?.rationale).not.toContain('StackFit reading the asset counts');
      }
    });

    it('is unmoved by the estate, because the client stated it', () => {
      const inSaasEstate = deployment(['on_prem'], { environment: 'hybrid', estateShape: 'saas_centric' });
      const inOnPremEstate = deployment(['on_prem'], { environment: 'hybrid', estateShape: 'on_prem_centric' });
      expect(inSaasEstate?.score).toBe(inOnPremEstate?.score);
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

describe('tier limits — the conditions attached to a SKU, not to a product', () => {
  /** A free tier capped at 10 users, and a paid tier with no cap. */
  function cappedFreeTier(): Product {
    const base = coveringProduct({ id: 'capped' });
    const tier = base.tiers[0]!;
    return {
      ...base,
      tiers: [
        {
          ...tier,
          id: 'free',
          name: 'Free',
          limits: {
            caps: [{ unit: 'users', maxUnits: 10, note: 'Vendor states "Add up to 10 users".' }],
            prerequisites: [],
            allowances: [],
          },
        },
        { ...tier, id: 'paid', name: 'Paid' },
      ],
    };
  }

  it('eliminates only the tier whose cap the environment exceeds', () => {
    // The point of the whole field. Duo Free is capped at ten users and Duo
    // Essentials is not; eliminating the product would lose both.
    const inputs = buildInputs({ profile: buildClientProfile({ employeeCount: 60 }) });
    const scores = scoreProducts([cappedFreeTier()], inputs);

    const free = scores.find((score) => score.tierId === 'free');
    const paid = scores.find((score) => score.tierId === 'paid');

    expect(free?.eliminated).toBe(true);
    expect(paid?.eliminated).toBe(false);
    expect(free?.eliminationReasons.join(' ')).toContain('capped at 10 users');
    expect(free?.eliminationReasons.join(' ')).toContain('Add up to 10 users');
  });

  it('leaves a capped tier alone when the environment is inside the cap', () => {
    const inputs = buildInputs({ profile: buildClientProfile({ employeeCount: 8 }) });
    const free = scoreProducts([cappedFreeTier()], inputs).find(
      (score) => score.tierId === 'free',
    );
    expect(free?.eliminated).toBe(false);
  });

  it('treats an unconfirmed prerequisite as unmet', () => {
    // The Entra ID Free shape: free, but only inside a subscription the client
    // has to already hold. Unmet by default is the whole point — assuming
    // otherwise lets a zero-cost tier beat every priced option on a client who
    // cannot take it.
    const base = coveringProduct({ id: 'bundled' });
    const tier = base.tiers[0]!;
    const product: Product = {
      ...base,
      tiers: [
        {
          ...tier,
          limits: {
            caps: [],
            prerequisites: [
              {
                description: 'an Azure or Microsoft 365 subscription',
                satisfiedByRetainedTool: ['microsoft-365', 'azure-subscription'],
              },
            ],
            allowances: [],
          },
        },
      ],
    };

    const withoutIt = scoreProducts([product], buildInputs())[0];
    expect(withoutIt?.eliminated).toBe(true);
    expect(withoutIt?.eliminationReasons.join(' ')).toContain(
      'an Azure or Microsoft 365 subscription',
    );
    expect(withoutIt?.eliminationReasons.join(' ')).toContain('retainedTools');

    const withIt = scoreProducts(
      [product],
      buildInputs({ profile: buildClientProfile({ retainedTools: ['microsoft-365'] }) }),
    )[0];
    expect(withIt?.eliminated).toBe(false);
  });

  it('never eliminates on an allowance, and says so in the rationale', () => {
    // Live workflows and metered executions are not quantities the sizing stage
    // produces, so they cannot be enforced. Carrying them into the rationale is
    // the honest alternative to pretending they can be.
    const base = coveringProduct({ id: 'metered' });
    const tier = base.tiers[0]!;
    const product: Product = {
      ...base,
      tiers: [
        {
          ...tier,
          limits: { caps: [], prerequisites: [], allowances: ['Three live workflows.'] },
        },
      ],
    };

    const score = scoreProducts([product], buildInputs())[0];
    expect(score?.eliminated).toBe(false);
    expect(score?.rationale.join(' ')).toContain('Three live workflows.');
    expect(score?.rationale.join(' ')).toContain('not checked by StackFit');
  });

  it('measures each cap against the sizing figure it names', () => {
    // A cap read against the wrong quantity eliminates the wrong tiers, which
    // is the same failure mode billableUnitsFor exists to prevent in costing.
    // The fixture gives every asset class role 'server' by default, so
    // windowsEndpoints has to be told it is an endpoint for this to mean
    // anything — which is itself the point being tested.
    const inv = inventory({ windowsEndpoints: 40, windowsServers: 4 });
    const profile = buildClientProfile({ securityStaffFte: 2 });
    const inputs = buildInputs({
      inventory: inv,
      profile,
      sizing: computeSizing(
        inv,
        profile,
        buildSizingAssumptions({ windowsEndpoints: { role: 'endpoint' } }),
      ),
    });

    const cappedOn = (unit: 'endpoints' | 'servers', maxUnits: number) => {
      const base = coveringProduct({ id: `capped-${unit}` });
      const tier = base.tiers[0]!;
      const product: Product = {
        ...base,
        tiers: [
          {
            ...tier,
            limits: {
              caps: [{ unit, maxUnits, note: 'test fixture' }],
              prerequisites: [],
              allowances: [],
            },
          },
        ],
      };
      return scoreProducts([product], inputs)[0]?.eliminated;
    };

    // 40 endpoints and 4 servers: a 10-endpoint cap bites, a 10-server one does not.
    expect(cappedOn('endpoints', 10)).toBe(true);
    expect(cappedOn('servers', 10)).toBe(false);
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
    // Was: `environment: 'not_asked'` is the wizard's wording for "no
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
      profile: buildClientProfile({ securityStaffFte: 2, environment: 'not_asked' }),
      estateShape: 'saas_centric',
    });
    const stated = buildInputs({
      profile: buildClientProfile({ securityStaffFte: 2, environment: 'on_prem' }),
      estateShape: 'saas_centric',
    });

    const scoreOf = (inputs: ScoringInputs) =>
      scoreAtFirstTier(cloudOnly, inputs).dimensions.find((d) => d.dimension === 'deployment_fit')
        ?.score;

    expect(scoreOf(noPreference)).toBe(100);
    expect(scoreOf(stated)).toBe(30);
  });
});
