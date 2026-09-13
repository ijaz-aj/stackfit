import { describe, expect, it } from 'vitest';

import { administrationFte, monitoringFte } from '../src/staffing';
import { buildProduct, buildStaffingModel } from './fixtures';

/** Elastic Security's committed coefficients, the ones the worked examples use. */
const siem = buildProduct({ opsBurden: { baseFte: 0.5, ftePerThousandAssets: 0.3, confidence: 'analyst_estimate' } });

/** The committed model: sublinear, with real deployment-mode multipliers. */
const real = buildStaffingModel({
  administration: {
    scaleExponent: 0.75,
    referenceAssets: 1000,
    byDeploymentMode: [
      { mode: 'cloud', multiplier: 0.6, basis: 'vendor hosts it' },
      { mode: 'hybrid', multiplier: 0.85, basis: 'split' },
      { mode: 'on_prem', multiplier: 1, basis: 'baseline' },
      { mode: 'air_gapped', multiplier: 1.25, basis: 'manual updates' },
    ],
    basis: 'test',
  },
});

describe('administrationFte', () => {
  /**
   * The anchor that makes this change safe. At the reference estate the scale
   * factor is exactly 1 whatever the exponent, so all 65 `opsBurden`
   * coefficients in the catalog still mean what their author intended.
   */
  it('is unchanged from the linear model at the reference estate', () => {
    const result = administrationFte(siem, 1000, 'on_prem', real);

    expect(result.fte).toBeCloseTo(0.5 + 0.3, 6);
  });

  /**
   * The defect this replaced. A linear per-asset term asked for 15.5 FTE to
   * administer a single SIEM across 50,000 assets, which is not a number
   * anybody could take to a client.
   */
  it('no longer asks for fifteen people to administer one SIEM', () => {
    const linear = 0.5 + (0.3 * 50_000) / 1000;
    const result = administrationFte(siem, 50_000, 'on_prem', real);

    expect(linear).toBeCloseTo(15.5, 1);
    expect(result.fte).toBeLessThan(7);
    expect(result.fte).toBeGreaterThan(5);
  });

  it('scales sublinearly: ten times the estate is far less than ten times the effort', () => {
    const small = administrationFte(siem, 1_000, 'on_prem', real);
    const large = administrationFte(siem, 10_000, 'on_prem', real);

    const variableSmall = small.fte - siem.opsBurden.baseFte;
    const variableLarge = large.fte - siem.opsBurden.baseFte;

    expect(variableLarge).toBeGreaterThan(variableSmall);
    expect(variableLarge).toBeLessThan(variableSmall * 10);
  });

  /**
   * The other direction, and it is deliberate. A small estate does not get
   * proportionally cheaper to administer, because a floor of irreducible work
   * exists whatever the size.
   */
  it('does not let a tiny estate look proportionally cheap', () => {
    const result = administrationFte(siem, 100, 'on_prem', real);
    const linear = 0.5 + (0.3 * 100) / 1000;

    expect(result.fte).toBeGreaterThan(linear);
  });

  it('charges less to administer a tool the vendor hosts', () => {
    const selfHosted = administrationFte(siem, 2_000, 'on_prem', real);
    const vendorHosted = administrationFte(siem, 2_000, 'cloud', real);

    expect(vendorHosted.fte).toBeLessThan(selfHosted.fte);
    expect(vendorHosted.fte / selfHosted.fte).toBeCloseTo(0.6, 6);
  });

  it('charges more for an air-gapped deployment than an on-premises one', () => {
    const onPrem = administrationFte(siem, 2_000, 'on_prem', real);
    const airGapped = administrationFte(siem, 2_000, 'air_gapped', real);

    expect(airGapped.fte).toBeGreaterThan(onPrem.fte);
  });

  it('still charges the base effort for a tool pointed at nothing', () => {
    const result = administrationFte(siem, 0, 'on_prem', real);

    // A blank intake is a real input. The tool still has to be stood up.
    expect(result.fte).toBeCloseTo(0.5, 6);
  });

  it('shows its whole arithmetic, because this is the number a client argues with', () => {
    const result = administrationFte(siem, 4_000, 'cloud', real);

    expect(result.workingOut).toMatch(/0\.5 base/);
    expect(result.workingOut).toMatch(/0\.3 per 1,000 assets/);
    expect(result.workingOut).toMatch(/administer/);
    expect(result.workingOut).toMatch(/not the effort to monitor/);
    expect(result.terms).toHaveLength(3);
    expect(result.terms.map((term) => term.label)).toEqual([
      'Base effort',
      'Estate scaling',
      'Delivery mode',
    ]);
  });

  it('reports the figure before the delivery multiplier, so the multiplier is visible', () => {
    const result = administrationFte(siem, 2_000, 'cloud', real);

    expect(result.deploymentMultiplier).toBe(0.6);
    expect(result.fte).toBeCloseTo(result.beforeDeploymentMode * 0.6, 6);
  });
});

describe('monitoringFte', () => {
  const model = buildStaffingModel();

  /**
   * The one piece of arithmetic here that is not a judgement: 8,760 hours of
   * continuous coverage over ~1,800 productive hours per FTE. It is why a 24/7
   * rota cannot be staffed by three people.
   */
  it('derives 4.87 FTE to keep one seat staffed around the clock', () => {
    const result = monitoringFte(250, model);

    expect(result.ftePerSeat).toBeCloseTo(8760 / 1800, 5);
    expect(result.ftePerSeat).toBeGreaterThan(4.8);
    expect(result.ftePerSeat).toBeLessThan(5);
  });

  /** Published MSSP guidance: one seat per 50-100 small customers. */
  it('puts a reference client at about 0.065 FTE of real headcount', () => {
    const result = monitoringFte(250, model);

    expect(result.clientWeight).toBeCloseTo(1, 6);
    expect(result.fte).toBeCloseTo((8760 / 1800) / 75, 5);
    expect(result.fte).toBeGreaterThan(0.05);
    expect(result.fte).toBeLessThan(0.08);
  });

  it('charges a larger client more, but sublinearly', () => {
    const reference = monitoringFte(250, model);
    const tenTimes = monitoringFte(2_500, model);

    expect(tenTimes.fte).toBeGreaterThan(reference.fte);
    expect(tenTimes.fte).toBeLessThan(reference.fte * 10);
  });

  it('charges nothing to monitor an estate nobody has described', () => {
    expect(monitoringFte(0, model).fte).toBe(0);
  });

  it('shows the seat arithmetic, which is the part a client can check', () => {
    const result = monitoringFte(1_000, model);

    expect(result.workingOut).toMatch(/per 24\/7 seat/);
    expect(result.terms.map((term) => term.label)).toContain('One 24/7 seat');
    expect(result.terms[0]?.explanation).toMatch(/8,760/);
    expect(result.terms[0]?.explanation).toMatch(/1,800/);
  });

  /**
   * The distinction the whole module exists to protect. Administration is a
   * fraction of an FTE per tool; monitoring is a share of a round-the-clock
   * rota. Reading one as the other understates by an order of magnitude, and
   * always in that direction.
   */
  it('is a different quantity from administration, not a refinement of it', () => {
    const admin = administrationFte(siem, 250, 'on_prem', real);
    const monitor = monitoringFte(250, model);

    expect(admin.fte).not.toBeCloseTo(monitor.fte, 2);
    expect(admin.workingOut).toMatch(/not the effort to monitor/);
    expect(monitor.workingOut).toMatch(/separate from the effort to administer/);
  });
});
