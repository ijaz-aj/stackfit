# PROJECT SPEC — "StackFit": Security Solution Advisor & Budget Portal

> **How to use this file**
> 1. It is the requirement, and it is the arbiter when an implementation and an
>    assumption disagree.
> 2. Section 13 lists the questions that had to be answered before any code was
>    written. Section 11 is the phase plan.
> 3. Work one phase at a time. Building several at once is how a phase ships
>    without the tests that were supposed to gate it.

---

## 1. Mission

Build a web portal used during **security assessment and scoping** engagements. An analyst enters a prospective client's environment (assets, headcount, compliance obligations, budget), and the portal outputs:

- A recommended security stack (SIEM, EDR/XDR, PAM, IAM, VM, NDR, email security, SOAR, backup, MDR).
- Which specific product fits which part of their environment, and **why**.
- A full cost model: year-1 cost, annual recurring, 3-year TCO, per category and per product.
- Three budget-tiered bundles (Essential / Recommended / Ideal) with a gap analysis of what the budget does **not** cover.
- A client-facing proposal export.

The portal must treat **open-source stacks as first-class options**, costed honestly (licence = 0, but implementation + operational FTE cost is real). It must also be able to model a **managed/MSSP delivery option**, where the client buys an outcome rather than running the tools themselves, and compare that against the DIY stack on the same cost basis.

**Non-goal:** this is not a procurement or quoting system. It produces indicative budgets and shortlists, not binding quotes.

---

## 2. Primary user & core flow

**User:** a security consultant / SOC analyst doing a scoping call.

```
Client intake wizard  →  Environment sizing (auto)  →  Requirements derivation
        →  Catalog filtering (hard constraints)  →  Fit scoring
        →  Portfolio optimisation under budget  →  Results dashboard  →  Export proposal
```

Every scoping session is saved as a **Scenario** so it can be reopened, cloned for a similar client, and A/B compared (e.g. "Wazuh + Velociraptor + in-house ops" vs "Defender E5 + Sentinel").

---

## 3. Fixed tech decisions

Do not re-litigate these. If you think one is wrong, say so once, then follow it.

| Concern | Decision |
|---|---|
| Framework | Next.js (App Router) + TypeScript, strict mode |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| State | React Server Components where possible; Zustand for wizard state |
| Validation | Zod for every input boundary and every catalog record |
| Persistence | SQLite via Prisma (file-based, zero setup). Schema must be Postgres-portable |
| Engine | Pure TypeScript in `packages/engine` — **no React, no DB, no I/O**. Deterministic in, deterministic out |
| Tests | Vitest. Engine requires unit tests; UI gets smoke tests only |
| Catalog | YAML files in `data/catalog/`, loaded and Zod-validated at build time |
| Export | Markdown → DOCX (docx lib) and PDF (react-pdf). HTML preview first |
| Auth | None in v1. Local single-user tool. Structure code so auth can be added later |

**Currency:** multi-currency from day one (USD / INR / EUR). All money stored as integer minor units + currency code. FX rates live in `data/config/fx.yaml` with an `asOf` date. Never store floats for money.

---

## 4. Repo layout

```
stackfit/
  apps/web/                 # Next.js app
  packages/engine/          # pure recommendation + costing engine
    src/sizing.ts
    src/cost.ts
    src/scoring.ts
    src/portfolio.ts
    src/coverage.ts
    src/index.ts
    test/
  packages/schema/          # Zod schemas + shared TS types
  data/catalog/             # one YAML file per product category
  data/config/              # fx.yaml, labour-rates.yaml, sizing-assumptions.yaml
  data/frameworks/          # control mappings (NIST CSF 2.0, CIS v8, PCI DSS 4.0, ...)
  docs/
  CONTRIBUTING.md
```

---

## 5. Domain model

Define these in `packages/schema`. These field lists are the minimum, extend as needed.

### 5.1 ClientProfile (wizard input)

