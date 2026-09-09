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

import { AssetCriticality, NetworkVendor } from './enums.js';

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
  })
  .strict();
export type AssetInventory = z.infer<typeof AssetInventory>;
