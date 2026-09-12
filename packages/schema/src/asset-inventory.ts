// AssetInventory (PROJECT_SPEC §5.2).
//
// Deliberately flat: the sizing stage multiplies each asset class by a
// coefficient from data/config/sizing-assumptions.yaml, so the inventory keys
// and the coefficient keys are the same key set. Nesting would buy tidiness in
// the wizard and cost a lookup indirection in the engine.
//
// Every class is optional. Scoping calls do not produce clean data (§5.2), so
// an absent class means "not asked / none", and sizing reads it as zero.

import { z } from 'zod';

import { AssetCriticality, NetworkVendor } from './enums';

export const AssetLine = z
  .object({
    count: z.number().int().nonnegative(),
    criticality: AssetCriticality.optional(),
    internetFacing: z.boolean().optional(),
  })
  .strict();
export type AssetLine = z.infer<typeof AssetLine>;

/**
 * Every asset class the tool sizes on. Adding one here is a breaking change for
 * data/config/sizing-assumptions.yaml, which must gain a matching coefficient.
 */
export const AssetClass = z.enum([
  // Endpoints
  'windowsEndpoints',
  'macosEndpoints',
  'linuxEndpoints',
  // Servers
  'windowsServers',
  'windowsDomainControllers',
  'linuxServers',
  // Virtualisation
  'hypervisors',
  'containerNodes',
  // Network
  'routers',
  'switches',
  'wirelessControllers',
  'firewalls',
  'vpnConcentrators',
  'loadBalancers',
  // Data and applications
  'databases',
  'fileServers',
  'internalWebApps',
  'publicWebApps',
  // Operational technology
  'otIcsScadaDevices',
  'iotCctvPosDevices',
  // Cloud
  'awsAccounts',
  'azureSubscriptions',
  'gcpProjects',
  'cloudWorkloads',
  // SaaS
  'm365Seats',
  'googleWorkspaceSeats',
  'otherCriticalSaasApps',
  // Identity
  'remoteUsers',
  'privilegedAccounts',
  'serviceAccounts',
]);
export type AssetClass = z.infer<typeof AssetClass>;

const assetLineShape = Object.fromEntries(
  AssetClass.options.map((assetClass) => [assetClass, AssetLine]),
) as { [K in AssetClass]: typeof AssetLine };

export const AssetInventory = z
  .object({
    ...assetLineShape,
  })
  .partial()
  .extend({
    /** Which vendors the network gear is, for integration and parser fit. */
    networkVendors: z.array(NetworkVendor).default([]),
    /** Aggregate NGFW throughput class, for perimeter sizing. */
    firewallThroughputClass: z.enum(['under_1g', '1g_to_10g', 'over_10g']).optional(),
    /**
     * Analyst's override of the log verbosity assumption, if they know the
     * environment is chattier or quieter than the default profile.
     */
    verbosityOverride: z.enum(['quiet', 'default', 'chatty']).optional(),

    /*
     * What the client actually ingests today, where they know it.
     *
     * Intake, not an advanced setting, and it lives here beside the asset
     * counts because it is the same kind of thing: a fact about this estate
     * that the client stated. The counts are the fallback when nobody knows
     * this; when somebody does, this is simply the better answer and it
     * replaces the arithmetic the counts would have produced.
     *
     * It sat in `SizingOverrides` for one commit, which was wrong twice over.
     * That object holds coefficient tuning, which is a statement about
     * StackFit's assumptions rather than about the client, and it is written
     * only by the results worksheet, so the question never reached the screen
     * where the analyst is actually talking to the person who knows the answer.
     *
     * Why it outranks them. The per-asset EPS figures are the standard
     * first-pass method and every vendor calculator uses them, but the
     * published values for one device class disagree by more than an order of
     * magnitude: a Windows workstation is quoted at 1, 2, 5 and 10 to 50 EPS by
     * four different sources, and a domain controller at 100 to 500. Those
     * sources are not disagreeing about the device. They are disagreeing about
     * audit policy and about what an estate actually forwards, which is a fact
     * about this client's configuration and not about the hardware. A client
     * who knows their own number has answered the question the coefficients
     * were guessing at.
     *
     * Both optional and independent. EPS feeds volume feeds licence and
     * storage, so the chain can be pinned at either link: `measuredEps`
     * replaces the derived rate, `measuredGbPerDay` replaces the derived volume
     * whatever the rate says. A client who knows both pins both, and the ratio
     * between their two figures is that estate's real average event size rather
     * than the 500-byte assumption in the sizing config.
     */
    measuredEps: z.number().nonnegative().max(10_000_000).optional(),
    measuredGbPerDay: z.number().nonnegative().max(1_000_000).optional(),
  })
  .strict();
export type AssetInventory = z.infer<typeof AssetInventory>;
