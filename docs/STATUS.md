# Status

**Current phase:** 3d — infrastructure fit + open decisions closed (in review)
**Last updated:** 2026-09-09

## Phase log

| Phase | State | Notes |
|---|---|---|
| 0 Scaffold + CONTRIBUTING.md + tooling | done | pnpm monorepo, Vitest projects, engine + schema skeletons, 3 green smoke tests. `pnpm audit` clean. Next.js app + Prisma deferred to Phase 5. |
| 1 Schemas + catalog format + 8 seed products | done | `packages/schema` populated; 3 frameworks + 3 catalog files + 8 products; real `catalog:validate`. Q2 (MSSP) did **not** block this phase — see below. |
| 2 `sizing.ts` + tests | done | `computeSizing` + `data/config/sizing-assumptions.yaml` (30 asset-class coefficients, each with a stated basis). Determinism test in place. 3 worked examples in `test/sizing-worked-examples.test.ts`. |
| 3 `cost.ts` + tests | in review | `computeProductCost` covering all 11 pricing models, plus money arithmetic in BigInt. `fx.yaml`, `labour-rates.yaml`, `cost-assumptions.yaml` written. Every catalog price is now sourced — no placeholders left. 145 tests green. |
| 3b Price freshness (**inserted, not in PROJECT_SPEC §11**) | in review | Prices now age and say so. `catalog:staleness` + `prices:refresh`. Verified live against the Azure meter feed. Inserted ahead of catalog expansion on purpose — see the decision below. |
| 3c Framework library (**inserted**) | in review | The remaining 8 frameworks written; all 11 now ship, 240 controls. Every framework carries a `sourceQuality` grade. Coverage-inflation guard reshaped to per-framework. |
| 3d Infrastructure fit (**inserted**) | in review | `infrastructure.ts` — estate shape and per-category relevance from the asset inventory. `category-weights.yaml`, `mssp-rate-card.yaml`. Q2 answered, §7.2 deviation decided, NIST regraded. |
| 4 `scoring.ts` + `portfolio.ts` + tests | not started | This is the phase that produces the Essential / Recommended / Ideal bundles. **No longer blocked** — frameworks landed in 3c, the MSSP rate card and infrastructure weighting in 3d. |
| 5 Intake wizard UI | not started | Also scaffolds apps/web (Next.js) + Prisma/SQLite + server-action mutation layer. |
| 6 Results dashboard | not started | |
| 7 Catalog expansion (≥5 per category) | not started | |
| 8 Export (DOCX/PDF/XLSX) | not started | |
| 9 Scenario save / clone / compare | not started | |
| 10 Polish + demo scenarios + README | not started | Pick + document the free hosting target (Vercel Hobby + Neon/Supabase free Postgres). |

## Decisions made

- 2026-09-09 — **Currency is per-scenario, not global.** `currency` is a field on `ClientProfile`. INR is the default; USD + EUR fully supported. FX from `data/config/fx.yaml` with `asOf`. (PROJECT_SPEC §13 Q1)
- 2026-09-09 — **All §5.4 frameworks ship in `data/frameworks/` from day one**, none prioritised at product level. The analyst ticks applicable frameworks per client during intake; those selections are what promote a category from optional to mandatory in `portfolio.ts` and what the coverage matrix in `coverage.ts` scores against. Two clients with identical inventories but different frameworks must produce different recommended stacks. (Q1)
- 2026-09-09 — **`region` on `ClientProfile` is a hint, never a constraint.** It pre-ticks the likely frameworks and suggests currency + labour rate as a convenience default; the analyst can always override. (Q1)
- 2026-09-09 — **No auth in v1, but build the seam.** Nullable `ownerId` / `createdBy` on the `Scenario` model; every mutation goes through a thin server-action layer so a future authz check has exactly one home. No auth code yet. (Q3)
- 2026-09-09 — **Portal is hosted, shared, multi-user (~5–6 people), on a zero-cost stack.** Keep the Prisma schema Postgres-portable; no SQLite-only features. Final host chosen in Phase 10. (Q4)
- 2026-09-09 — **OWASP Top 10 hardening is a standing requirement**: Zod at every input boundary, Prisma-only DB access (no raw/string-built SQL), security headers + CSP in the web app, secrets never committed, `pnpm audit` kept clean. (Q4) — added as CONTRIBUTING.md hard rule 10.
- 2026-09-09 — **No vendor include/exclude list.** Every vendor is eligible; recommendations are on merit + infra fit (on-prem / SaaS / cloud / hybrid / air-gapped) + framework fit, each with an operations-cost estimate. A `partnerStatus` field can be added later if reseller economics start to matter. (Q5)
- 2026-09-09 — **Phase 0 scope trimmed to the spec §11 DoD.** `apps/web` (Next.js, Tailwind, shadcn/ui, Recharts, Zustand) and Prisma/SQLite deferred to Phase 5; `docx`/`react-pdf`/`xlsx` to Phase 8; real `catalog:validate` logic to Phase 1 (stubbed now). `pnpm dev` and `pnpm db:push` are placeholder scripts until Phase 5.

