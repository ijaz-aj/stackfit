import type { Product, ProductCategory, ProductTier } from '@stackfit/schema';
import { describe, expect, it } from 'vitest';

import { computeProductCost, computeSizing } from '../src/index';
import {
  buildClientProfile,
  buildCostInputs,
  buildProduct,
  buildSizingAssumptions,
} from './fixtures';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

const sizingAssumptions = buildSizingAssumptions({
  windowsEndpoints: { eventsPerSecond: 0.2, role: 'endpoint', monitored: true },
  windowsServers: { eventsPerSecond: 2, role: 'server', monitored: true },
});

const inventory = {
  windowsEndpoints: { count: 400 },
  windowsServers: { count: 100 },
  networkVendors: [],
};

const profile = buildClientProfile({
  region: 'us',
  employeeCount: 400,
  itStaffCount: 6,
  securityStaffFte: 1,
});

const sizing = computeSizing(inventory, profile, sizingAssumptions);
const inputs = buildCostInputs();

function firstTier(product: Product): ProductTier {
  const tier = product.tiers[0];
  if (tier === undefined) throw new Error('fixture product has no tiers');
  return tier;
}

describe('computeProductCost: billable units per pricing model', () => {
  it('prices per endpoint against the endpoint count, not the asset count', () => {
    const product = buildProduct({
      pricing: [{ model: 'per_endpoint_year', unitPrice: usd(6000) }],
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);

    // 400 endpoints × USD 60.00 = USD 24,000. Servers are not endpoints.
    expect(cost.licenceListAnnual).toEqual(usd(2_400_000));
  });

  it('prices per node against the server count', () => {
    const product = buildProduct({ pricing: [{ model: 'per_node_year', unitPrice: usd(10_000) }] });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    // 100 servers × USD 100.00 = USD 10,000.00
    expect(cost.licenceListAnnual).toEqual(usd(1_000_000));
  });

  it('prices per user against headcount', () => {
    const product = buildProduct({ pricing: [{ model: 'per_user_year', unitPrice: usd(6240) }] });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    expect(cost.licenceListAnnual).toEqual(usd(400 * 6240));
  });

  it('prices consumption on a full year of ingest', () => {
    const product = buildProduct({
      pricing: [{ model: 'consumption', consumptionUnit: 'GB', unitPrice: usd(430) }],
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);

    // 280 EPS → gbPerDay, × 365 days × USD 4.30/GB.
    const expected = Math.round(sizing.gbPerDay * 365 * 430);
    expect(cost.licenceListAnnual.amountMinor).toBe(expected);
  });

  it('charges nothing for a zero-licence product', () => {
    const product = buildProduct({ pricing: [{ model: 'zero_licence' }] });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    expect(cost.licenceAnnual).toEqual(usd(0));
  });

  it('applies a vendor unit minimum before the unit maths', () => {
    const product = buildProduct({
      pricing: [{ model: 'per_node_year', unitPrice: usd(10_000), minimumUnits: 250 }],
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    // 100 servers, but billed at the 250 floor.
    expect(cost.licenceListAnnual).toEqual(usd(250 * 10_000));
  });

  it('applies a vendor annual spend floor after the unit maths', () => {
    const product = buildProduct({
      pricing: [{ model: 'per_node_year', unitPrice: usd(1000), minimumAnnual: usd(5_000_000) }],
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    // 100 × 10.00 = 1,000.00, floored to 50,000.00.
    expect(cost.licenceListAnnual).toEqual(usd(5_000_000));
  });

  it('selects the right band for tiered pricing', () => {
    const product = buildProduct({
      pricing: [
        {
          model: 'flat_tiered',
          tiers: [
            { minUnits: 0, maxUnits: 100, flatPrice: usd(100_000) },
            { minUnits: 101, maxUnits: null, flatPrice: usd(900_000) },
          ],
        },
      ],
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    // 500 monitored assets falls in the open-ended band.
    expect(cost.licenceListAnnual).toEqual(usd(900_000));
  });
});

describe('computeProductCost: the honest TCO (hard rule 8)', () => {
  it('never reports a zero TCO for a zero-licence product', () => {
    const wazuhLike = buildProduct({
      id: 'free-tool',
      licenceModel: 'open_source',
      pricing: [{ model: 'zero_licence' }],
      opsBurden: {
        baseFte: 0.5,
        ftePerThousandAssets: 0.3,
        confidence: 'analyst_estimate' as const,
      },
      implementation: {
        effortDays: 20,
        skillLevel: 'security_engineer',
        typicalWeeks: 8,
        confidence: 'analyst_estimate' as const,
      },
    });

    const cost = computeProductCost(wazuhLike, firstTier(wazuhLike), sizing, profile, inputs);

    expect(cost.licenceAnnual).toEqual(usd(0));
    expect(cost.tco.amountMinor).toBeGreaterThan(0);
    expect(cost.opsFteAnnual.amountMinor).toBeGreaterThan(0);
    expect(cost.implementationOneTime.amountMinor).toBeGreaterThan(0);
  });

  it('makes people and services the dominant line items for open source', () => {
    const wazuhLike = buildProduct({
      licenceModel: 'open_source',
      pricing: [{ model: 'zero_licence' }],
      opsBurden: {
        baseFte: 0.5,
        ftePerThousandAssets: 0.3,
        confidence: 'analyst_estimate' as const,
      },
      implementation: {
        effortDays: 20,
        skillLevel: 'security_engineer',
        typicalWeeks: 8,
        confidence: 'analyst_estimate' as const,
      },
    });

    const cost = computeProductCost(wazuhLike, firstTier(wazuhLike), sizing, profile, inputs);
    const peopleAndServices =
      cost.opsFteAnnual.amountMinor * 3 + cost.implementationOneTime.amountMinor;

    expect(peopleAndServices / cost.tco.amountMinor).toBeGreaterThan(0.7);
    expect(cost.rationale.join('\n')).toContain('Licence is 0% of the 3-year TCO');
  });

  it('costs open source above a cheap commercial tool once ops burden is counted', () => {
    // The comparison the whole tool exists to make. A "free" platform needing
    // 0.65 FTE is not cheaper than a USD 60/endpoint SaaS product that needs
    // almost none, and the tool has to be able to say so.
    const openSource = buildProduct({
      id: 'oss-siem',
      licenceModel: 'open_source',
      pricing: [{ model: 'zero_licence' }],
      opsBurden: {
        baseFte: 0.5,
        ftePerThousandAssets: 0.3,
        confidence: 'analyst_estimate' as const,
      },
      implementation: {
        effortDays: 20,
        skillLevel: 'security_engineer',
        typicalWeeks: 8,
        confidence: 'analyst_estimate' as const,
      },
    });

    const commercial = buildProduct({
      id: 'saas-edr',
      licenceModel: 'commercial',
      deploymentModes: ['cloud'],
      pricing: [{ model: 'per_endpoint_year', unitPrice: usd(6000) }],
      opsBurden: {
        baseFte: 0.1,
        ftePerThousandAssets: 0.1,
        confidence: 'analyst_estimate' as const,
      },
      implementation: {
        effortDays: 3,
        skillLevel: 'generalist',
        typicalWeeks: 2,
        confidence: 'analyst_estimate' as const,
      },
    });

    const ossCost = computeProductCost(openSource, firstTier(openSource), sizing, profile, inputs);
    const commercialCost = computeProductCost(
      commercial,
      firstTier(commercial),
      sizing,
      profile,
      inputs,
    );

    expect(ossCost.licenceAnnual.amountMinor).toBeLessThan(
      commercialCost.licenceAnnual.amountMinor,
    );
    expect(ossCost.tco.amountMinor).toBeGreaterThan(commercialCost.tco.amountMinor);
  });

  it('scales ops FTE with the estate, not just the base figure', () => {
    const product = buildProduct({
      pricing: [{ model: 'zero_licence' }],
      opsBurden: {
        baseFte: 0.5,
        ftePerThousandAssets: 0.3,
        confidence: 'analyst_estimate' as const,
      },
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);

    // 0.5 base + 0.3 × (500 / 1000) = 0.65
    expect(cost.opsFte).toBeCloseTo(0.65, 10);
  });

  it('warns when a product needs more FTE than the client has', () => {
    const heavy = buildProduct({
      pricing: [{ model: 'zero_licence' }],
      opsBurden: { baseFte: 2, ftePerThousandAssets: 1, confidence: 'analyst_estimate' as const },
    });
    const cost = computeProductCost(heavy, firstTier(heavy), sizing, profile, inputs);
    expect(cost.rationale.join('\n')).toContain('not affordable in people');
  });

  it('charges infrastructure for self-hosted products and not for SaaS', () => {
    const selfHosted = buildProduct({
      pricing: [{ model: 'zero_licence' }],
      deploymentModes: ['on_prem', 'air_gapped'],
    });
    const saas = buildProduct({
      pricing: [{ model: 'zero_licence' }],
      deploymentModes: ['cloud'],
    });

    const selfHostedCost = computeProductCost(
      selfHosted,
      firstTier(selfHosted),
      sizing,
      profile,
      inputs,
    );
    const saasCost = computeProductCost(saas, firstTier(saas), sizing, profile, inputs);

    expect(selfHostedCost.infraAnnual.amountMinor).toBeGreaterThan(0);
    expect(saasCost.infraAnnual.amountMinor).toBe(0);
  });

  it('sizes infrastructure from what the category runs on, not from log volume', () => {
    // Was: every self-hostable product was sized from sizing.gbPerDay and
    // charged the SIEM's log-retention storage, so a honeypot and a SIEM came
    // out at exactly the same number. A bundle with eleven self-hosted products
    // counted one log-volume figure eleven times: on a 300-bed hospital that
    // was about USD 69,500/yr of infrastructure, and thirteen identical
    // segments on the cost-by-category chart.
    const selfHosted = (category: ProductCategory) => ({
      ...buildProduct({ pricing: [{ model: 'zero_licence' }], deploymentModes: ['on_prem'] }),
      category,
    });

    const infraFor = (category: ProductCategory) => {
      const product = selfHosted(category);
      return computeProductCost(product, firstTier(product), sizing, profile, inputs).infraAnnual
        .amountMinor;
    };

    // The fixture gives siem and ndr the log-ingest basis and everything else a
    // flat floor, which is the shape of the committed config.
    expect(infraFor('siem')).toBeGreaterThan(infraFor('deception'));
    expect(infraFor('ndr')).toBeGreaterThan(infraFor('deception'));

    // And a non-log category pays nothing toward log retention, which was the
    // other half of the same error.
    expect(infraFor('deception')).toBe(infraFor('pam'));
    expect(infraFor('deception')).toBeGreaterThan(0);
  });

  it('says in the rationale which quantity it sized the infrastructure from', () => {
    // A number with no explanation does not ship (hard rule 5), and "4 vCPU"
    // means nothing without "to carry what".
    const siem = {
      ...buildProduct({ pricing: [{ model: 'zero_licence' }], deploymentModes: ['on_prem'] }),
      category: 'siem' as const,
    };
    const decoy = {
      ...buildProduct({ pricing: [{ model: 'zero_licence' }], deploymentModes: ['on_prem'] }),
      category: 'deception' as const,
    };

    const siemRationale = computeProductCost(
      siem,
      firstTier(siem),
      sizing,
      profile,
      inputs,
    ).rationale.join('\n');
    const decoyRationale = computeProductCost(
      decoy,
      firstTier(decoy),
      sizing,
      profile,
      inputs,
    ).rationale.join('\n');

    expect(siemRationale).toContain('GB/day of ingest');
    expect(siemRationale).toContain('log retention');

    expect(decoyRationale).not.toContain('GB/day of ingest');
    expect(decoyRationale).toContain('no log-retention storage');
  });
});

describe('computeProductCost: how well grounded the effort figures are', () => {
  it('carries the confidence onto the cost, where the FTE number is read', () => {
    // Same principle as `pricingConfidence` and `freshness`: the grading has to
    // travel with the number, not stay in the file it came from. The FTE line
    // is what decides whether a zero-licence tool is cheap or expensive.
    const product = buildProduct({
      opsBurden: { confidence: 'field_measured' },
      implementation: { confidence: 'vendor_documented' },
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);

    expect(cost.opsBurdenConfidence).toBe('field_measured');
    expect(cost.implementationConfidence).toBe('vendor_documented');
    expect(cost.rationale.join(' ')).toContain('field measured confidence');
  });

  it('warns when nobody has researched what it takes to run the product', () => {
    const product = buildProduct({
      opsBurden: { confidence: 'placeholder' },
      notes: 'TODO: staffing not researched.',
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);

    expect(cost.opsBurdenConfidence).toBe('placeholder');
    expect(cost.rationale.join(' ')).toContain('Nobody has researched');
  });
});

describe('computeProductCost: discounting is an assumption, stated out loud', () => {
  it('leaves SMB spend at list', () => {
    const product = buildProduct({
      pricing: [{ model: 'per_node_year', unitPrice: usd(1000) }],
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    expect(cost.discountRate).toBe(0);
    expect(cost.licenceAnnual).toEqual(cost.licenceListAnnual);
  });

  it('discounts an enterprise-sized spend and says it did', () => {
    const product = buildProduct({
      pricing: [{ model: 'per_node_year', unitPrice: usd(500_000) }],
    });
    const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);

    expect(cost.discountRate).toBe(0.25);
    expect(cost.licenceAnnual.amountMinor).toBe(cost.licenceListAnnual.amountMinor * 0.75);
    expect(cost.rationale.join('\n')).toContain('This is an assumption, not a quoted discount');
  });
});

describe('computeProductCost: multi-year view', () => {
  const product = buildProduct({
    pricing: [{ model: 'per_node_year', unitPrice: usd(1000) }],
    deploymentModes: ['cloud'],
    opsBurden: { baseFte: 0, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
    implementation: {
      effortDays: 10,
      skillLevel: 'generalist',
      typicalWeeks: 2,
      confidence: 'analyst_estimate' as const,
    },
  });

  const cost = computeProductCost(product, firstTier(product), sizing, profile, inputs);

  it('returns one cashflow entry per year of the horizon', () => {
    expect(cost.cashflowByYear).toHaveLength(3);
    expect(cost.horizonYears).toBe(3);
  });

  it('puts one-off costs in year 1 only', () => {
    const [year1, year2] = cost.cashflowByYear;
    expect(year1?.amountMinor).toBeGreaterThan(year2?.amountMinor ?? 0);
  });

  it('compounds the licence uplift from year 2', () => {
    const [, year2, year3] = cost.cashflowByYear;
    // 100 nodes × 10.00 = 1,000.00 licence, +5% then +10.25%.
    expect(year2).toEqual(usd(Math.round(100_000 * 1.05)));
    expect(year3).toEqual(usd(Math.round(100_000 * 1.05 ** 2)));
  });

  it('sums TCO from the cashflow, so the two can never disagree', () => {
    const summed = cost.cashflowByYear.reduce((total, year) => total + year.amountMinor, 0);
    expect(cost.tco.amountMinor).toBe(summed);
  });
});

describe('computeProductCost: currency', () => {
  it('reports every figure in the client budget currency', () => {
    const inrProfile = buildClientProfile({
      region: 'in',
      employeeCount: 400,
      budget: { annualCap: null, oneTimeCap: null, currency: 'INR', horizonYears: 3 },
    });
    const product = buildProduct({ pricing: [{ model: 'per_node_year', unitPrice: usd(10_000) }] });
    const cost = computeProductCost(product, firstTier(product), sizing, inrProfile, inputs);

    expect(cost.currency).toBe('INR');
    expect(cost.licenceAnnual.currency).toBe('INR');
    expect(cost.opsFteAnnual.currency).toBe('INR');
    expect(cost.tco.currency).toBe('INR');
  });

  it('gives consistent totals in USD and INR under the configured rate (§12.7)', () => {
    const product = buildProduct({
      pricing: [{ model: 'per_node_year', unitPrice: usd(10_000) }],
      deploymentModes: ['cloud'],
      opsBurden: { baseFte: 0, ftePerThousandAssets: 0, confidence: 'analyst_estimate' as const },
      implementation: {
        effortDays: 0,
        skillLevel: 'generalist',
        typicalWeeks: 0,
        confidence: 'analyst_estimate' as const,
      },
    });

    const usdCost = computeProductCost(product, firstTier(product), sizing, profile, inputs);
    const inrCost = computeProductCost(
      product,
      firstTier(product),
      sizing,
      buildClientProfile({
        region: 'us',
        employeeCount: 400,
        budget: { annualCap: null, oneTimeCap: null, currency: 'INR', horizonYears: 3 },
      }),
      inputs,
    );

    // Same scenario, same rate: the INR total must equal the USD total
    // converted, within rounding of a single minor unit per summed line.
    const expectedInr = (usdCost.tco.amountMinor * 94_843_169) / 1_000_000;
    const drift = Math.abs(inrCost.tco.amountMinor - expectedInr);
    expect(drift / expectedInr).toBeLessThan(0.0001);
  });
});
