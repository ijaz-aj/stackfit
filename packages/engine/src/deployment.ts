// How a product will actually be deployed for this client.
//
// `deploymentModes` on a product is a capability set: the four ways the vendor
// will let you run it. It is not a decision, and the engine never made one, so
// three separate questions had no answer:
//
//   - which tool suits this estate (42 of 65 catalog tiers declare all four
//     modes, so the deployment dimension scored them identically and the
//     recommendation came out the same for an on-premises client and a
//     cloud-native one);
//   - what the tool costs to run here (`cost.ts` charged self-hosting
//     infrastructure to anything that *could* be self-hosted, so a cloud-only
//     client paid for racks to run a product they would consume as SaaS);
//   - what it costs us to stand up, which depends entirely on which of the two
//     it is.
//
// This makes the decision once, explicitly, with its reasoning attached.
//
// ⚠ It is a decision about *delivery*, not about where the client's assets
// live. Those are different questions, and the Phase 11 review turned on
// keeping them apart: a SaaS-delivered EDR protects on-premises endpoints
// perfectly well. Only `deploymentConstraint`, which is a stated procurement
// policy, removes an option outright.

import type { ClientProfile, DeploymentMode, Product } from '@stackfit/schema';

export interface DeploymentDecision {
  readonly mode: DeploymentMode;
  /**
   * Whether this deployment stands up infrastructure the client pays for.
   *
   * A hybrid deployment counts when the product can be self-hosted, because
   * that is what its on-premises half is. A hybrid deployment of a product that
   * only offers cloud and hybrid is a connector alongside a SaaS tenancy, and
   * carries no comparable footprint.
   */
  readonly selfHosted: boolean;
  /** True when the environment was not asked and the mode is an assumption. */
  readonly assumed: boolean;
  readonly rationale: string;
}

/**
 * Preference order per stated environment, most native first.
 *
 * `not_asked` deliberately leads with self-hosting. It is the more expensive
 * reading, it reproduces exactly what the engine charged before this module
 * existed, and it gives the analyst a reason to go back and ask: the figure
 * usually falls once the question is answered, and a costing that quietly got
 * cheaper for want of an answer would be the wrong way round.
 */
const PREFERENCE: Readonly<Record<ClientProfile['environment'], readonly DeploymentMode[]>> = {
  air_gapped: ['air_gapped', 'on_prem', 'hybrid', 'cloud'],
  on_prem: ['on_prem', 'hybrid', 'air_gapped', 'cloud'],
  cloud: ['cloud', 'hybrid', 'on_prem', 'air_gapped'],
  hybrid: ['hybrid', 'cloud', 'on_prem', 'air_gapped'],
  not_asked: ['on_prem', 'air_gapped', 'hybrid', 'cloud'],
};

const MODE_PHRASE: Readonly<Record<DeploymentMode, string>> = {
  on_prem: 'self-hosted on their own infrastructure',
  air_gapped: 'self-hosted in an isolated network',
  hybrid: 'hybrid, with components both self-hosted and vendor-run',
  cloud: 'vendor-hosted, consumed as a service',
};

function permittedModes(
  product: Product,
  constraint: ClientProfile['deploymentConstraint'],
): readonly DeploymentMode[] {
  const all = product.supports.deploymentModes;
  const filtered =
    constraint === 'saas_not_permitted'
      ? all.filter((mode) => mode !== 'cloud')
      : constraint === 'self_hosted_not_permitted'
        ? all.filter((mode) => mode !== 'on_prem' && mode !== 'air_gapped')
        : all;

  /*
   * A product with nothing left is one the scoring stage eliminates outright,
   * and it still has to be costable on the way there: the justification table
   * names what every considered SKU would have cost. Fall back to the
   * unfiltered set rather than inventing a mode or throwing.
   */
  return filtered.length > 0 ? filtered : all;
}

export function chooseDeployment(product: Product, profile: ClientProfile): DeploymentDecision {
  const modes = permittedModes(product, profile.deploymentConstraint);
  const order = PREFERENCE[profile.environment];
  const mode = order.find((candidate) => modes.includes(candidate)) ?? modes[0]!;

  /*
   * Read from the permitted set, not the raw capability list. A client whose
   * policy forbids self-hosting cannot have a self-hosted half to their hybrid
   * deployment, however many modes the vendor offers, and charging them
   * infrastructure for one would contradict the policy the same object just
   * enforced.
   */
  const canSelfHost = modes.includes('on_prem') || modes.includes('air_gapped');
  const selfHosted =
    mode === 'on_prem' || mode === 'air_gapped' || (mode === 'hybrid' && canSelfHost);

  const assumed = profile.environment === 'not_asked';

  const constraintNote =
    profile.deploymentConstraint === 'saas_not_permitted'
      ? ' A stated policy rules out vendor-hosted delivery.'
      : profile.deploymentConstraint === 'self_hosted_not_permitted'
        ? ' A stated policy rules out running it themselves.'
        : '';

  const rationale = assumed
    ? `The environment was not asked, so this is costed as ${MODE_PHRASE[mode]}, which is the ` +
      `more expensive reading of the two. Ask, and this figure usually falls.${constraintNote}`
    : `Deployed ${MODE_PHRASE[mode]}, to suit the ${profile.environment.replace('_', '-')} ` +
      `estate the client runs.${constraintNote}`;

  return { mode, selfHosted, assumed, rationale };
}