### Phase 1

- 2026-09-09 — **Catalog YAML writes prices in minor units**, e.g. `unitPrice: { amountMinor: 5999, currency: USD }` for USD 59.99. Less readable than `59.99`, and deliberately so: hard rule 1 says no float, and this way no parse step ever has to round one.
- 2026-09-09 — **Placeholder pricing must use the sentinel `99999999` plus a note containing `TODO`.** Enforced in the `PricingRule` schema, so an invented-but-plausible number cannot hide behind the placeholder flag. `zero_licence` still requires a source — a free licence is a claim about the licence, and needs a link to it.
- 2026-09-09 — **Price sources and capability sources are separate.** `PricingRule.sources` backs the number; `Product.sources` backs the platform-support and licence-model claims. Both are mandatory. PROJECT_SPEC §5.3 put a single `sources` at product level; §6 requires one per price, and §6 wins.
- 2026-09-09 — **Control ids are namespaced `<framework-id>:<control>`** (`nist-csf-2.0:DE.CM`, `pci-dss-4.0:10`). `catalog:validate` fails if a product claims a control that does not exist in `data/frameworks/` — hard rule 2 covers invented compliance mappings, not just invented prices.
- 2026-09-09 — **Frameworks are held at Category / Control / Requirement level, not Subcategory / Safeguard level.** A product category ("a SIEM") is a meaningful answer to "NIST CSF DE.CM" and not to "DE.CM-01". CIS Implementation Groups (IG1/IG2/IG3) select Safeguards, so IG filtering arrives if and when Safeguards do.
- 2026-09-09 — **`satisfiedBy` on a control is StackFit's own mapping, not part of any published standard**, and is stated as such in every framework file. It is deliberately conservative: requirements closed by process, physical control or cryptography carry no product category at all, so a bundle cannot claim coverage a purchase does not buy.
- 2026-09-09 — **`maxScaleHint` from PROJECT_SPEC §5.3 became `scaleFloor` + `scaleCeiling`.** §7.3 hard-filters on both a floor and a ceiling, and a single hint cannot express a floor.
- 2026-09-09 — **AssetInventory is flat and fully optional.** Flat because the sizing coefficients in `data/config/sizing-assumptions.yaml` will be keyed by the same key set; optional because scoping calls do not produce clean data, and an absent class means "not asked", read as zero.
- 2026-09-09 — **⚠ Amends the day-one frameworks decision: 3 of 11 frameworks shipped, not all 11.** `nist-csf-2.0`, `cis-v8` and `pci-dss-4.0` are in, because those are what the seed catalog maps against and their control lists were verified against the publishers. The other 8 (HIPAA, ISO 27001:2022, SOC 2, GDPR, NIS2, CERT-In, RBI, DPDP 2023) are **outstanding and must land before Phase 4**, which is where framework selection actually promotes a category to mandatory. Writing 8 more mapping files in Phase 1 without sourcing each one would have been exactly the fabrication hard rule 2 forbids. — **Closed in Phase 3c**: all 11 now ship, each carrying a `sourceQuality` grade that records how well-sourced it actually is.

