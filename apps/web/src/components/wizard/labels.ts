import type { AssetClass, ScoringDimension } from '@stackfit/schema';

/**
 * What the analyst reads on screen. Presentation only. The engine's vocabulary
 * is the enum, and this file never decides anything, it only names things.
 */

export const ASSET_GROUPS: readonly {
  readonly title: string;
  readonly hint: string;
  readonly classes: readonly AssetClass[];
}[] = [
  {
    title: 'Endpoints',
    hint: 'Anything a person sits at.',
    classes: ['windowsEndpoints', 'macosEndpoints', 'linuxEndpoints'],
  },
  {
    title: 'Servers',
    hint: 'Domain controllers count separately. They are the loudest thing in a Windows estate.',
    classes: ['windowsServers', 'windowsDomainControllers', 'linuxServers', 'fileServers'],
  },
  {
    title: 'Virtualisation',
    hint: '',
    classes: ['hypervisors', 'containerNodes'],
  },
  {
    title: 'Network',
    hint: 'Firewalls dominate log ingest. This is the count worth getting right.',
    classes: [
      'firewalls',
      'routers',
      'switches',
      'wirelessControllers',
      'vpnConcentrators',
      'loadBalancers',
    ],
  },
  {
    title: 'Data and applications',
    hint: '',
    classes: ['databases', 'internalWebApps', 'publicWebApps'],
  },
  {
    title: 'Operational technology',
    hint: 'No agent goes on a PLC, so these push the stack towards passive monitoring.',
    classes: ['otIcsScadaDevices', 'iotCctvPosDevices'],
  },
  {
    title: 'Cloud',
    hint: 'Accounts and subscriptions are log sources, not licensed assets.',
    classes: ['awsAccounts', 'azureSubscriptions', 'gcpProjects', 'cloudWorkloads'],
  },
  {
    title: 'SaaS',
    hint: '',
    classes: ['m365Seats', 'googleWorkspaceSeats', 'otherCriticalSaasApps'],
  },
  {
    title: 'Identity',
    hint: 'These size any PAM licence. Left blank, estimated from IT headcount and flagged.',
    classes: ['remoteUsers', 'privilegedAccounts', 'serviceAccounts'],
  },
];

export const ASSET_LABELS: Readonly<Record<AssetClass, string>> = {
  windowsEndpoints: 'Windows endpoints',
  macosEndpoints: 'macOS endpoints',
  linuxEndpoints: 'Linux endpoints',
  windowsServers: 'Windows servers',
  windowsDomainControllers: 'Domain controllers',
  linuxServers: 'Linux servers',
  fileServers: 'File servers',
  hypervisors: 'Hypervisors',
  containerNodes: 'Container / k8s nodes',
  routers: 'Routers',
  switches: 'Switches',
  wirelessControllers: 'Wireless controllers',
  firewalls: 'Firewalls / NGFW',
  vpnConcentrators: 'VPN concentrators',
  loadBalancers: 'Load balancers',
  databases: 'Databases',
  internalWebApps: 'Internal web apps',
  publicWebApps: 'Public web apps',
  otIcsScadaDevices: 'OT / ICS / SCADA devices',
  iotCctvPosDevices: 'IoT / CCTV / POS',
  awsAccounts: 'AWS accounts',
  azureSubscriptions: 'Azure subscriptions',
  gcpProjects: 'GCP projects',
  cloudWorkloads: 'Cloud workloads',
  m365Seats: 'Microsoft 365 seats',
  googleWorkspaceSeats: 'Google Workspace seats',
  otherCriticalSaasApps: 'Other critical SaaS apps',
  remoteUsers: 'Remote / roaming users',
  privilegedAccounts: 'Privileged accounts',
  serviceAccounts: 'Service accounts',
};

export const INDUSTRY_LABELS: Readonly<Record<string, string>> = {
  retail: 'Retail',
  healthcare: 'Healthcare',
  bfsi: 'Banking / financial services / insurance',
  manufacturing: 'Manufacturing',
  saas: 'SaaS / technology',
  education: 'Education',
  govt: 'Government',
  other: 'Other',
};

/**
 * The same industries, short enough for a metadata line.
 *
 * `INDUSTRY_LABELS` is written for the intake dropdown, where "Banking /
 * financial services / insurance" is the right amount of precision. On a card
 * footer it is longer than everything around it and wraps, which broke the
 * alignment of one preset card against the other five.
 */
export const INDUSTRY_SHORT: Readonly<Record<string, string>> = {
  retail: 'Retail',
  healthcare: 'Healthcare',
  bfsi: 'Banking and finance',
  manufacturing: 'Manufacturing',
  saas: 'SaaS',
  education: 'Education',
  govt: 'Government',
  other: 'Other',
};

