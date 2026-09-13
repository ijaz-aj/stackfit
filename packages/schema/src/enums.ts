// Shared vocabularies. Every enum here is a closed set on purpose: a typo in a
// catalog YAML should fail `pnpm catalog:validate`, not silently create a new
// category that nothing else in the engine knows how to score.

import { z } from 'zod';

/** ISO 4217. Currency is per-scenario, not global (see docs/STATUS.md decisions). */
export const CurrencyCode = z.enum(['USD', 'INR', 'EUR']);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/**
 * Region is a hint, never a constraint: it pre-selects likely frameworks and
 * suggests a currency + labour rate, all of which the analyst can override.
 */
export const Region = z.enum(['in', 'us', 'eu', 'uk', 'apac', 'mena', 'other']);
export type Region = z.infer<typeof Region>;

export const Industry = z.enum([
  'retail',
  'healthcare',
  'bfsi',
  'manufacturing',
  'saas',
  'education',
  'govt',
  'other',
]);
export type Industry = z.infer<typeof Industry>;

export const ProductCategory = z.enum([
  'siem',
  'edr',
  'ndr',
  'pam',
  'iam',
  'vulnerability_management',
  'email_security',
  'soar',
  'backup',
  'ngfw',
  'asset_discovery',
  'deception',
  'mdr',
]);
export type ProductCategory = z.infer<typeof ProductCategory>;

export const LicenceModel = z.enum([
  'commercial',
  'open_source',
  'open_core',
  'freemium',
  'managed_service',
]);
export type LicenceModel = z.infer<typeof LicenceModel>;

/** How a *product* can be delivered. A property of the product, not the client. */
export const DeploymentMode = z.enum(['cloud', 'on_prem', 'hybrid', 'air_gapped']);
export type DeploymentMode = z.infer<typeof DeploymentMode>;

/**
 * What the client actually runs. A fact about their estate, not a preference.
 *
 * This used to be `deploymentPreference: DeploymentMode`, where `hybrid` was
 * quietly overloaded to mean "no strong preference", so a client who genuinely
 * runs both had no way to say so, was scored by inference from asset counts
 * instead of by what they said, and was told in writing that "no preference was
 * stated". Splitting the two apart is the fix: `hybrid` now means both, and the
 * absent answer has a name of its own.
 */
export const ClientEnvironment = z.enum([
  'cloud',
  'on_prem',
  'hybrid',
  'air_gapped',
  /** Not asked on the call. The estate is read from the inventory instead. */
  'not_asked',
]);
export type ClientEnvironment = z.infer<typeof ClientEnvironment>;

/**
 * A procurement policy that rules a delivery model out entirely.
 *
 * Separate from the environment because they answer different questions. Where
 * a client's assets live decides which tools *fit*; what delivery their policy
 * permits decides which are *eligible*. A SaaS-delivered EDR manages on-premises
 * endpoints perfectly well, so an on-prem estate must not eliminate it, but a
 * data-residency rule forbidding SaaS genuinely does.
 */
export const DeploymentConstraint = z.enum([
  'none',
  /** Data residency, a regulator, or a board that will not approve SaaS. */
  'saas_not_permitted',
  /** No appetite or no staff to run anything themselves. */
  'self_hosted_not_permitted',
]);
export type DeploymentConstraint = z.infer<typeof DeploymentConstraint>;

export const OsFamily = z.enum(['windows', 'linux', 'macos', 'ios', 'android', 'network_os']);
export type OsFamily = z.infer<typeof OsFamily>;

export const DeviceClass = z.enum([
  'server',
  'workstation',
  'domain_controller',
  'hypervisor',
  'container_node',
  'network_device',
  'firewall',
  'database',
  'web_app',
  'cloud_workload',
  'saas_tenant',
  'ot_ics',
  'iot',
  'mobile',
  'identity',
  'mailbox',
]);
export type DeviceClass = z.infer<typeof DeviceClass>;

export const CloudPlatform = z.enum(['aws', 'azure', 'gcp', 'oci', 'm365', 'google_workspace']);
export type CloudPlatform = z.infer<typeof CloudPlatform>;

export const NetworkVendor = z.enum([
  'cisco',
  'fortinet',
  'juniper',
  'mikrotik',
  'aruba',
  'palo_alto',
  'sophos',
  'other',
]);
export type NetworkVendor = z.infer<typeof NetworkVendor>;

export const Maturity = z.enum(['emerging', 'established', 'legacy']);
export type Maturity = z.infer<typeof Maturity>;

export const SkillLevel = z.enum(['generalist', 'security_engineer', 'specialist']);
export type SkillLevel = z.infer<typeof SkillLevel>;

export const ScaleClass = z.enum(['small', 'mid', 'large', 'enterprise']);
export type ScaleClass = z.infer<typeof ScaleClass>;

export const RiskTolerance = z.enum(['low', 'medium', 'high']);
export type RiskTolerance = z.infer<typeof RiskTolerance>;