### Phase 2

- 2026-09-09 — **Sizing figures are floats, not integer minor units.** Hard rule 1 is about money; EPS, GB/day and TB are physical quantities and forcing them into minor units would buy nothing. Determinism is preserved instead by always walking asset classes in `AssetClass` declaration order, so the floating-point sum is order-stable, and by rounding only at the output boundary. There is a determinism test asserting exactly this, including that a reordered inventory object gives an identical result.
- 2026-09-09 — **A class's contribution to ingest is separate from whether it is a monitored asset.** `monitored: false` classes (AWS accounts, Azure subscriptions, GCP projects, other SaaS apps, M365/Workspace seats, remote users, privileged and service accounts) still generate EPS but do not count toward `monitoredAssetCount`. An AWS account is a log source, not something an agent is licensed onto; counting it would inflate the scale class and every per-asset ops-burden figure downstream.
- 2026-09-09 — **Retention is derived in sizing, not in portfolio**, because it drives `storageTb`. The longest requirement among the selected frameworks wins, falling back to the 90-day default. Compliance can only lengthen retention, never shorten it. Today only PCI DSS 4.0 sets one (365 days, requirement 10); the other frameworks' periods land with the remaining framework files.
- 2026-09-09 — **An estimated privileged-account count is flagged as estimated.** `privilegedAccountCountEstimated` is on the result and in the rationale, because that number sizes PAM licensing and analysts rarely capture it on a first call. A captured zero is deliberately distinguished from an absent count.
- 2026-09-09 — **Every asset-class coefficient carries a mandatory `basis` string.** §7.1 asks for a comment on where each came from; making it a required schema field means a coefficient cannot be added without stating its reasoning. All 30 are analyst estimates from industry rules of thumb, flagged as such at the top of the file.
- 2026-09-09 — **A config file with no wired-up schema is now a `catalog:validate` error**, not a warning. A new tunable cannot land in `data/config/` without a schema to check it.
- 2026-09-09 — **The engine takes assumptions as an argument and never reads `data/`.** `scripts/lib/load-config.ts` is the loader; the web app will get its own in Phase 5. This is what keeps the engine's no-fs rule true rather than aspirational.

**Worth eyeballing in the worked examples:** example A (60-staff retailer, PCI DSS) shows *more* storage than example B (320-staff firm) — 2.03 TB against 1.30 TB — despite less than half the ingest, purely because PCI DSS forces 365-day retention against B's 90. That is the tool working correctly, and it is exactly the kind of result that is worth being able to point at during a scoping call.

### Phase 3

- 2026-09-09 — **⚠ Deliberate deviation from the §7.2 formula: operational FTE is included in year 1.** The spec's `Year1 = licence + implementationServices + trainingCost + infraCost + hardwareCost` omits it, and `TCO(n) = Year1 + Σ Annual(2..n)` therefore counts ops FTE only from year 2. You are running the tool in year 1 too, and leaving it out understates exactly the open-source options hard rule 8 exists to keep honest — on the worked example it would have hidden about a third of Wazuh's three-year cost. **Flagging for your decision**: say the word and I will match the spec exactly instead. — **Decided in Phase 3d: kept.**
- 2026-09-09 — **Currency conversion is done in BigInt.** An amount in INR minor units multiplied by a rate in millionths passes 2^53 at around INR 100 million, where JavaScript numbers stop being exact. Acceptance test §12.7 forbids that drift, so there is a test converting 10^10 minor units and asserting the exact result.
- 2026-09-09 — **Rounding is half-away-from-zero, not `Math.round`.** `Math.round(-0.5)` is `-0` and biases negative amounts (credits, discounts) upward. Every money figure is a whole number of minor units, asserted in the determinism test.
- 2026-09-09 — **Infrastructure is charged only for products that can be self-hosted** (`on_prem` or `air_gapped` in their deployment modes) and is sized from GB/day and storage TB. A SaaS product carries no infra line because the vendor is already charging for theirs.
- 2026-09-09 — **The discount assumption is applied and announced, never applied silently** (§6 rule 5). Bands are matched on annual list licence spend, and whenever one bites the rationale says "This is an assumption, not a quoted discount."
- 2026-09-09 — **The licence uplift compounds on licence and support only.** People and infrastructure are re-costed each year from current rates rather than inflated, because the rate cards are the thing that should be re-read, not multiplied.
- 2026-09-09 — **Every pricing model's billable unit is an explicit mapping**, not a guess: per-endpoint uses `endpointCount`, per-node uses `serverCount`, per-asset uses `monitoredAssetCount`, consumption uses `gbPerDay × 365`. Getting these wrong is the easiest way to be confidently incorrect, so each is named in code and tested individually.

