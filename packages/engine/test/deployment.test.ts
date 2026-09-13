import { describe, expect, it } from 'vitest';
import type { DeploymentMode, Product } from '@stackfit/schema';

import { chooseDeployment } from '../src/deployment';
import { buildClientProfile, buildProduct } from './fixtures';

function productWith(modes: readonly DeploymentMode[]): Product {
  const base = buildProduct();
  return { ...base, supports: { ...base.supports, deploymentModes: [...modes] } };
}

/** The shape that defeated the old logic: supports everything, so says nothing. */
const everything = productWith(['on_prem', 'hybrid', 'cloud', 'air_gapped']);
const saasOnly = productWith(['cloud']);
const saasWithConnector = productWith(['cloud', 'hybrid']);

describe('chooseDeployment', () => {
  it('gives a cloud client the vendor-hosted mode, and no infrastructure to run', () => {
    const decision = chooseDeployment(everything, buildClientProfile({ environment: 'cloud' }));

    expect(decision.mode).toBe('cloud');
    expect(decision.selfHosted).toBe(false);
  });

  /**
   * The defect this module exists for. 42 of 65 catalog tiers declare every
   * mode, and the old rule charged self-hosting infrastructure to any of them,
   * so a cloud-only client paid to rack a product they would buy as SaaS.
   */
  it('stops charging a cloud client for infrastructure they will never rack', () => {
    const cloud = chooseDeployment(everything, buildClientProfile({ environment: 'cloud' }));
    const onPrem = chooseDeployment(everything, buildClientProfile({ environment: 'on_prem' }));

    expect(cloud.selfHosted).toBe(false);
    expect(onPrem.selfHosted).toBe(true);
  });

  it('gives an on-premises client the self-hosted mode', () => {
    const decision = chooseDeployment(everything, buildClientProfile({ environment: 'on_prem' }));

    expect(decision.mode).toBe('on_prem');
    expect(decision.selfHosted).toBe(true);
  });

  it('gives an air-gapped client the isolated mode', () => {
    const decision = chooseDeployment(everything, buildClientProfile({ environment: 'air_gapped' }));

    expect(decision.mode).toBe('air_gapped');
    expect(decision.selfHosted).toBe(true);
  });

  /**
   * A hybrid deployment of a self-hostable product still has an on-premises
   * half, and that half is what the infrastructure line pays for. A hybrid
   * deployment of a SaaS product with a connector does not.
   */
  it('treats a hybrid deployment as self-hosted only when the product can be', () => {
    const profile = buildClientProfile({ environment: 'hybrid' });

    expect(chooseDeployment(everything, profile).mode).toBe('hybrid');
    expect(chooseDeployment(everything, profile).selfHosted).toBe(true);
    expect(chooseDeployment(saasWithConnector, profile).mode).toBe('hybrid');
    expect(chooseDeployment(saasWithConnector, profile).selfHosted).toBe(false);
  });

  it('falls back to what the product actually offers', () => {
    const decision = chooseDeployment(saasOnly, buildClientProfile({ environment: 'on_prem' }));

    expect(decision.mode).toBe('cloud');
    expect(decision.selfHosted).toBe(false);
  });

  /**
   * `not_asked` reproduces exactly what the engine charged before this module
   * existed. It is the dearer reading, and it is meant to be: a costing that
   * got cheaper because nobody asked the question would be the wrong way round.
   */
  it('assumes self-hosting when the environment was not asked, and says so', () => {
    const decision = chooseDeployment(everything, buildClientProfile({ environment: 'not_asked' }));

    expect(decision.selfHosted).toBe(true);
    expect(decision.assumed).toBe(true);
    expect(decision.rationale).toMatch(/was not asked/);
    expect(decision.rationale).toMatch(/usually falls/);
  });

  it('does not mark a stated environment as assumed', () => {
    expect(chooseDeployment(everything, buildClientProfile({ environment: 'cloud' })).assumed).toBe(
      false,
    );
  });

  describe('a stated procurement policy', () => {
    it('keeps a no-SaaS client off vendor-hosted delivery', () => {
      const decision = chooseDeployment(
        everything,
        buildClientProfile({ environment: 'cloud', deploymentConstraint: 'saas_not_permitted' }),
      );

      expect(decision.mode).not.toBe('cloud');
      expect(decision.selfHosted).toBe(true);
      expect(decision.rationale).toMatch(/rules out vendor-hosted/);
    });

    it('keeps a no-self-hosting client off running it themselves', () => {
      const decision = chooseDeployment(
        everything,
        buildClientProfile({
          environment: 'on_prem',
          deploymentConstraint: 'self_hosted_not_permitted',
        }),
      );

      expect(decision.selfHosted).toBe(false);
      expect(decision.rationale).toMatch(/rules out running it themselves/);
    });

    /**
     * A product the policy leaves with nothing is eliminated by the scoring
     * stage, and still has to be costable on the way there: the justification
     * table quotes what every considered SKU would have cost.
     */
    it('still costs a product the policy leaves no room for', () => {
      const decision = chooseDeployment(
        saasOnly,
        buildClientProfile({ deploymentConstraint: 'saas_not_permitted' }),
      );

      expect(decision.mode).toBe('cloud');
    });
  });

  it('explains itself in terms of the estate, not the capability list', () => {
    const decision = chooseDeployment(everything, buildClientProfile({ environment: 'on_prem' }));

    expect(decision.rationale).toMatch(/self-hosted on their own infrastructure/);
    expect(decision.rationale).toMatch(/estate the client runs/);
  });
});
