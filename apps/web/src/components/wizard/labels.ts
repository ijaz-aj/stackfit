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
    hint: 'Domain controllers are counted separately: they are the loudest thing in a Windows estate.',
    classes: ['windowsServers', 'windowsDomainControllers', 'linuxServers', 'fileServers'],
  },
  {
    title: 'Virtualisation',
    hint: '',
    classes: ['hypervisors', 'containerNodes'],
  },
  {
    title: 'Network',
    hint: 'Firewalls dominate log ingest in almost every estate; this is the count worth getting right.',
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
    hint: 'You cannot put an agent on a PLC. These counts are what push a stack towards passive monitoring.',
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
    hint: 'Privileged accounts size any PAM licence. Left blank, it is estimated from IT headcount and flagged as estimated.',
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

export const REGION_LABELS: Readonly<Record<string, string>> = {
  in: 'India',
  us: 'United States',
  eu: 'European Union',
  uk: 'United Kingdom',
  apac: 'Asia-Pacific',
  mena: 'Middle East / North Africa',
  other: 'Other',
};

export const SOC_LABELS: Readonly<Record<string, string>> = {
  none: 'No SOC',
  business_hours: 'Business hours only',
  '24x7': '24x7',
  outsourced: 'Outsourced',
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