**Worth eyeballing in `test/cost-worked-examples.test.ts`.** The real catalog costed for the 60-staff PCI DSS retailer, US rates, USD, 3-year TCO:

| | Licence/yr | Ops FTE | 3-yr TCO |
|---|---|---|---|
| CrowdStrike Falcon Go | 2,700 | 0.11 | **71,180** |
| Nessus Professional | 4,790 | 0.23 | 144,232 |
| Greenbone OpenVAS (free) | 0 | 0.29 | 166,452 |
| Microsoft Sentinel | 17,833 | 0.32 | 252,957 |
| Wazuh | 0 | 0.53 | **322,867** |

Wazuh has a zero licence fee and the highest three-year cost in the table — 4.5× CrowdStrike — entirely on people. That is the comparison the tool exists to make. Re-run in INR at Indian labour rates and the ordering changes, which is the regional rate card doing its job.

### Phase 3b — price freshness (inserted phase)

- 2026-09-09 — **⚠ New phase inserted ahead of catalog expansion, against the stated preference to widen the catalog first.** The reasoning: a hand-researched price is correct for about a month and then quietly lies, and 50 more products would have meant 50 more rotting prices with nothing in the system that knows. Freshness also changes the *shape* of a catalog entry — every price now carries a `refresh` block — so doing it afterwards would have meant rewriting everything just added. It is the smaller piece and it makes the bigger one safe.
- 2026-09-09 — **Prices age against a policy, not a vibe.** `freshness-policy.yaml` gives each confidence level an allowance: 90 days public list, 180 vendor quote, 120 analyst estimate, 60 placeholder. A price passes through `fresh → ageing → stale`, turning ageing at 75% of its allowance so the backlog surfaces before anything expires.
- 2026-09-09 — **Every price declares how it gets re-checked.** `azure_retail_prices` is machine-refreshable; everything else is `manual` with a URL and a note on what to look for. Making the distinction explicit is the point: it keeps the manual backlog countable instead of hidden behind the automated majority. Currently **1 of 10 prices is machine-refreshable**.
- 2026-09-09 — **`today` is an engine input, never a clock read.** Keeps the no-`Date.now()` rule intact, keeps the determinism test meaningful, and makes "what did this scenario look like when we quoted it in March" answerable. Date maths runs at UTC midnight so a verdict does not change with the analyst's timezone.
- 2026-09-09 — **Freshness travels with the number.** `ProductCost` carries a `freshness` verdict and a `needsRecheck` flag, so a stale price is visible wherever the figure appears rather than only in a report nobody opens.
- 2026-09-09 — **`prices:refresh --write` never touches the `asOf` date, the notes or the confidence.** It changes the price and stops. Accepting a vendor change stays a dated human decision reviewed in a diff. It pins on the stable meter GUID rather than the meter name, and treats a retired meter or a changed `unitOfMeasure` as an error needing a human, because at that point the price is no longer comparable.

**Verified end to end.** Tampering the committed Sentinel rate to USD 3.90 and running
`pnpm prices:refresh` reported `DRIFT ... USD 3.90 → 4.30 (10.3%)` against Microsoft's live
feed, and `--write` corrected it.

### Phase 3c — framework library (inserted phase)

- 2026-09-09 — **All 11 frameworks now ship**, closing the Phase 1 amendment. 240 controls
  across HIPAA, ISO 27001:2022, SOC 2, GDPR, NIS2, CERT-In, RBI CSF and DPDP 2023, alongside
  the three seeded in Phase 1. ISO carries all 93 Annex A controls, not just the
  technological ones — omitting the governance and people controls would shrink the
  denominator and make every bundle look better against ISO than it is.