export const REGION_LABELS: Readonly<Record<string, string>> = {
  in: 'India',
  us: 'United States',
  eu: 'European Union',
  uk: 'United Kingdom',
  apac: 'Asia-Pacific',
  mena: 'Middle East / North Africa',
  other: 'Other',
};

/** Said the way an analyst would say it on the call, not as the enum reads. */
export const DELIVERY_LABELS: Readonly<Record<string, string>> = {
  mssp_managed: 'We run it',
  co_managed: 'Co-managed',
  client_operated: 'They run it, we monitor',
};

/** The one line that explains the choice, under the control. */
export const DELIVERY_HINTS: Readonly<Record<string, string>> = {
  mssp_managed: 'Our SOC operates the stack. Their headcount is not the constraint, ours is.',
  co_managed: 'We take detection and response. They keep the rest.',
  client_operated: 'They operate it and we consume the telemetry. Their capacity binds.',
};

export const SENSITIVITY_LABELS: Readonly<Record<string, string>> = {
  public: 'Public',
  internal: 'Internal',
  regulated: 'Regulated (cardholder, health, personal data)',
  critical: 'Critical / national interest',
};

/**
 * What the client runs. Stated as a fact, because that is what it is (the
 * previous wording ("… preferred", "Hybrid) no strong preference") invited the
 * analyst to record an opinion and left a genuinely hybrid client unable to say
 * so.
 */
export const ENVIRONMENT_LABELS: Readonly<Record<string, string>> = {
  cloud: 'Cloud / SaaS: everything is in someone else’s cloud',
  on_prem: 'On premises: they run their own infrastructure',
  hybrid: 'Hybrid: materially both',
  air_gapped: 'Air-gapped: no internet path at all',
  not_asked: 'Not asked: infer it from the estate',
};

/** The separate question: what procurement will not sign off on. */
export const CONSTRAINT_LABELS: Readonly<Record<string, string>> = {
  none: 'No restriction',
  saas_not_permitted: 'SaaS not permitted: data residency or a regulator',
  self_hosted_not_permitted: 'Will not self-host: nobody to run it',
};

export const BIAS_LABELS: Readonly<Record<string, string>> = {
  commercial: 'Commercial products',
  open_source_first: 'Open source first',
  no_preference: 'No preference',
};

export const RISK_LABELS: Readonly<Record<string, string>> = {
  low: 'Low: regulated, board-level scrutiny',
  medium: 'Medium',
  high: 'High: pragmatic, cost-led',
};

export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  siem: 'SIEM',
  edr: 'EDR',
  ndr: 'NDR',
  pam: 'PAM',
  iam: 'IAM',
  vulnerability_management: 'Vulnerability management',
  email_security: 'Email security',
  soar: 'SOAR',
  backup: 'Backup',
  ngfw: 'Firewall / NGFW',
  asset_discovery: 'Asset discovery',
  deception: 'Deception',
  mdr: 'MDR',
};

export const DIMENSION_LABELS: Readonly<Record<ScoringDimension, string>> = {
  asset_coverage: 'Asset coverage',
  compliance_fit: 'Compliance fit',
  ops_fit: 'Operability',
  deployment_fit: 'Deployment fit',
  integration_fit: 'Integration fit',
  scale_fit: 'Scale fit',
  maturity: 'Maturity',
};

/**
 * Frameworks, short enough for a metadata line.
 *
 * The session list printed the ids: `pci-dss-4.0, dpdp-2023`. Those are
 * database keys, and on a screen an analyst opens in front of a client they
 * read as one. The full titles in `data/frameworks/` are the other extreme
 * ("Payment Card Industry Data Security Standard"); this is the form the
 * people in the room actually say out loud.
 */
export const FRAMEWORK_SHORT: Readonly<Record<string, string>> = {
  'pci-dss-4.0': 'PCI DSS 4.0',
  'dpdp-2023': 'DPDP 2023',
  'iso-27001-2022': 'ISO 27001',
  'nist-csf-2.0': 'NIST CSF 2.0',
  'soc-2': 'SOC 2',
  'rbi-csf': 'RBI CSF',
  'cert-in': 'CERT-In',
  'cis-v8': 'CIS v8',
  hipaa: 'HIPAA',
  gdpr: 'GDPR',
  nis2: 'NIS2',
};

/** The short name if there is one, otherwise the id with its hyphens opened up. */
export function frameworkLabel(id: string): string {
  return FRAMEWORK_SHORT[id] ?? id.replace(/-/g, ' ').toUpperCase();
}
