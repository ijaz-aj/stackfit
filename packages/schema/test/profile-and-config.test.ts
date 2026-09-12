import { describe, expect, it } from 'vitest';

import {
  AssetInventory,
  Budget,
  ClientProfile,
  Framework,
  FX_RATE_SCALE,
  FxConfig,
  StoredClientProfile,
} from '../src/index';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

describe('Budget', () => {
  it('accepts caps in the budget currency', () => {
    const result = Budget.safeParse({
      annualCap: usd(2_500_000),
      oneTimeCap: usd(1_000_000),
      currency: 'USD',
      horizonYears: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a cap in a different currency from the budget', () => {
    const result = Budget.safeParse({
      annualCap: { amountMinor: 2_500_000, currency: 'INR' },
      oneTimeCap: null,
      currency: 'USD',
      horizonYears: 3,
    });
    expect(result.success).toBe(false);
  });

  it('distinguishes an unstated cap (null) from a zero cap', () => {
    const unstated = Budget.parse({
      annualCap: null,
      oneTimeCap: null,
      currency: 'USD',
      horizonYears: 3,
    });
    const zero = Budget.parse({
      annualCap: usd(0),
      oneTimeCap: usd(0),
      currency: 'USD',
      horizonYears: 3,
    });
    expect(unstated.annualCap).toBeNull();
    expect(zero.annualCap).toEqual(usd(0));
  });

  it('defaults the horizon to 3 years', () => {
    const budget = Budget.parse({ annualCap: null, oneTimeCap: null, currency: 'INR' });
    expect(budget.horizonYears).toBe(3);
  });
});

describe('ClientProfile', () => {
  const base = {
    orgName: 'Acme Retail',
    industry: 'retail',
    region: 'in',
    employeeCount: 60,
    itStaffCount: 3,
    securityStaffFte: 0,
    deliveryModel: 'client_operated',
    riskTolerance: 'medium',
    dataSensitivity: 'regulated',
    compliance: ['pci-dss-4.0'],
    budget: { annualCap: null, oneTimeCap: null, currency: 'INR' },
    environment: 'not_asked',
    deploymentConstraint: 'none',
    procurementBias: 'open_source_first',
  };

  it('accepts zero security staff, which is the important case', () => {
    const profile = ClientProfile.parse(base);
    expect(profile.securityStaffFte).toBe(0);
    expect(profile.retainedTools).toEqual([]);
  });

  it('rejects an unknown compliance framework', () => {
    const result = ClientProfile.safeParse({ ...base, compliance: ['iso-9001'] });
    expect(result.success).toBe(false);
  });

  it('rejects a negative headcount', () => {
    expect(ClientProfile.safeParse({ ...base, employeeCount: -1 }).success).toBe(false);
  });
});

describe('AssetInventory', () => {
  it('treats every asset class as optional: scoping calls are incomplete', () => {
    const inventory = AssetInventory.parse({});
    expect(inventory.networkVendors).toEqual([]);
    expect(inventory.windowsServers).toBeUndefined();
  });

  it('accepts a partial inventory with criticality flags', () => {
    const result = AssetInventory.safeParse({
      windowsServers: { count: 6, criticality: 'high' },
      iotCctvPosDevices: { count: 40, internetFacing: false },
      networkVendors: ['cisco'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown asset class rather than silently dropping it', () => {
    expect(AssetInventory.safeParse({ mainframes: { count: 2 } }).success).toBe(false);
  });

  it('rejects a fractional asset count', () => {
    expect(AssetInventory.safeParse({ linuxServers: { count: 2.5 } }).success).toBe(false);
  });
});

describe('FxConfig', () => {
  const base = {
    base: 'USD',
    asOf: '2026-09-09',
    rates: [
      { currency: 'USD', rateMicros: FX_RATE_SCALE },
      { currency: 'INR', rateMicros: 83_250_000 },
      { currency: 'EUR', rateMicros: 920_000 },
    ],
    sources: [{ url: 'https://example.com/fx', asOf: '2026-09-09' }],
  };

  it('accepts a complete rate table', () => {
    expect(FxConfig.safeParse(base).success).toBe(true);
  });

  it('rejects a base currency whose rate is not exactly 1', () => {
    const result = FxConfig.safeParse({
      ...base,
      rates: [{ ...base.rates[0], rateMicros: 999_999 }, ...base.rates.slice(1)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a table missing a supported currency', () => {
    const result = FxConfig.safeParse({ ...base, rates: base.rates.slice(0, 2) });
    expect(result.success).toBe(false);
  });

  it('rejects a fractional rate: rates are integers in millionths', () => {
    const result = FxConfig.safeParse({
      ...base,
      rates: [base.rates[0], { currency: 'INR', rateMicros: 83.25 }, base.rates[2]],
    });
    expect(result.success).toBe(false);
  });
});

describe('Framework', () => {
  it('rejects duplicate control ids', () => {
    const result = Framework.safeParse({
      id: 'cis-v8',
      name: 'CIS Critical Security Controls',
      sourceQuality: 'publisher_verified',
      version: 'v8',
      controls: [
        { id: '1', title: 'Inventory and Control of Enterprise Assets' },
        { id: '1', title: 'Duplicate' },
      ],
      sources: [{ url: 'https://example.com/controls', asOf: '2026-09-09' }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults a control to advisory rather than mandatory', () => {
    const framework = Framework.parse({
      id: 'cis-v8',
      name: 'CIS Critical Security Controls',
      sourceQuality: 'publisher_verified',
      version: 'v8',
      controls: [{ id: '8', title: 'Audit Log Management', satisfiedBy: ['siem'] }],
      sources: [{ url: 'https://example.com/controls', asOf: '2026-09-09' }],
    });
    expect(framework.controls[0]?.mandatory).toBe(false);
  });
});

describe('profiles saved before the environment split', () => {
  // `deploymentPreference` carried two questions in one field, and `hybrid` was
  // the wizard's own wording for "no strong preference". Stored scenarios have
  // to keep meaning what they meant, and without this every saved row would
  // read as unparseable the moment the schema changed.
  const legacy = {
    orgName: 'Acme Retail',
    industry: 'retail',
    region: 'in',
    employeeCount: 60,
    itStaffCount: 3,
    securityStaffFte: 0,
    deliveryModel: 'client_operated',
    riskTolerance: 'medium',
    dataSensitivity: 'regulated',
    compliance: ['pci-dss-4.0'],
    budget: { annualCap: null, oneTimeCap: null, currency: 'INR' },
    procurementBias: 'open_source_first',
  } as const;

  it('reads a legacy "hybrid" as not_asked, because that is what it meant', () => {
    // Mapping it to `hybrid` would silently change what the client said: from
    // "we did not discuss it" into "we run both".
    const parsed = StoredClientProfile.parse({ ...legacy, deploymentPreference: 'hybrid' });
    expect((parsed as ClientProfile).environment).toBe('not_asked');
  });

  it('carries the other three values across unchanged', () => {
    for (const mode of ['cloud', 'on_prem', 'air_gapped'] as const) {
      const parsed = StoredClientProfile.parse({ ...legacy, deploymentPreference: mode });
      expect((parsed as ClientProfile).environment).toBe(mode);
    }
  });

  it('defaults the constraint rather than rejecting a row that predates it', () => {
    const parsed = StoredClientProfile.parse({ ...legacy, deploymentPreference: 'cloud' });
    expect((parsed as ClientProfile).deploymentConstraint).toBe('none');
  });

  it('refuses to guess at a legacy value it does not recognise', () => {
    // Better an unreadable row the analyst is told about than an invented one.
    const result = StoredClientProfile.safeParse({ ...legacy, deploymentPreference: 'on_a_boat' });
    expect(result.success).toBe(false);
  });

  it('leaves a current profile completely alone', () => {
    const current = {
      ...legacy,
      environment: 'hybrid',
      deploymentConstraint: 'saas_not_permitted',
    };
    const parsed = StoredClientProfile.parse(current);
    expect((parsed as ClientProfile).environment).toBe('hybrid');
    expect((parsed as ClientProfile).deploymentConstraint).toBe('saas_not_permitted');
  });
});

describe('profiles saved before hasSoc became deliveryModel', () => {
  // The old field asked what monitoring the client already had; the new one
  // asks who will operate what we recommend. Not a rename, so the mapping is a
  // reading of the old answer and every entry loses something.
  const legacy = {
    orgName: 'Acme Retail',
    industry: 'retail',
    region: 'in',
    employeeCount: 60,
    itStaffCount: 3,
    securityStaffFte: 0,
    riskTolerance: 'medium',
    dataSensitivity: 'regulated',
    compliance: ['pci-dss-4.0'],
    budget: { annualCap: null, oneTimeCap: null, currency: 'INR' },
    environment: 'hybrid',
    procurementBias: 'open_source_first',
  } as const;

  it('reads "outsourced" as us, because on this tool that is who it meant', () => {
    const parsed = StoredClientProfile.parse({ ...legacy, hasSoc: 'outsourced' });
    expect((parsed as ClientProfile).deliveryModel).toBe('mssp_managed');
  });

  it('does not read "none" as a sale', () => {
    // The mapping that matters most. Nobody watching is not evidence that we
    // were engaged to watch, and reading it as managed would quietly upgrade
    // every old row into an engagement that was never agreed.
    const parsed = StoredClientProfile.parse({ ...legacy, hasSoc: 'none' });
    expect((parsed as ClientProfile).deliveryModel).toBe('client_operated');
  });

  it('reads a round-the-clock rota as a client who runs their own', () => {
    const parsed = StoredClientProfile.parse({ ...legacy, hasSoc: '24x7' });
    expect((parsed as ClientProfile).deliveryModel).toBe('client_operated');
  });

  it('reads business hours as a split', () => {
    const parsed = StoredClientProfile.parse({ ...legacy, hasSoc: 'business_hours' });
    expect((parsed as ClientProfile).deliveryModel).toBe('co_managed');
  });

  it('refuses to guess at a legacy value it does not recognise', () => {
    // Better an unreadable row the analyst is told about than an invented one.
    const result = StoredClientProfile.safeParse({ ...legacy, hasSoc: 'sometimes' });
    expect(result.success).toBe(false);
  });

  it('migrates a row that predates both changes at once', () => {
    // The realistic case: a row saved before either split carries both old
    // fields, and one preprocess pass has to handle both.
    const parsed = StoredClientProfile.parse({
      ...legacy,
      environment: undefined,
      deploymentPreference: 'hybrid',
      hasSoc: 'outsourced',
    });
    expect((parsed as ClientProfile).environment).toBe('not_asked');
    expect((parsed as ClientProfile).deliveryModel).toBe('mssp_managed');
  });

  it('leaves a current profile completely alone', () => {
    const parsed = StoredClientProfile.parse({ ...legacy, deliveryModel: 'co_managed' });
    expect((parsed as ClientProfile).deliveryModel).toBe('co_managed');
  });
});