- 2026-09-09 — **Frameworks now carry a `sourceQuality` grade**, the compliance equivalent of
  `pricingConfidence`: `publisher_verified`, `secondary_sources` or `provisional`. Some
  publishers put their control list behind a paywall, a CAPTCHA or an unparseable PDF, and a
  coverage claim built on a secondary source should not look identical to one read from the
  standard itself. Anything below `publisher_verified` must say why in its `notes`, and a
  test enforces that. **Only `cis-v8` is `publisher_verified`.**
- 2026-09-09 — **`cert-in` and `rbi-csf` are `provisional`** — structure understood, exact
  control identifiers unverified. Usable for shortlisting; **must be reconciled against the
  originals before any client-facing coverage claim.** The CERT-In directions PDF is not
  machine-readable and secondary sources use their own labelling; RBI Annex 1 could not be
  read.
- 2026-09-09 — **⚠ `nist-csf-2.0` and `pci-dss-4.0` were graded `secondary_sources` without a
  recorded reason.** Notes were written stating what is checkable — that the control lists
  were not confirmed line by line against CSWP 29 and the PCI SSC document library — rather
  than asserting a retrieval failure nobody observed. **Worth your eye**: if these were in
  fact read from the publisher, they should be regraded `publisher_verified`. — **Resolved in
  Phase 3d**: NIST was verified against NIST's own workbook and regraded; PCI is genuinely
  gated (HTTP 403) and stays `secondary_sources`.
- 2026-09-09 — **19 over-broad mappings removed.** Each claimed a product for a control closed
  by policy, training, physical custody or cryptography — the rule `pci-dss-4.0.yaml`'s own
  header already stated. Two files argued against themselves: HIPAA's Security Awareness and
  Training mapped `email_security` under a note reading *"the training obligation itself is
  not a purchase"*, and Transmission Security mapped `ngfw` under *"encryption in transit,
  which is configuration rather than a product"*. Three HIPAA physical safeguards
  (164.310.b/c/d.1) mapped to EDR while `164.310.a.1` in the same subpart correctly refused a
  category. Also dropped: CIS Control 3 (Control 11 already claims backup — one purchase was
  scoring against two controls) and RBI's DLP strategy (**this catalog has no DLP category**;
  email security covers one egress channel of four, and the gap should show as a gap).
- 2026-09-09 — **The coverage-inflation guard is per-framework, not library-wide.** The
  original test asserted that fewer than half of all controls map to a product. That premise
  holds for the broad standards — ISO 47%, HIPAA 41%, SOC 2 35% — but not for frameworks
  written for practitioners: RBI 77%, CIS 72%, PCI DSS 67% are largely lists of technical
  controls, where a high rate is honest. The library sits at **125/240 (52%)** and a
  library-wide average is the wrong instrument at any threshold, because inflation happens in
  one file and ten conservative files will hide it. Replaced with a per-framework ceiling of
  85% (RBI, the densest honest file, is at 77%) plus the original strict assertion kept for
  ISO / HIPAA / SOC 2, where it is actually true. GDPR and NIS2 are excluded from the strict
  half: they are scoped to their security articles, so the denominator was filtered on
  purpose and a high rate there means nothing.
- 2026-09-09 — **Retention gained one entry, and the absences are documented.** `cert-in: 180`
  (2022 Directions, rolling 180 days, stored within India). HIPAA is deliberately *not*
  listed: 164.316(b)(2)(i)'s six-year rule covers policies and documentation, not audit logs.
  GDPR, NIS2 and DPDP require logging without naming a period, so the 90-day default applies.
  Sizing storage on an invented retention period would be exactly the fabrication hard rule 2
  forbids.

**Worth eyeballing.** Two clients with identical inventories but different frameworks now
produce genuinely different mandatory sets, which is what the Phase 1 day-one decision was
for. The mapping is conservative by design: a bundle cannot claim coverage a purchase does
not buy, and 115 of 240 controls map to nothing at all.

