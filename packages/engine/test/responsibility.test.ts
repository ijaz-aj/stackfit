import { describe, expect, it } from 'vitest';

import { responsibilitySplit } from '../src/responsibility';
import { buildClientProfile, buildMsspRateCard } from './fixtures';

const card = buildMsspRateCard();

describe('responsibilitySplit', () => {
  it('gives the client every category when they operate it', () => {
    const split = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'client_operated', serviceLevel: null }),
      card,
    );

    expect(split.providerCategories.size).toBe(0);
    expect(split.providerOperatesNothing).toBe(true);
    expect(split.operatorOf('siem')).toBe('client');
    expect(split.operatorOf('backup')).toBe('client');
  });

  it('assigns exactly the service level`s covered categories to us', () => {
    const level = card.serviceLevels.find((entry) => entry.level === 'mdr');
    const split = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'mssp_managed', serviceLevel: 'mdr' }),
      card,
    );

    expect([...split.providerCategories].sort()).toEqual([...level!.coveredCategories].sort());
    for (const category of level!.coveredCategories) {
      expect(split.operatorOf(category)).toBe('provider');
    }
  });

  /**
   * The defect this whole module exists for. `backup` is on no service level in
   * the committed rate card, so a managed engagement must still leave it with
   * the client. Before the split, ops_fit divided backup by the 0.6 analyst FTE
   * we allocate, which is capacity we had never agreed to spend on it.
   */
  it('leaves a category no service level covers with the client, even when we manage', () => {
    const split = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'mssp_managed', serviceLevel: 'mdr' }),
      card,
    );

    expect(split.operatorOf('backup')).toBe('client');
    expect(split.operatorOf('iam')).toBe('client');
  });

  it('widens what is ours as the service level widens', () => {
    const narrow = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'mssp_managed', serviceLevel: 'monitoring' }),
      card,
    );
    const wide = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'mssp_managed', serviceLevel: 'managed_security' }),
      card,
    );

    expect(narrow.providerCategories.size).toBeLessThan(wide.providerCategories.size);
    for (const category of narrow.providerCategories) {
      expect(wide.providerCategories.has(category)).toBe(true);
    }
  });

  /**
   * co_managed is not a third rule. It is the same boundary drawn at a
   * different service level, which is what stops it being the scalar nudge it
   * used to be: co_managed and mssp_managed produced byte-identical output on
   * two of the six committed presets.
   */
  it('separates co-managed from fully managed by where the boundary falls', () => {
    const co = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'co_managed', serviceLevel: 'monitoring' }),
      card,
    );
    const managed = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'mssp_managed', serviceLevel: 'managed_security' }),
      card,
    );

    expect(co.providerCategories).not.toEqual(managed.providerCategories);
    expect(co.operatorOf('edr')).toBe('client');
    expect(managed.operatorOf('edr')).toBe('provider');
  });

  it('fails closed on a service level the rate card does not define', () => {
    const split = responsibilitySplit(
      buildClientProfile({
        deliveryModel: 'mssp_managed',
        serviceLevel: 'monitoring',
      }),
      { ...card, serviceLevels: [] },
    );

    expect(split.providerOperatesNothing).toBe(true);
    expect(split.operatorOf('siem')).toBe('client');
    expect(split.rationale.join(' ')).toMatch(/not on the rate card/);
  });

  it('says which categories are ours, in the rationale', () => {
    const split = responsibilitySplit(
      buildClientProfile({ deliveryModel: 'mssp_managed', serviceLevel: 'mdr' }),
      card,
    );

    expect(split.rationale.join(' ')).toMatch(/We operate/);
    expect(split.rationale.join(' ')).toMatch(/siem/);
  });
});
