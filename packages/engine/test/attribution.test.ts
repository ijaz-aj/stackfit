import { describe, expect, it } from 'vitest';

import { attributeBundle, type AttributableSelection } from '../src/attribution';
import { responsibilitySplit } from '../src/responsibility';
import { buildClientProfile, buildMsspRateCard } from './fixtures';

const card = buildMsspRateCard();
const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

/**
 * `siem` is `resold` in the fixture and `edr` is not, which is the pair every
 * interesting case here turns on. `backup` is on no service level at all.
 */
function selection(
  category: AttributableSelection['category'],
  procurement: number,
  ops: number,
  provider: { delivery?: number; run?: number } = {},
): AttributableSelection {
  return {
    category,
    productId: `${category}-product`,
    procurementAnnual: usd(procurement),
    opsFteAnnual: usd(ops),
    licenceAnnual: usd(procurement),
    // Our rates are half the client's in the fixture, so a test that confuses
    // the two fails rather than quietly agreeing with itself.
    providerDeliveryOneTime: usd(provider.delivery ?? 0),
    providerOpsFteAnnual: usd(provider.run ?? Math.round(ops / 2)),
  };
}

const managed = responsibilitySplit(
  buildClientProfile({ deliveryModel: 'mssp_managed', serviceLevel: 'mdr' }),
  card,
);
const selfRun = responsibilitySplit(
  buildClientProfile({ deliveryModel: 'client_operated', serviceLevel: null }),
  card,
);