export const DataSensitivity = z.enum(['public', 'internal', 'regulated', 'critical']);
export type DataSensitivity = z.infer<typeof DataSensitivity>;

/**
 * Who will actually operate the recommended stack.
 *
 * This replaced `SocPosture` (`none | business_hours | 24x7 | outsourced`),
 * which asked what security capability the client already had. That is the
 * right question for a tool advising a company buying its own security. It is
 * the wrong one here: every client this tool is pointed at is being onboarded
 * into our SOC, so the honest answer was always "outsourced, to us" and a
 * question with a fixed answer cannot drive anything.
 *
 * What varies between engagements is not whether the client has a SOC. It is
 * how much of the stack we take on, and that changes three things at once:
 * which categories matter (nobody needs a third-party MDR service when we are
 * the monitoring), how hard operability constrains the choice, and whose
 * people the operational load falls on.
 *
 * `client_operated` is the case where they run the tools and we consume the
 * telemetry, which is also the shape of the world the acceptance scenarios
 * were written in, so it stays the default.
 */
export const DeliveryModel = z.enum([
  /** Our SOC runs the stack. Their headcount is not the constraint; ours is. */
  'mssp_managed',
  /** Split. We run the detection and response tooling, they keep the rest. */
  'co_managed',
  /** They operate it, we monitor. Their capacity is the binding constraint. */
  'client_operated',
]);
export type DeliveryModel = z.infer<typeof DeliveryModel>;

/**
 * What we actually deliver on a managed engagement, and therefore which
 * categories we operate rather than merely recommend.
 *
 * It lives here rather than beside the rate card because it is now an intake
 * answer, not only a pricing input. `deliveryModel` says whether we operate;
 * this says how far that reaches. Without the pair, "co-managed" is a word with
 * no boundary attached, and the boundary is the whole question a client is
 * asking when they ask what they are buying.
 */
export const MsspServiceLevel = z.enum([
  /** Monitoring and alerting; the client still responds. */
  'monitoring',
  /** Monitoring plus active containment and response. */
  'mdr',
  /** MDR plus management of the underlying security devices. */
  'managed_security',
]);
export type MsspServiceLevel = z.infer<typeof MsspServiceLevel>;

export const ProcurementBias = z.enum(['commercial', 'open_source_first', 'no_preference']);
export type ProcurementBias = z.infer<typeof ProcurementBias>;

/**
 * Compliance frameworks the analyst can tick during intake (PROJECT_SPEC §5.4).
 * The id is also the namespace prefix for that framework's control ids, e.g.
 * `nist-csf-2.0:DE.CM`.
 */
export const FrameworkId = z.enum([
  'pci-dss-4.0',
  'hipaa',
  'iso-27001-2022',
  'soc-2',
  'gdpr',
  'nist-csf-2.0',
  'cis-v8',
  'nis2',
  'cert-in',
  'rbi-csf',
  'dpdp-2023',
]);
export type FrameworkId = z.infer<typeof FrameworkId>;

/**
 * How a product charges. `zero_licence` is the honest open-source case: the
 * licence line is genuinely 0, and the cost shows up in opsBurden and
 * implementation instead (CONTRIBUTING.md hard rule 8).
 */
export const PricingModel = z.enum([
  'per_endpoint_year',
  'per_user_year',
  'per_gb_day_year',
  'per_eps_year',
  'per_node_year',
  'per_privileged_user_year',
  'per_asset_year',
  'per_mailbox_year',
  'flat_tiered',
  'consumption',
  'zero_licence',
]);
export type PricingModel = z.infer<typeof PricingModel>;

/**
 * Provenance of a price. Anything below `analyst_estimate` must not reach a
 * client-facing number without a visible warning (PROJECT_SPEC §6).
 */
export const PricingConfidence = z.enum([
  'public_list',
  'vendor_quote',
  'analyst_estimate',
  'placeholder',
]);
export type PricingConfidence = z.infer<typeof PricingConfidence>;

/**
 * How well an effort figure is grounded. The ops-burden and implementation
 * analogue of `PricingConfidence`.
 *
 * A staffing estimate decides whether open source looks cheap or expensive
 * (hard rule 8), which makes it one of the most load-bearing numbers in the
 * catalog, and until this existed the schema could not tell a figure somebody
 * measured from one somebody guessed.
 */
export const EstimateConfidence = z.enum([
  /** The vendor publishes a sizing, staffing or services-effort guide. */
  'vendor_documented',
  /** Observed in a real deployment, and the notes say which. */
  'field_measured',
  /** StackFit's own reasoning from comparable tools. Most of the catalog. */
  'analyst_estimate',
  /** Nobody has looked yet. Requires a TODO in the product's notes. */
  'placeholder',
]);
export type EstimateConfidence = z.infer<typeof EstimateConfidence>;

export const AssetCriticality = z.enum(['low', 'medium', 'high', 'crown_jewel']);
export type AssetCriticality = z.infer<typeof AssetCriticality>;