```ts
{
  orgName, industry,            // retail, healthcare, bfsi, manufacturing, saas, education, govt, other
  region,                       // drives labour rates + currency + regulator defaults
  employeeCount,
  itStaffCount,
  securityStaffFte,             // 0 is a valid and very important case
  hasSoc: 'none' | 'business_hours' | '24x7' | 'outsourced',
  riskTolerance: 'low' | 'medium' | 'high',
  dataSensitivity: 'public' | 'internal' | 'regulated' | 'critical',
  compliance: string[],         // see 5.4
  budget: { annualCap, oneTimeCap, currency, horizonYears },
  deploymentPreference: 'cloud' | 'on_prem' | 'hybrid' | 'air_gapped',
  procurementBias: 'commercial' | 'open_source_first' | 'no_preference',
  retainedTools: string[]       // products they already own and will keep
}
```

### 5.2 AssetInventory

Counts, each with an optional "criticality" and "internet-facing" flag:

- Windows servers, Windows domain controllers, Linux servers, macOS endpoints, Windows endpoints, Linux endpoints
- Hypervisors (VMware / Proxmox / Hyper-V), containers / k8s nodes
- Routers, switches, wireless controllers (by vendor: Cisco, Fortinet, Juniper, MikroTik, Aruba, other)
- Firewalls / NGFW (vendor + throughput class)
- VPN concentrators, load balancers
- Databases (by engine), web apps (internal / public), file servers
- OT / ICS / SCADA devices, IoT / CCTV / POS terminals
- Cloud: AWS/Azure/GCP account count, workload count
- SaaS: M365 / Google Workspace seats, other critical SaaS
- Remote / roaming user count, privileged account count, service account count

The intake UI must offer **industry presets** that pre-fill a plausible inventory (e.g. "retail chain, 40 stores"), which the analyst then edits. Scoping calls do not produce clean data.

### 5.3 Product (catalog record)

```ts
{
  id, name, vendor, category, subcategory,
  licenceModel: 'commercial' | 'open_source' | 'open_core' | 'freemium' | 'managed_service',
  tiers: [{ name, capabilities[], pricing: PricingRule[] }],
  supports: {
    os[], deviceClasses[], cloudPlatforms[], deploymentModes[],
    maxScaleHint, airGapCapable: boolean
  },
  integrations: string[],          // other product ids / protocols (syslog, OTel, CEF, API)
  controlsCovered: string[],       // control ids from data/frameworks
  opsBurden: { baseFte, ftePerThousandAssets },   // ← critical for honest OSS costing
  implementation: { effortDays, skillLevel, typicalWeeks },
  maturity: 'emerging' | 'established' | 'legacy',
  strengths[], weaknesses[], bestFor[], avoidWhen[],
  pricingConfidence: 'public_list' | 'vendor_quote' | 'analyst_estimate' | 'placeholder',
  sources: [{ url, asOf }],
  notes
}
```

### 5.4 Frameworks

Selectable compliance drivers, each mapped to required control families:
PCI DSS 4.0, HIPAA, ISO 27001:2022, SOC 2, GDPR, NIST CSF 2.0, CIS Controls v8 (IG1/IG2/IG3), NIS2, CERT-In directions, RBI cyber security framework, DPDP Act 2023.

A selected framework can promote a category from *optional* to **mandatory** (e.g. PCI DSS makes log retention + FIM + VM mandatory; that constraint must be visible in the UI as "required by PCI DSS 4.0 req 10").

---

## 6. Catalog seeding rules

Seed **at least 5 candidates per category**, spanning open-source, mid-market, and enterprise. Suggested starting candidates (verify each before entering; do not assume this list is current or complete):