### Phase 3d — infrastructure fit, and the open decisions closed

**⚠ This phase adds a stage PROJECT_SPEC does not describe.** §7.4 step 1 ranks categories by
"risk-reduction weight, adjusted by industry and compliance". There is no infrastructure term
anywhere in the ranking — infrastructure appears only as a §7.3 hard filter on individual
products and a deployment-fit dimension weighted 10. The consequence: **a client with no
compliance obligation was ranked on generic weights alone**, so an all-SaaS consultancy and an
all-on-prem manufacturer got the same stack. Compliance promotes a category to mandatory;
nothing decided whether a category was worth anything in the first place.

- 2026-09-09 — **Infrastructure now drives category ranking, and for an unregulated client it
  is the only thing that does.** New pure stage `packages/engine/src/infrastructure.ts`:
  `computeInfrastructureProfile` derives an estate shape from the asset inventory, and
  `computeCategoryRelevance` turns that into a weight per product category, with rationale.
- 2026-09-09 — **Raw asset counts cannot be compared, so every class carries a surface
  weight.** An estate with 5,000 M365 seats and 4 firewalls is not 99.9% SaaS. Each of the 30
  asset classes maps to exactly one of eight attack surfaces with a weight saying how much
  surface one unit represents — a Windows endpoint is the reference unit at 1.0, a domain
  controller is 25, an AWS account is 20, an M365 seat is 0.15. Same convention as the EPS
  coefficients: every weight carries a mandatory `basis`.
- 2026-09-09 — **A category whose surfaces are all absent is ruled out, not ranked last.**
  `requiresAnyOf` is the sharp end of this stage. Selling network detection to a company with
  no network is not a cheaper recommendation, it is a wrong one. The SaaS consultancy example
  below has NDR, NGFW and deception eliminated with a stated reason.
- 2026-09-09 — **An absent inventory means "not asked", never "does not exist".** With no
  counts captured the estate shape is `unknown`, the multiplier stays at 1.0, and **nothing is
  eliminated**. Eliminating on silence would hide categories the analyst never got to discuss.
- 2026-09-09 — **The affinity model is a weighted mean, so it cannot inflate.** Weight is
  `baseRiskReduction × Σ(surface share × affinity)`. Shares sum to 1, so a category with no
  stated affinities scores exactly its base weight and every deviation traces to a surface the
  client actually has. Only deviations from neutral are written down.
- 2026-09-09 — **The weights are grounded in published incident data, cited in the file
  header.** M-Trends 2025 (exploits 33% of initial infection, stolen credentials 16%); DBIR
  2025 (credential abuse 22%, exploitation 20%, phishing 16%, and **22% of exploitation
  breaches against edge infrastructure, an eightfold rise** — this is why firewalls and VPN
  concentrators carry high surface weights and a 1.8 vulnerability-management affinity); DBIR
  2026 (software vulnerabilities now 31% of breaches, the top entry point). ⚠ The
  cloud-specific vector split — phishing first, credentials second, against an exploit-led mix
  overall — is **secondary reporting of M-Trends, not Mandiant's own summary**, which states
  only the overall figures. The direction is well corroborated; the exact split is not
  verified, and the file says so.

**Worked examples**, same catalog and same weights, ranking driven only by what the client owns:

| Estate | Shape | Top categories | Ruled out |
|---|---|---|---|
| SaaS consultancy, 120 staff | `saas_centric` | edr 115, **iam 111**, **email_security 91** | ndr, ngfw, deception |
| On-prem manufacturer | `on_prem_centric` | edr 109, **vuln_mgmt 107**, iam 90, backup 88 | — |
| OT plant, 900 SCADA devices | `ot_heavy` | **ngfw 109**, asset_discovery 100, vuln_mgmt 96, **ndr 92** | — |
| Cloud-native startup | `cloud_native` | **iam 130**, backup 97, pam 95, edr 94 | deception |

The OT plant is the one worth eyeballing: it leads with segmentation and passive network
monitoring, and EDR falls out of the top four — which is right, because you cannot put an
agent on a PLC. That result comes entirely from the inventory, with no compliance input.