describe('attributeBundle', () => {
  /**
   * The defect the module exists for. Under a managed engagement the client was
   * quoted their own salaries for work we do: on the committed hospital preset
   * that was USD 1,205,181 a year of people against USD 0 of licence.
   */
  it('does not bill the client for people we are the ones employing', () => {
    const result = attributeBundle(
      [selection('edr', 10_000, 500_000)],
      managed,
      card,
      'USD',
      usd(60_000),
    );

    expect(result.bySelection[0]?.operator).toBe('provider');
    expect(result.clientOpsAnnual).toEqual(usd(0));
    expect(result.providerOpsAnnual).toEqual(usd(500_000));
    // Licence they still buy (edr is client_direct) plus our fee. No salaries.
    expect(result.clientTotalAnnual).toEqual(usd(70_000));
  });

  it('still bills the client for the categories they operate themselves', () => {
    const result = attributeBundle(
      [selection('backup', 8_000, 300_000)],
      managed,
      card,
      'USD',
      usd(60_000),
    );

    // No service level covers backup, so it stays theirs even on a managed deal.
    expect(result.bySelection[0]?.operator).toBe('client');
    expect(result.clientOpsAnnual).toEqual(usd(300_000));
    expect(result.providerOpsAnnual).toEqual(usd(0));
    expect(result.clientTotalAnnual).toEqual(usd(368_000));
  });

  /**
   * The double-charge guard. The base platform fee was backed out of quotes
   * that already include the SIEM tenancy, so billing a client-side SIEM
   * licence on top charges for the same platform twice.
   */
  it('does not charge again for a platform that is already inside our fee', () => {
    const result = attributeBundle(
      [selection('siem', 120_000, 400_000)],
      managed,
      card,
      'USD',
      usd(60_000),
    );

    expect(result.bySelection[0]?.licenceInOurFee).toBe(true);
    expect(result.clientProcurementAnnual).toEqual(usd(0));
    expect(result.clientTotalAnnual).toEqual(usd(60_000));
    expect(result.rationale.join(' ')).toMatch(/bill the same product twice/);
  });

  it('leaves a client-operated engagement paying for everything, as it should', () => {
    const selections = [selection('siem', 120_000, 400_000), selection('backup', 8_000, 300_000)];
    const result = attributeBundle(selections, selfRun, card, 'USD', usd(0));

    expect(result.providerOpsAnnual).toEqual(usd(0));
    expect(result.clientTotalAnnual).toEqual(result.fullBuildAnnual);
    expect(result.clientTotalAnnual).toEqual(usd(828_000));
  });

  /**
   * `fullBuildAnnual` must not move when the boundary does. It is the
   * build-versus-buy denominator, and a figure that changed with the delivery
   * model would make the comparison circular.
   */
  it('reports the same full build cost whoever operates it', () => {
    const selections = [selection('siem', 120_000, 400_000), selection('backup', 8_000, 300_000)];

    const a = attributeBundle(selections, managed, card, 'USD', usd(60_000));
    const b = attributeBundle(selections, selfRun, card, 'USD', usd(0));

    expect(a.fullBuildAnnual).toEqual(b.fullBuildAnnual);
  });

  it('never lets our own operational cost reach the client total', () => {
    const result = attributeBundle(
      [selection('siem', 1_000, 9_999_999)],
      managed,
      card,
      'USD',
      usd(50_000),
    );

    expect(result.clientTotalAnnual).toEqual(usd(50_000));
    expect(result.providerOpsAnnual).toEqual(usd(9_999_999));
  });

  it('says what the client pays and what is ours, in the rationale', () => {
    const result = attributeBundle(
      [selection('siem', 120_000, 400_000), selection('backup', 8_000, 300_000)],
      managed,
      card,
      'USD',
      usd(60_000),
    );
    const prose = result.rationale.join(' ');

    expect(prose).toMatch(/The client pays/);
    expect(prose).toMatch(/is ours and is not in that figure/);
    expect(prose).toMatch(/build-versus-buy/);
  });

  /**
   * Found by running the six committed presets through the new attribution: the
   * INR clients came back with a fee seven to twelve times the total cost of
   * building the same stack. The rate card is USD, synthesised from published
   * US and global ranges, and carries no regional dimension, while the labour
   * rates it is implicitly compared against do.
   */
  it('warns when our fee exceeds what building the whole stack would cost', () => {
    const result = attributeBundle(
      [selection('edr', 1_000, 1_000)],
      managed,
      card,
      'USD',
      usd(9_000_000),
    );

    expect(result.rationale.join(' ')).toMatch(/more than the whole stack would cost/);
    expect(result.rationale.join(' ')).toMatch(/no regional dimension/);
  });

  it('does not cry wolf when the fee is a sensible fraction of the build', () => {
    const result = attributeBundle(
      [selection('edr', 10_000, 900_000)],
      managed,
      card,
      'USD',
      usd(200_000),
    );

    expect(result.rationale.join(' ')).not.toMatch(/more than the whole stack would cost/);
  });

  describe('what the engagement costs us', () => {
    /**
     * The question the project exists to answer and that nothing answered:
     * "how much cost will it take us for deploying that particular tool for
     * the client". Our effort was only ever priced at the *client's* regional
     * rate, which prices our own delivery team differently for every client.
     */
    it('costs our side at our rates, not the client regional rate', () => {
      const result = attributeBundle(
        [selection('edr', 10_000, 500_000, { delivery: 80_000, run: 250_000 })],
        managed,
        card,
        'USD',
        usd(400_000),
      );

      expect(result.providerRunAnnual).toEqual(usd(250_000));
      expect(result.providerDeliveryOneTime).toEqual(usd(80_000));
      // The same effort at the client rate, kept for build-versus-buy.
      expect(result.providerOpsAnnual).toEqual(usd(500_000));
    });

    it('does not charge us for deploying what the client operates', () => {
      const result = attributeBundle(
        [selection('backup', 8_000, 300_000, { delivery: 90_000, run: 150_000 })],
        managed,
        card,
        'USD',
        usd(60_000),
      );

      // No service level covers backup, so none of it is ours to deploy or run.
      expect(result.providerDeliveryOneTime).toEqual(usd(0));
      expect(result.providerRunAnnual).toEqual(usd(0));
    });

    it('reports margin as fee less what it costs us to run', () => {
      const result = attributeBundle(
        [selection('edr', 0, 0, { delivery: 100_000, run: 300_000 })],
        managed,
        card,
        'USD',
        usd(500_000),
      );

      expect(result.providerMarginAnnual).toEqual(usd(200_000));
      expect(result.providerMarginYearOne).toEqual(usd(100_000));
    });

    /**
     * Negative margin is a real answer, not an error. It says the engagement
     * loses money at this service level, which is worth knowing before quoting
     * rather than after.
     */
    it('says so when the fee does not cover what the people cost us', () => {
      const result = attributeBundle(
        [selection('edr', 0, 0, { delivery: 10_000, run: 600_000 })],
        managed,
        card,
        'USD',
        usd(500_000),
      );

      expect(Number(result.providerMarginAnnual.amountMinor)).toBeLessThan(0);
      expect(result.rationale.join(' ')).toMatch(/does not cover its own running cost/);
    });

    it('flags a year one that delivery swallows, without crying loss', () => {
      const result = attributeBundle(
        [selection('edr', 0, 0, { delivery: 400_000, run: 300_000 })],
        managed,
        card,
        'USD',
        usd(500_000),
      );

      expect(Number(result.providerMarginAnnual.amountMinor)).toBeGreaterThan(0);
      expect(Number(result.providerMarginYearOne.amountMinor)).toBeLessThan(0);
      expect(result.rationale.join(' ')).toMatch(/Year one does not pay for itself/);
      expect(result.rationale.join(' ')).not.toMatch(/does not cover its own running cost/);
    });

    /**
     * Measured across the six presets, the margin comes out at 92-97%, which is
     * not a managed-service margin. The cost side counts tool administration
     * and not the monitoring rota, which is the product. The figure has to say
     * so wherever it appears.
     */
    it('refuses to present the margin as a real one', () => {
      const result = attributeBundle(
        [selection('edr', 0, 0, { delivery: 10_000, run: 50_000 })],
        managed,
        card,
        'USD',
        usd(900_000),
      );

      expect(result.rationale.join(' ')).toMatch(/excludes the monitoring rota/);
      expect(result.rationale.join(' ')).toMatch(/upper bound/);
    });

    it('keeps our cost out of what the client pays', () => {
      const result = attributeBundle(
        [selection('edr', 10_000, 500_000, { delivery: 999_999, run: 999_999 })],
        managed,
        card,
        'USD',
        usd(60_000),
      );

      expect(result.clientTotalAnnual).toEqual(usd(70_000));
    });
  });

  it('adds up: client total is procurement plus their ops plus our fee', () => {
    const result = attributeBundle(
      [
        selection('siem', 120_000, 400_000),
        selection('edr', 40_000, 250_000),
        selection('backup', 8_000, 300_000),
      ],
      managed,
      card,
      'USD',
      usd(75_000),
    );

    const parts =
      Number(result.clientProcurementAnnual.amountMinor) +
      Number(result.clientOpsAnnual.amountMinor) +
      Number(result.providerFeeAnnual.amountMinor);

    expect(Number(result.clientTotalAnnual.amountMinor)).toBe(parts);
  });
});