- **SIEM / log:** Wazuh, Graylog, Security Onion, OpenSearch/Elastic Security, Microsoft Sentinel, Splunk ES, IBM QRadar, Rapid7 InsightIDR, LevelBlue (AlienVault) USM Anywhere, Google SecOps
- **EDR / XDR:** Wazuh + Velociraptor, osquery/Fleet, OpenEDR, Microsoft Defender for Endpoint P1/P2, CrowdStrike Falcon (Go/Pro/Enterprise), SentinelOne Singularity, Sophos Intercept X, Bitdefender GravityZone, ESET PROTECT, Elastic Defend
- **NDR / network:** Suricata, Zeek, Arkime, Corelight, Darktrace, ExtraHop
- **PAM:** Teleport, HashiCorp Vault (secrets, not full PAM), Devolutions, ManageEngine PAM360, Delinea, CyberArk, BeyondTrust, Keeper
- **IAM / MFA / SSO:** Keycloak, Authentik, Authelia, Entra ID P1/P2, Okta, JumpCloud, Duo
- **Vulnerability mgmt:** OpenVAS/Greenbone, Nuclei, Trivy, Nessus Pro, Tenable IO, Rapid7 InsightVM, Qualys VMDR, Defender VM
- **Email security:** Rspamd/Proxmox Mail Gateway, Defender for O365 P1/P2, Proofpoint, Mimecast, Abnormal, Sublime Security
- **SOAR / automation:** Shuffle, n8n, StackStorm, TheHive + Cortex, Tines, Splunk SOAR, Torq
- **Backup / recovery:** UrBackup, Bacula, Proxmox Backup Server, Veeam, Acronis, Rubrik
- **Perimeter / NGFW:** OPNsense, pfSense, FortiGate, Palo Alto, Sophos XG, Cisco FTD
- **Asset discovery / CMDB:** NetBox, GLPI, Snipe-IT, runZero, Lansweeper
- **Deception:** OpenCanary, Thinkst Canary
- **MDR / managed:** Huntress, Arctic Wolf, Red Canary, Expel, plus a configurable **"In-house MSSP"** provider record representing our own managed SOC offering, priced from `data/config/mssp-rate-card.yaml`

### Pricing honesty rules — non-negotiable

1. **Never invent a price.** Every `PricingRule` needs `pricingConfidence` and at least one `source` with an `asOf` date.
2. Anything you cannot source gets `pricingConfidence: 'placeholder'` with an obvious sentinel value and a `TODO` note.
3. The UI must badge any result containing placeholder pricing, and the results page shows an overall **pricing confidence score**.
4. Every export carries: *"Indicative budgetary estimates based on published list pricing as of {date}. Not a quote. Actual pricing subject to vendor negotiation, channel discount, and bundling."*
5. Real-world discounting exists: support a configurable `discountAssumption` per deal size (e.g. 0% SMB, 15% mid, 25%+ enterprise), shown as an explicit toggle rather than baked in silently.

---

## 7. The engine

Four pure stages. Each is independently unit-tested.

### 7.1 Sizing (`sizing.ts`)

Derives ingest volume and scale class from the asset inventory. This drives SIEM pricing more than anything else.

```
EPS_total   = Σ (assetCount[type] × eps_per_asset[type] × verbosity_factor)
GB_per_day  = EPS_total × 86400 × avg_event_bytes / 1e9
Licensed_GB = GB_per_day × peak_factor
Storage_TB  = GB_per_day × retention_days × (1 - compression_ratio) / 1024
```

All coefficients (`eps_per_asset`, `avg_event_bytes`, `peak_factor`, `compression_ratio`, `verbosity_factor`) live in `data/config/sizing-assumptions.yaml` with a comment on where each came from. They are **tunable in the UI** via an "advanced sizing" panel, because these defaults will be wrong for some clients and the analyst needs to override them.

Also derive: privileged account count (if not given, estimate from itStaffCount), endpoint count, monitored-asset count, and a `scaleClass` of small / mid / large / enterprise.

### 7.2 Cost model (`cost.ts`)

Support these pricing models: `per_endpoint_year`, `per_user_year`, `per_gb_day_year`, `per_eps_year`, `per_node_year`, `per_privileged_user_year`, `per_asset_year`, `per_mailbox_year`, `flat_tiered` (volume bands), `consumption`, `zero_licence`.

```
Year1   = licence + implementationServices + trainingCost + infraCost + hardwareCost
Annual  = licence×(1+uplift) + support + infraCost + operationalFteCost
TCO(n)  = Year1 + Σ Annual(2..n)
```

`operationalFteCost = (baseFte + ftePerThousandAssets × assets/1000) × loadedAnnualSalary[region]` from `data/config/labour-rates.yaml`.