- 2026-09-09 — **§13 Q2 ANSWERED. The MSSP alternative ships in v1, and the rate card is a
  blend**: base platform fee by scale class + per-endpoint + per-server + per-GB/day, times a
  service-level multiplier (`monitoring` / `mdr` / `managed_security`). **Published SMB quotes
  decide it**: a 50-endpoint client is quoted USD 1,500–5,000/month, which a per-endpoint rate
  of USD 8–35 cannot reach — most of a small engagement is fixed cost that does not care about
  endpoint count. Flat tiers by scale class were rejected because a client one endpoint over a
  boundary gets a step change that is not real, and step 6 exists to compare like for like.
  `data/config/mssp-rate-card.yaml` is checked against the published bands at three sizes in
  its own header. **⚠ `analyst_estimate` and staying that way** — no MSSP publishes a rate
  card, so these are synthesised from aggregator ranges. For comparison, never for quoting.
- 2026-09-09 — **§7.2 ops-FTE deviation DECIDED: keep it.** Operational FTE stays in year 1,
  against the spec's formula. Following the spec exactly hid about a third of Wazuh's
  three-year cost on the worked example, which defeats hard rule 8. Recorded as a standing
  deviation rather than an open question.
- 2026-09-09 — **`nist-csf-2.0` regraded to `publisher_verified`.** Every Category id and name
  was diffed against NIST's own machine-readable CSF 2.0 Core workbook (the CSRC `nudp` JSON
  endpoint, which serves an XLSX); all 22 match verbatim. The 3c note speculating that it might
  be misgraded is resolved — it was.
- 2026-09-09 — **`pci-dss-4.0` stays `secondary_sources`, and this one cannot be raised.**
  Fetching `PCI-DSS-v4_0_1.pdf` from the PCI SSC document server returns **HTTP 403** without
  accepting the licence agreement. Requirements 4, 8, 9, 10, 11 and 12 were matched verbatim
  against titles quoted in PCI SSC's own published SAQ documents; the rest are consistent
  across independent sources. Note v4.0.1 is now current.

**Follow-ups this phase created:**

- `mssp-rate-card.yaml` carries an `asOf` and a confidence but is **not** covered by
  `catalog:staleness`, which only walks catalog prices. It will rot silently. Worth extending
  the staleness checker to config-level prices.
- **The inventory has no on-premises mail server class**, so a client running their own
  Exchange registers no mailboxes and `email_security` is down-weighted rather than eliminated
  for exactly that reason. Noted in the config; worth an inventory field in Phase 7.
- The computed weight is a **relative ranking score, not a percentage** — it exceeds 100 when
  affinities are favourable (iam 130 for the cloud-native estate). Fine for ranking; do not
  render it as "% risk reduced".

## Open questions
- **opsBurden and implementation figures have no confidence field.** Every one in the seed catalog is an analyst estimate, flagged in each product's `notes`, but the schema cannot distinguish an estimate from a measured figure the way `pricingConfidence` does for prices. Worth adding an `opsBurdenConfidence` before the catalog grows in Phase 7.

## Known placeholders

<!-- every catalog entry still on placeholder pricing, so they can be chased down before any client sees output -->
<!-- `pnpm catalog:validate` prints this list; keep it in sync -->

**None.** Both Phase 1 placeholders were closed by research on 2026-09-09:

- `microsoft-sentinel` — now `public_list` at USD 4.30/GB, read from the **Azure Retail Prices
  API** (`prices.azure.com`), which is Microsoft's own authoritative price feed. Both the
  Sentinel pricing page and the `learn.microsoft.com` billing article deliberately decline to
  quote a figure, so the API is the only primary source. Two caveats are recorded on the entry:
  the rate is region-specific (East US is at the cheap end) and anything over 100 GB/day should
  be costed on a commitment tier instead, which ran about 30% cheaper in the same API response.
- `microsoft-defender-for-endpoint` — now `analyst_estimate`, P1 at USD 3.00 and P2 at USD 5.20
  per user per month, with a P1 tier added. **Deliberately not `public_list`:** Microsoft
  publishes no standalone per-plan price on any of its own pages, only the bundled Defender
  Suite at USD 12.00/user/month, which is a different SKU. These are the consistently reported
  list rates from licensing specialists, corroborated across independent sources, but they are
  not vendor-published. The entry says so.

