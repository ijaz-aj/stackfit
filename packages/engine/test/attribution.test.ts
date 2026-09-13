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
): AttributableSelection {
  return {
    category,
    productId: `${category}-product`,
    procurementAnnual: usd(procurement),
    opsFteAnnual: usd(ops),
    licenceAnnual: usd(procurement),
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