**This is the most important part of the whole tool.** It is what makes "Wazuh is free" comparable to "CrowdStrike costs $X". Never display a licence-only figure without the TCO next to it.

Also model: infra cost for self-hosted tools (derive vCPU/RAM/storage need from sizing, price from a simple cloud/on-prem rate card), and 3-year cash-flow by year.

### 7.3 Fit scoring (`scoring.ts`)

Two passes.

**Hard filters** (eliminate, with a recorded reason):
- Does not support a required OS / device class / cloud platform
- Cannot meet the deployment mode (e.g. air-gapped requirement vs SaaS-only product)
- Below scale floor or above scale ceiling for this environment
- Explicitly excluded by the analyst

**Weighted score 0–100** over surviving products:

| Dimension | Default weight | Notes |
|---|---|---|
| Asset coverage | 25 | % of their inventory the product actually protects |
| Compliance fit | 20 | controls covered ÷ controls required by their frameworks |
| Ops fit | 20 | penalise when required FTE > available FTE. **A powerful tool nobody can run scores badly** |
| Deployment fit | 10 | |
| Integration fit | 10 | with retained tools and with the rest of the selected bundle |
| Scale fit | 10 | |
| Maturity / support | 5 | |

Weights are configurable and `procurementBias` shifts them (open-source-first raises ops-fit weight, since OSS failure mode is operational, not financial). Every score must come with a human-readable **rationale string list** — the UI shows "why this was picked" and "why this was ruled out", never a bare number.

### 7.4 Portfolio optimisation (`portfolio.ts`)

1. Rank categories by risk-reduction weight, adjusted by industry and compliance. Compliance-mandated categories are **mandatory**.
2. Compute per-candidate value density: `(riskReduction × fitScore) / annualisedTCO`.
3. Greedy knapsack under `budget.annualCap` and `budget.oneTimeCap`: fill mandatory categories first (cheapest acceptable option if budget is tight), then maximise value density with the remainder.
4. Apply **bundle synergy**: if products from one vendor/suite are already selected, apply a configurable suite discount and an integration-fit bonus. Avoid selecting two products that do the same job.
5. Emit three bundles:
   - **Essential** — minimum defensible posture + everything compliance-mandated
   - **Recommended** — best value inside the stated budget
   - **Ideal** — ignores the budget cap; exists to quantify the gap
6. Emit an **MSSP alternative** for each bundle: same coverage, delivered as a managed service, costed from the MSSP rate card, so the client can see build-vs-buy on one page.
7. If the budget cannot cover the mandatory set, **say so plainly**. Output the shortfall amount and the minimum viable budget. Do not silently downgrade to a stack that fails their compliance obligation.

### 7.5 Coverage (`coverage.ts`)

Map the selected bundle to NIST CSF 2.0 functions (Govern/Identify/Protect/Detect/Respond/Recover) and to CIS v8 safeguards. Output a coverage matrix and an explicit **gap list**, each gap tagged with the residual risk and the cheapest product that would close it.

---

## 8. Outputs

Results dashboard shows:

1. **Bundle comparison** — 3 tiers side by side: total year-1, annual, 3-year TCO, coverage %, pricing confidence.
2. **Per-category recommendation cards** — chosen product, runner-up, rationale bullets, cost line, what it covers in *their* environment ("covers 38 Windows servers, 12 Linux servers, 40 POS terminals").
3. **Cost breakdown** — stacked bar by category, licence vs services vs infra vs FTE, and a 3-year cash-flow chart.
4. **Coverage matrix** — heatmap against the selected frameworks.
5. **Gap analysis** — what is not covered and what it would cost to fix.
6. **Sizing worksheet** — the derived EPS/GB/day with every assumption visible and editable.
7. **Assumptions & disclaimers** panel — always present, always exported.

Export: client-facing proposal (DOCX + PDF) with an executive summary, current-state, recommended stack, costs, roadmap phasing, and assumptions. Plus a raw XLSX/CSV of the cost model for the analyst.

---

## 9. UI notes