### Sourced, but still worth arguing with

Nothing below is a placeholder; all of it is sourced or reasoned. It is listed because it is
where the model is most likely to be *wrong* rather than merely uncertain.

| What | Confidence | Why it matters |
|---|---|---|
| `labour-rates.yaml` | analyst estimate | Decides whether open source looks cheap or expensive. Salary aggregators disagree wildly — PayScale puts a UK security engineer at GBP 39,123, which looks low against the London market, so that figure is set above the aggregator average deliberately. The `apac` row is the weakest in the file. |
| `cost-assumptions.yaml` discount bands | analyst estimate | 0% / 15% / 25% by deal size. Stated out loud in the rationale whenever applied, never silent. |
| `cost-assumptions.yaml` infra rates | analyst estimate | Crude on purpose. The point is that self-hosting is never free, not vCPU-level accuracy. |
| MDE P1/P2 rates | analyst estimate | See above. The number that usually decides the deal is whether the client is on E3 or E5, not the standalone rate. |
| `sizing-assumptions.yaml` coefficients | analyst estimate | Ranked below. |

Also outstanding (not placeholders, simply not written yet):

- `data/config/fx.yaml` — **written**, USD base, rates read 2026-09-09 (1 USD = 94.843169 INR,
  0.860279 EUR). ⚠ Already going stale. Re-read before any proposal goes out; a three-year TCO
  quoted at a year-old rate is wrong by however much the currency has moved.
- GBP is **not** a supported scenario currency, so the UK labour rate is held in USD. Worth
  adding if UK engagements are likely.

`data/config/sizing-assumptions.yaml` is written, but **every coefficient in it is an
analyst estimate**, not a measured figure. The ones most worth arguing with, in order of
how much they move the answer:

1. `firewalls: 100 EPS` — dominates ingest in every worked example (76% of example A's
   total). Tune this first when an estimate looks wrong.
2. `windowsDomainControllers: 25 EPS` — the loudest thing in a Windows estate and the
   easiest to underestimate.
3. `averageEventBytes: 500` and `peakFactor: 1.5` — scale everything downstream linearly.

## Environment notes

- **Toolchain installed 2026-09-09.** Node **v24.19.0** (winget `OpenJS.NodeJS.LTS` now
  tracks the 24 LTS line, not 22 — `.node-version` bumped to `24`, `engines.node` is
  `>=22.12`). pnpm **9.15.0** installed via `npm install -g pnpm@9.15.0` into the
  user-scoped global (`%APPDATA%\npm`) — `corepack enable` needs admin to write shims into
  `C:\Program Files\nodejs\`, so we skipped it.
- **`pnpm install` runs no third-party lifecycle scripts** except `esbuild` (allow-listed in
  `package.json` → `pnpm.onlyBuiltDependencies`). Supply-chain blast radius from install is
  limited to that one well-known package.
- **`pnpm audit` is clean** as of 2026-09-09. Getting there required:
  - `vitest` 2 → **4.1.11** (v2's Vitest-UI file-read advisory GHSA-5xrq-8626-4rwp was
    Critical; all findings were dev-server-only and not reachable via `vitest run`, but
    hard rule 10 says keep audit clean).
  - added **`vite` ^7.3.6** as an explicit devDependency — Vitest 4 makes Vite a peer and
    was otherwise resolving the vulnerable `vite@5.4.21` / `esbuild@0.21.5`.
  - `eslint` 9 → **10.10.0** (`@eslint/js` **10.0.1** — its version line diverged from
    `eslint`'s), `@types/node` 22 → **24** to match the runtime.
  - root `package.json` gained **`"type": "module"`** so root-level ESM (`vitest.config.ts`,
    `scripts/`) typechecks under `verbatimModuleSyntax`.
- **Re-run `pnpm audit` before every phase.** This tree will drift; treat a dirty audit as
  a build break (hard rule 10).