- The intake wizard is the main risk to usability. Keep it to **6 steps max**, every step skippable with sane defaults, progress saved continuously. An analyst on a call cannot fill 80 fields.
- Show a live "estimated ingest / estimated budget" readout in the wizard sidebar that updates as they type. Instant feedback is the selling point.
- Results must be explainable at every point. If you cannot render a rationale for a number, do not render the number.
- Dark mode. Dense, table-heavy, professional. This is a working tool, not a landing page.

---

## 10. `CONTRIBUTING.md` — write this at Phase 0

Include: repo layout, "engine stays pure", the money-as-integer-minor-units rule, the pricing-honesty rules, commit conventions (conventional commits, one logical change per commit), the command list (`pnpm dev`, `pnpm test`, `pnpm catalog:validate`), and a standing instruction that catalog data changes are never mixed into code commits.

---

## 11. Build phases

Complete one phase, show me the diff and the test output, and **wait for approval** before the next.

| Phase | Deliverable | Definition of done |
|---|---|---|
| 0 | Scaffold, CONTRIBUTING.md, tooling, CI-less test runner | `pnpm test` runs green with one trivial test |
| 1 | Schemas + catalog format + **8 seed products across 3 categories** | `pnpm catalog:validate` passes; every price has a source or a placeholder flag |
| 2 | `sizing.ts` + tests | Three worked example environments produce sane EPS/GB numbers I can sanity-check |
| 3 | `cost.ts` + tests | All pricing models covered; OSS-vs-commercial TCO comparison test proves FTE cost is included |
| 4 | `scoring.ts` + `portfolio.ts` + tests | Budget-shortfall case returns an explicit shortfall, not a degraded silent stack |
| 5 | Intake wizard UI | Can complete a full intake in under 4 minutes with presets |
| 6 | Results dashboard | Every number traceable to a rationale |
| 7 | Catalog expansion to full breadth | ≥5 candidates per category |
| 8 | Export (Markdown → DOCX/PDF) + XLSX cost model | Proposal opens cleanly in Word |
| 9 | Scenario save / clone / compare | Two scenarios diffable side by side |
| 10 | Polish, seed demo scenarios, README | A cold start demo works end to end |

---

## 12. Acceptance tests (write these as real tests)

1. **Small retail client**, 60 staff, 40 POS, 6 servers, PCI DSS, USD 25k/yr cap → returns a viable Essential bundle including log retention and FIM; no placeholder-priced product in the mandatory set without a warning.
2. **Zero security staff**, 300 endpoints, mid budget → MDR or heavily managed options outrank self-hosted SIEM. Ops-fit penalty must be visible in the rationale.
3. **Open-source-first**, 500 assets, low budget, 2 security FTE → OSS stack recommended, and its 3-year TCO is **not** zero; FTE and implementation cost appear as the dominant line items.
4. **Air-gapped OT environment** → all SaaS-only products hard-filtered with a stated reason.
5. **Impossible budget**: HIPAA client, USD 3k/yr cap → returns explicit shortfall + minimum viable budget, not a fake recommendation.
6. **Determinism**: same input twice → byte-identical output.
7. **Currency**: same scenario in USD and INR gives consistent totals under the configured FX rate, with no floating-point drift.

---

## 13. Answer these before writing code

1. Primary currency and region for the first release, and which compliance frameworks matter most for the initial client base?
2. Should the "In-house MSSP" provider be included in v1, and if so what rate card shape (per endpoint/month, per GB/day, flat tiers)?
3. Do you want a public/self-service mode later (client fills it in themselves), or is this analyst-only forever? Affects whether auth and rate limiting get stubbed now.
4. Preferred deployment for the portal itself: local-only, or hosted for the team?
5. Any vendors that must be included or excluded for partner/reseller reasons?

---

## 14. Standing guardrails

- Do not fabricate pricing, vendor capabilities, or compliance mappings. Mark unknowns and move on.
- Do not put business logic in React components. If it computes money or scores, it belongs in `packages/engine`.
- Do not add a dependency without saying why in the commit message.
- Do not skip tests for the engine, however tight the deadline is.
- When the spec is ambiguous, settle it with one focused question rather than guessing across five files.
- Prefer boring, readable code. This tool will be maintained by a security person, not a full-time frontend engineer.
