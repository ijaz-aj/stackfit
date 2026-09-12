# Status

**Current phase:** 9 — scenario save / clone / compare (in review)
**Last updated:** 2026-09-12

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
| 4 `scoring.ts` + `portfolio.ts` + tests | in review | Both stages plus all seven §7.4 steps. `scoring-weights.yaml`, `portfolio-assumptions.yaml`. **Reviewed; 7 defects found and fixed**, each pinned by a regression. 244 tests green. |
| 4b `coverage.ts` (**inserted**) | in review | The §7.5 stage: coverage matrix per framework, CSF Function roll-up, risk-graded gap list, costed fix plan. `coverage-assumptions.yaml`. The engine pipeline is now complete end to end. 299 tests green. |
| 5 Intake wizard UI | in review | Next 16 + React 19 + Tailwind v4 + Prisma 7/SQLite. Six steps, presets, continuous save, live readout. `runPipeline` + `@stackfit/data` extracted so the app and the tests share one path. 325 tests green; `pnpm audit` clean. |
| 6 Results dashboard | in review | All seven parts of §8, server-rendered off one pipeline run. Recharts cost + cash-flow charts on a validated palette. Sizing assumptions are editable per scenario. **Reviewed; six defects found and fixed** — deployment fit read "no preference" as a demand, the fit score was rendered with no working shown, a control was credited to a tier that does not sell it, Ideal optimised for value rather than fit, a partial control had no route to being closed, and the fix list offered purchases that closed nothing. Both pre-Phase-7 open questions closed; the SKU is now part of the recommendation. 368 tests green. |
| 7 Catalog expansion (≥5 per category) | in review | **65 products across all 13 categories**, up from 8 across 3. Every category holds at least five. 106 catalog prices, all fresh, no placeholders. **Three engine defects found and fixed**, each pinned by a regression: a bigger budget could buy less compliance, a mandated control was outranked by one more funded category, and ops fit returned a flat score for every product when the client had no security staff. **`ProductTier.limits` added**, closing the design question the phase raised — five vendor limits now enforced exactly, two previously undeliverable free tiers back in the catalog. Both §12.1 and §12.2 acceptance assertions tightened to what the spec actually asks for. 377 tests green. |
| 8 Export (DOCX/PDF/XLSX) | in review | All four outputs off one document model: HTML preview, DOCX, PDF and an XLSX cost model. Roadmap phasing added to the engine. The §6 rule 4 disclaimer is verbatim in every one of them and pinned by a test. Three new dependencies, audit clean. 415 tests green. |
| 9 Scenario save / clone / compare | in review | Save already worked; clone copies profile, inventory and sizing overrides, and `compareScenarios` in the engine diffs two runs at both ends — what the analyst changed, and what it cost. Refuses to subtract across currencies; has no notion of an "original", so flipping the sides tells the same story. 425 tests green. |
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

### Phase 4 — fit scoring and portfolio assembly

- 2026-09-09 — **Asset coverage is scored against a category's remit, not the whole estate.**
  §7.3 says "% of their inventory the product actually protects" without saying what the
  denominator is. Taken literally it would be the whole estate, which makes an email gateway
  permanently unbuyable: it covers mailboxes, so it would score ~5% on the largest-weighted
  dimension, and §7.4 step 2 compares fit scores *across* categories when ranking value
  density. `categoryRemits` in `scoring-weights.yaml` is the denominator instead, so a gateway
  covering every mailbox scores 100.
- 2026-09-09 — **The hard filters are deliberately narrower than §7.3's list**, because a
  filtered product is invisible to the analyst in a way a low score is not.
  `deploymentPreference` only eliminates when it is `air_gapped` — that is a requirement, and a
  SaaS product in an air-gapped site cannot work at all, whereas an on-prem product for a
  cloud-preferring client is merely not what they asked for, which is what deployment fit
  scores. The "unsupported OS / device class / cloud platform" filter is applied only in the
  form that is safe to automate: a product reaching *none* of the assets its own category
  exists to protect.
- 2026-09-09 — **Ops fit degrades linearly rather than falling off a cliff**, and the
  zero-security-staff case is explicit. Zero FTE is valid, common (§5.1 says so), and would
  otherwise divide by zero. It scores 15, not 0 — such a client can still buy something, it
  just cannot be something they operate, and the §7.4 step 6 managed alternative is the honest
  answer for them.
- 2026-09-09 — **`operationalFteFor` is shared between costing and scoring.** A product scored
  as operable and then costed as needing twice the team would be worse than either answer
  alone, so there is one definition.
- 2026-09-09 — **`ClientProfile` gains `excludedProducts`** for the §7.3 analyst-exclusion
  filter. This is a per-scenario judgement — a failed PoC, a vendor the board will not approve
  — and not the vendor include/exclude list ruled out for v1. Every vendor stays eligible in
  the catalog.
- 2026-09-09 — **"Avoid two products doing the same job" is structural, not a penalty.** One
  product per category. Two SIEMs is not a bundle worth costing.
- 2026-09-09 — **The suite integration bonus never reaches the published fit score.** It ranks
  candidates during assembly only, because a fit score has to keep meaning "fit for this
  client" rather than "fit given what we happened to pick first". The suite discount is
  announced as an assumption wherever it applies, per §6 rule 5.
- 2026-09-09 — **A framework cannot mandate a category the estate has nothing for.** Mandatory
  requires the category to be applicable to the infrastructure *and* required by the framework;
  otherwise the tool would demand a purchase that protects nothing.
- 2026-09-09 — **"Minimum defensible posture" (§7.4 step 5) is defined as a weight floor**, not
  a fixed list, because the weight already accounts for infrastructure. A SaaS-only company's
  essentials are then genuinely different from a manufacturer's, rather than both getting the
  same five boxes.

**⚠ A fixture bug worth knowing about.** `buildProduct` was casting rather than parsing, so a
pricing rule written with the wrong keys (`bands`/`amount` instead of `tiers`/`flatPrice`)
priced silently at **zero** — which made every portfolio budget assertion vacuous while the
tests still passed. It now parses through the `Product` schema. Worth checking any other
fixture that casts.

### Phase 4 review — seven defects found and fixed

A deliberate review pass over the engine, verified by running the code rather than reading it.
All seven are fixed and each is pinned by a regression test that names the wrong answer.

| # | Severity | Defect |
|---|---|---|
| 1 | High | **Asset coverage counted raw assets.** A SIEM ingesting every server, DC and firewall scored **0.5/100** in a 5,000-seat estate — mailboxes outnumbered infrastructure one-for-one, on the heaviest-weighted dimension. Now uses weighted surface units: the same case scores **18.5**, a real gap rather than a headcount artefact. |
| 2 | High | **The suite discount reached `annualRecurring` but not `tco`.** Two fields in one selection disagreed about the same product, and the wrong one was the headline number. The discount now goes through `computeProductCost`, so licence, support, cash-flow and TCO move together. |
| 3 | Medium | **The MSSP alternative ignored the bundle**, so Essential and Ideal quoted identically. Service levels now declare which categories they operate; the alternative reports what it replaces, what it does not, and the residual. |
| 4 | Medium | **A mandated category the estate had nothing for vanished silently** — neither mandatory nor reported. Now surfaces as an explicit scope question. |
| 5 | Low | **`minimumViableAnnual` counted a mandatory category with no candidate as zero**, so it could be quoted below what buys compliance. Now declared a lower bound, with the missing categories named. |
| 6 | Low | **Essential claimed "the budget is tight" with no cap set** — false client-facing text. |
| 7 | Trivial | Dead `SCALE_ORDER` export; inline import type. |

- 2026-09-09 — **Stacked discounts multiply, they do not add.** 25% then a further 10% is 32.5%
  off, not 35%. Relevant now that the suite discount composes with the volume band.
- 2026-09-09 — **MSSP service levels declare `coveredCategories`.** Deliberately conservative:
  identity, privileged access and backup are excluded at every level, because providers will
  monitor them but running them is rarely on the contract. That is the line buyers most often
  assume is further right than it is, and getting it wrong flatters the managed option.

**The pattern worth remembering:** findings 1 and 2 share a root cause — *a principle
established in one stage was not carried into the next*. Weighted units and
discount-consistency were each solved once and dropped a file later. Worth checking for
explicitly when `coverage.ts` and the web app land.

### Phase 4 — §12 acceptance scenarios, and the defect they found

- 2026-09-09 — **The PROJECT_SPEC §12 acceptance scenarios now exist**, in `test/scenarios/`.
  CONTRIBUTING.md has treated them as a standing gate since Phase 0 and they had never been written —
  scenarios 1–5 all need `scoring.ts` and `portfolio.ts`, which only landed in Phase 4. Until
  now the engine had 244 unit tests over fixtures and **nothing that ran the pipeline end to
  end against committed data**, which is exactly where both Phase 4 review defects lived.
- 2026-09-09 — **They live at the repo root, not `packages/engine/test/scenarios/`** as CONTRIBUTING.md
  originally said. `vitest.config.ts` records a deliberate convention that package-level tests do
  not read files, and an acceptance scenario that does not run the committed catalog is not an
  acceptance scenario. CONTRIBUTING.md's path reference was updated to match.
- 2026-09-09 — **⚠ They found a third defect on first run: the budget cap was being tested
  against a total that included salary.** `annualRecurring` includes operational FTE, and §7.4's
  knapsack compared it to `budget.annualCap` — charging the client's own security team to a
  purchase order, once per product, for staff already on payroll. On the §12.1 retail scenario
  at a USD 25k/yr cap:

  | product | licence | ops FTE cost | annualRecurring |
  |---|---|---|---|
  | wazuh | 0 | 89,519 | **92,194** |
  | crowdstrike-falcon-go | 2,700 | 18,573 | **21,273** |

  Every open-source option was unaffordable on salary alone and CrowdStrike was the only product
  in the catalog that fitted. **The tool was telling a 60-person retailer it could not afford a
  free SIEM** — inverting hard rule 8, which exists to stop open source looking free, not to
  price it out of a purchase order.

- 2026-09-09 — **Money is now constrained against money, and people against people.**
  `ProductCost.procurementAnnual` (licence + support + infrastructure) is what the budget cap,
  the cheapest-acceptable ordering, the mandatory floor and the shortfall are judged against.
  People remain constrained via the ops-fit score and the bundle FTE warning. **TCO is unchanged
  and still includes operational FTE** (§7.2, hard rule 8) — and so is the MSSP build-vs-buy
  comparison, deliberately: a managed service replaces staff effort, so a build figure excluding
  people would flatter the managed option.

  The same scenario now returns Nessus + CrowdStrike + Graylog at **USD 12,840/yr spend**, states
  **USD 141,178/yr total** once people are counted, warns 0.76 FTE is needed against 0.5
  available, and reports ngfw/iam/pam/ndr unfunded because the catalog has no product for them.

**⚠ Two scenarios are limited by the catalog** (8 products, 3 categories). §12.1 cannot verify a
firewall or IAM selection; §12.2 cannot verify that MDR outranks a self-hosted SIEM, because no
MDR product exists. Each asserts what is verifiable today and names what is not — **both must be
tightened when Phase 7 lands**, and the tests say so inline.

**Resolved below**: `procurementBias: 'open_source_first'` now gives open-source and open-core
products a ranking preference as well as raising the ops-fit weight.

### Phase 4 — three more defects, found by varying the scenario inputs

Writing the acceptance scenarios was worth it twice over: running them at *different budgets*
found two more defects that a single fixed scenario would never have shown.

- 2026-09-09 — **⚠ A bigger budget could buy LESS.** Ranking purely by value density let an
  expensive high-density product take the money early and starve every category after it:

  | annual cap | products | categories covered |
  |---|---|---|
  | USD 8,000 | 3 | 3 |
  | USD 15,000 | **1** | **1** |

  A client whose budget went up would have been shown a worse stack. §7.4 step 3 already
  anticipates this — *"cheapest acceptable option if budget is tight"* — but that only ran for
  the mandatory fallback. Recommended now builds both ways and keeps whichever covers more
  weighted need; density wins ties, so an unconstrained budget still gets the better products.
  Pinned by a monotonicity test walking seven budget levels.

- 2026-09-09 — **`procurementBias: 'open_source_first'` did nothing to prefer open source.**
  §7.3 has it *raise* the ops-fit weight, which is honest, but on its own that **penalises**
  open source because operability is where OSS is weakest. Nothing acted on the "first" in the
  name and §12.3's "OSS stack recommended" went unmet. Now a tunable
  `openSourcePreferencePoints` (8) tilts the ranking for open-source and open-core products
  under that bias — applied to ranking only, never written into the published fit score, and the
  ops-fit weight is still raised so an unoperable tool still loses. **This resolves the open
  question raised in the previous session.**

- 2026-09-09 — **Config prices were never checked for staleness.** The MSSP rate card and the
  FX table carry an `asOf` and go stale exactly like a catalog price, but `catalog:staleness`
  only walked the catalog — so while the catalog was policed to the day, these two aged
  silently. A three-year TCO quoted at a year-old FX rate is wrong by however much the currency
  moved, and nothing would have said so. `assessPriceFreshness` now takes any dated price;
  verified that at 2027-03-28 both report STALE and the command exits non-zero.

- 2026-09-09 — **§12.3's budget was not actually low.** The spec says "low budget"; USD 40k/yr
  for a 500-asset estate comfortably affords commercial licences, so the scenario was not
  testing what it claimed. At a genuine USD 8k/yr the engine returns a fully open-source stack
  (Velociraptor + OpenVAS + Graylog) and the assertion is now that *every* selection is open
  source or open core, not that at least one is.

**Pattern, again:** every defect this session came from *the same principle not being carried
between stages, or a test that was weaker than the claim it stood for*. The acceptance scenarios
are the counter-measure, and they have now found four defects in two sittings.

### Phase 4b — coverage, the last engine stage

`sizing → cost → scoring → portfolio → coverage` is now whole. §7.5 had no phase
of its own in PROJECT_SPEC §11, and Phase 6's dashboard needs it (§8.4 coverage
matrix, §8.5 gap analysis), so it was inserted ahead of the UI rather than
discovered missing halfway through building the results page.

- 2026-09-11 — **Coverage needs two signals to agree, and they are kept apart.**
  `Control.satisfiedBy` is StackFit's category-level judgement ("a SIEM
  satisfies this"); `Product.controlsCovered` is one product's own sourced
  claim. Both agreeing is `covered`. The right *kind* of tool in the stack with
  no claim on the control is `partial` — reported, counted as uncovered, and
  never shown as coverage. A coverage figure should be the one you can defend.
- 2026-09-11 — **Controls no purchase can satisfy are excluded from the
  denominator.** 115 of the library's 240 controls map to no product category at
  all — policy, training, physical custody, cryptography. Counting them would
  peg every stack near 50% and mark a client down for not buying a policy.
- 2026-09-11 — **⚠ Addressability is a property of the control, never of the
  bundle.** Found while reviewing the first draft, which let a product claiming a
  `satisfiedBy: []` control pull that control into the denominator. Two bundles
  for the same client would then have been scored out of different totals, and
  §8.1 puts three bundles side by side. Such a claim is now reported as a
  conflict to settle in the data and counts neither way. Pinned by a regression.
- 2026-09-11 — **Five committed product claims fall outside the framework's own
  category mapping** — Wazuh claiming CIS 1 and 4, Defender claiming CIS 7,
  Sentinel claiming CIS 17 and RS.MA. Each is arguable on the merits (Wazuh does
  do configuration assessment; Defender does have TVM). Coverage takes the
  product's specific sourced claim at face value and says in the rationale that
  the category mapping is worth revisiting, rather than silently preferring
  either signal. **Worth your eye** — the fix is in `data/frameworks/`, not code.
- 2026-09-11 — **The six CSF Functions are declared in the framework file, not
  parsed out of the control id.** `DE.CM` is in Detect by NIST's own identifier
  scheme, and deriving it in code would hide a structural claim about a
  published standard inside the engine. `Framework.groups` is generic, so PCI's
  six goals or ISO's four themes can follow later; only NIST is grouped today.
  Grouping is all or nothing, enforced in the schema — a half-grouped framework
  would roll up a partial denominator and read as a coverage figure.
- 2026-09-11 — **NIST CSF is always reported, selected or not.** §7.5 asks for
  the Function view as a way of *reading* a stack, which is a different question
  from what the client is regulated by. Each framework's coverage carries
  `inScope`, and only the selected ones feed the headline summary.
- 2026-09-11 — **§7.5's "CIS v8 safeguards" is served at Control level, not
  Safeguard level**, per the Phase 1 decision. CIS is just another framework to
  this stage; nothing about the 18 Controls is special-cased.
- 2026-09-11 — **The gap list and the shopping list are two different answers,
  and both ship.** §7.5 asks for "the cheapest product that would close it",
  which is a per-gap question. Buying that answer gap by gap purchases a second
  tool to do a job something already on the list does — and makes the result
  depend on the order the gaps happen to be listed in, which the first draft did
  (a control id sorting `13` before `8` bought a cheap NDR it did not need).
  `remediation` is a greedy cover instead: fewest purchases closing the most
  gaps, products that actually claim a control exhausted first. Each gap names
  the purchase that closes it, so the two views cross-reference rather than
  contradict.
- 2026-09-11 — **Fix costs are procurement spend; the FTE travels beside them.**
  The same split §7.4's knapsack makes. This is the principle the Phase 4 review
  warned would be dropped between stages, carried deliberately rather than
  re-decided — as is the rule that a price's confidence and freshness travel
  with the number, so a gap priced from a stale figure says so.

**Tier limits.** `ProductTier.limits` was added on 2026-09-12, after the phase
had hit seven vendor limits with nowhere to put any of them. Three kinds,
because the three behave differently:

| Kind | Measured against | Behaviour |
|---|---|---|
| `caps` | a sizing figure the unit names | eliminates that tier, with the vendor's own wording in the reason |
| `prerequisites` | `ClientProfile.retainedTools` | eliminates that tier unless the analyst records the holding; unmet by default |
| `allowances` | nothing — unmeasurable here | never eliminates; carried into the tier's scoring rationale |

Where the seven ended up: **five enforced exactly** (Duo Free 10 users, Sublime
100 mailboxes, TheHive Community 2 users, runZero Community 100 assets, Entra ID
Free's prerequisite subscription), **one still approximated** (Tines Free's three
live workflows — a workflow is not a quantity the sizing stage produces, so
`scaleCeiling: small` stays as the stand-in), and **three carried as visible
allowances** (Tines' workflows, n8n's metered executions, TheHive's
one-organisation limit).

Two tiers that had been dropped from the catalog entirely are back: Duo Free and
Entra ID Free. Verified end to end on the §12.1 retailer — at 60 employees with
no retained tools both are ruled out and Duo Essentials is bought; at 60
employees holding `microsoft-365` Entra ID Free becomes available and is
selected at zero cost, correctly, because they are already paying for it; at 8
employees Duo Free is selected. The second and third of those were unreachable
before, and the first was wrong.

Adding the field also exposed a latent bug: `scoreProducts` collapsed a product
to a single score when its *first* tier was eliminated. That was correct while
every hard filter was product-level and became wrong the moment a tier could be
ruled out on its own terms — a capped free tier would have taken the paid tier
beside it. It now keys off the product-level filter directly.

**Worth eyeballing.** The §12.1 retailer's stack — Nessus, CrowdStrike, Graylog —
read against the CSF Functions:

| Function | Covered |
|---|---|
| Govern | 0/0 — nothing here is bought, and nothing should be |
| Identify | 2/2 |
| Protect | 1/4 |
| Detect | 2/2 |
| Respond | **0/4** |
| Recover | **0/1** |

It can see and it can find. It cannot respond and it cannot recover. That is one
line of a slide and it falls straight out of the data.

PCI DSS itself scores 5 of 8 buyable controls (62.5%), with requirements 1, 7 and
8 — firewalls, least privilege and identity — graded critical because PCI marks
them mandatory and the client selected PCI. **All nine gaps are unclosable from
the current three-category catalog**, and the output says exactly that rather
than returning an empty fix list.

The other worked example is the hard-rule-8 one: a 250-seat manufacturer at a
USD 3,000/yr cap is told the two purchases that would close the most gaps are
OpenVAS and Wazuh, **both zero-licence**, at USD 4,900/yr and 0.9 FTE between
them. The gap analysis prices free software the same way the cost stage does.


### Phase 5 — the intake wizard, and the app around it

- 2026-09-11 — **The engine runs in the browser.** `computeSizing` is pure TypeScript with no
  I/O, so the wizard imports it directly and the ingest readout moves on the keystroke with no
  round trip. Spend needs the catalog, eleven config files and the framework library, so it
  comes back from a server action a moment later and the readout says so while it is in
  flight. Two clocks, one engine, no second implementation of either number.
- 2026-09-11 — **`runPipeline` was extracted to the engine before the app could call it.** The
  acceptance harness had the only copy of the wiring. A second copy in the app would have
  meant the §12 scenarios proved something about the harness rather than about what an analyst
  actually runs — the exact failure this repo has now found four times in other forms.
- 2026-09-11 — **`@stackfit/data` is a package now**, for the same reason: scripts, repo-root
  tests and the web app's server components all read `data/`, and a second loader is how two
  loaders start disagreeing about which files exist. The engine still never touches the
  filesystem; this package is the boundary that keeps that true rather than aspirational.
- 2026-09-11 — **⚠ `module: NodeNext` had to go.** The packages' relative imports carried
  `.js` extensions pointing at files that do not exist — correct under NodeNext, unresolvable
  by Turbopack, and `experimental.extensionAlias` turns out to be webpack-only. Switched to
  `module: preserve` across the repo: bundler-style resolution, specifiers as written. 45
  files, mechanical, and one of the Phase 0 gotchas disappears with it. Nothing ever executed
  the emitted `dist/`, which is what made this safe.
- 2026-09-11 — **Presets are data, not component constants.** `data/presets/intake-presets.yaml`
  holds six estates with a mandatory `basis` each, validated by `catalog:validate` like
  everything else. A preset asserts what a typical estate looks like, which is a tunable
  assumption and belongs where the analyst can argue with it (hard rules 4 and 6).
- 2026-09-11 — **An empty count box is not a zero.** Blank means "not asked", a typed 0 means
  "asked, and there are none". Sizing already reads them differently — an absent privileged
  account count is estimated and flagged, a captured zero is trusted — and clearing a field
  must not quietly write a captured zero.
- 2026-09-11 — **Changing the scenario currency re-labels the caps; it never converts them.**
  An analyst who changes the currency has almost always picked the wrong code, not asked for
  a conversion, and a silent conversion would change a figure they typed.
- 2026-09-11 — **A stored scenario that no longer parses is reported, not thrown.** Profiles
  and inventories live as JSON text (Prisma has no Json scalar on SQLite, and the schema has
  to stay Postgres-portable), and one row written before a schema change must not take out the
  list of every other session.
- 2026-09-11 — **⚠ A blank intake does not show zero.** With no estate captured nothing is
  licensed, but a self-hosted tool still needs its minimum footprint and somebody still has to
  run it — about INR 410,000/yr and 1.3 FTE on the current rate cards. The readout labels that
  as the floor cost of owning the tools rather than leaving a suspiciously cheap stack on
  screen. Pinned by a test.
- 2026-09-11 — **CSP carries a per-request nonce** (`src/proxy.ts`, Next 16's rename of
  middleware), so `script-src` is enforceable without `unsafe-inline`. `style-src` still
  allows inline style, because Next and Tailwind both emit it during hydration and there is no
  nonce hook — a much smaller hole, and stated rather than hidden. Every page renders
  dynamically as a result, which costs nothing here since every page reads the database.
- 2026-09-11 — **⚠ `prisma@latest` is an 8.0.0 release candidate.** Pinned to the stable
  7.10.0 pair. Prisma 7 is Rust-free, so SQLite needs the better-sqlite3 driver adapter, and
  three packages had to join the pnpm build-script allowlist (`prisma`, `@prisma/engines`,
  `better-sqlite3`) with reasons recorded in the commit.
- 2026-09-11 — **`pnpm audit` went dirty and is clean again.** Two advisories inside the Prisma
  CLI's own tree — `mysql2` and `deepmerge-ts`, neither reachable from this app, both real —
  are pinned forward through `pnpm.overrides`. Same move the repo already makes for vite.

**Verified end to end against the running app**, not just in tests: the create action returns
a 303 and a new row, the save action writes through and the list page shows the new name, the
estimate action returns a full summary (4,780 EPS, 206.5 GB/day, 365-day retention, 1,017
monitored assets for the retail preset), and the delete action removes the row. The CSP,
including its nonce, is on every response.

**What Phase 5 does not do.** The results dashboard is Phase 6, so the review step shows the
three bundles and the sizing worksheet rather than §8's full output. There is no results page,
no charts and no export yet. The wizard's *client-side* behaviour — typing, autosaving,
re-estimating — could not be exercised in a browser this session (no automation available),
so it is verified through the server actions and the logic tests, not through a rendered
click-through. **Worth a five-minute manual pass before Phase 6.**


### Phase 6 — the results dashboard

Every part of §8 ships: bundle comparison, per-category cards, cost breakdown,
coverage matrix, gap analysis, sizing worksheet and the assumptions panel. The
definition of done was "every number traceable to a rationale", so the rationale
strings every stage has been carrying since Phase 2 are finally on screen.

- 2026-09-11 — **The dashboard is server-rendered, and the tier lives in the URL.**
  Everything on the page is derived from one `runPipeline` call; shipping the catalog
  and eleven config files to the browser to re-derive it would be absurd, and putting
  the Essential/Recommended/Ideal switch in client state would make a particular view
  unsendable. `?bundle=ideal` is a link an analyst can paste into an email.
- 2026-09-11 — **Two things the engine was keeping to itself are now exposed.**
  `ProductScore` reports `coveredAssets` and `missedAssets` in the client's raw counts,
  because §8.2 wants a card that says "covers 1,200 Windows endpoints, 90 Windows
  servers, 10 firewalls" and the weighted surface units the score is computed from are
  the wrong number to say out loud. `BundleSelection` now carries the `ProductCost` it
  was selected on, so a discounted product's licence line cannot disagree with the
  total above it — that is the Phase 4 review's finding 2, which would otherwise have
  happened again one stage later.
- 2026-09-11 — **Chart colour was computed, not chosen.** Four categorical slots in
  fixed order, validated against this app's own panel surface: lightness band, chroma
  floor, CVD separation (worst adjacent ΔE 8.4 protan), normal-vision floor (19.8) and
  3:1 contrast all pass. Marks are capped at 24px with a 2px surface gap between
  stacked segments, grids are solid hairlines, and the same figures appear as a table
  underneath — a tooltip must never be the only way to read a value.
- 2026-09-11 — **⚠ Running the HIPAA preset exposed a presentation defect.** Coverage
  read **0%** because no catalog product claims a single HIPAA control — true, and it
  reads as "this stack does nothing for you". The distinction that matters is between
  a stack that covers nothing and a catalog nobody has mapped against that framework,
  so the engine now says which it is, and the comparison table names the partials
  beside the percentage. Fixed in `coverage.ts`, pinned by a test.
- 2026-09-11 — **§8.6's "editable" is implemented, not deferred.** `SizingOverrides`
  is stored with the scenario: the committed coefficients stay as they are, and an
  analyst who knows *these* firewalls are quieter than the default says so on the call
  and watches the whole page re-derive. An overridden row shows what it replaced, so
  the reasoning behind the default is not thrown away.
- 2026-09-11 — **A retention override sets the floor only.** Deciding 30 days is
  enough does not exempt a PCI client from requirement 10's 365. The rule that
  compliance can only lengthen retention had to survive the override or it was never
  a rule.
- 2026-09-11 — **Overrides are written by the worksheet alone**, and the wizard's
  autosave never touches that column. Two tabs open on one scenario would otherwise
  undo each other — the wizard would save a draft holding stale overrides on top of
  one just typed on the dashboard.
- 2026-09-11 — **An unreadable override is dropped; an unreadable profile is not.**
  The override is a convenience over defaults that are always valid, so losing it
  costs a re-type. Refusing to open the scenario would cost far more, and the two
  failures are deliberately not treated alike.

**Verified against the running app.** The hospital preset renders all seven sections;
dropping its firewalls from 100 EPS to 5 through the worksheet moved the estate from
2,786 EPS / 120.3 GB-day to 1,836 / 79.3 — exactly the 10 × 95 expected — with every
downstream figure re-derived and the override's provenance shown on the row.

**⚠ Still unverified in a browser.** No browser automation was available in this
session, so the dashboard is verified by rendering its HTML and driving its server
actions over HTTP, not by looking at it. The charts in particular have been validated
for colour and written to spec but **never seen**. Worth ten minutes with `pnpm dev`
before Phase 7.


### Phase 6 review — the deployment dimension was reading a non-answer as an answer

Found by varying the scenario inputs, the same way the last four defects were.

- 2026-09-12 — **⚠ "No preference" was scored as a demand for hybrid.**
  `deploymentPreference: 'hybrid'` is the wording on the wizard's own dropdown for
  a client with no strong view, and §7.3 scoring read it as a requirement. Any
  product without a hybrid deployment mode scored **30 out of 100** on the
  deployment dimension for a client who had expressed no opinion at all. In the
  committed catalog that is the two cloud-delivered products, and it applied even
  to the estate cloud delivery suits best: a SaaS consultancy with no server room
  marked CrowdStrike down to 30 for not offering an on-prem option it has no use
  for. A self-hosted-only product would have been penalised the same way in a
  cloud-native estate; this catalog simply has none yet.
- 2026-09-12 — **When nothing is stated, the estate decides.** `scoring` now runs
  *after* `infrastructure` in the pipeline and takes `estateShape`. The shape-to-
  deployment-mode affinities are data (`deploymentFit.byEstateShape` in
  `scoring-weights.yaml`), one entry per shape, each with a mandatory `basis`, and
  the schema rejects the file if a shape is missing — the same convention as the
  surface weights and the EPS coefficients.
- 2026-09-12 — **An inferred preference is a weaker claim than a stated one, and
  is scored like one.** Stated bands are unchanged at 30–100; inferred bands are
  compressed to 55–100. A guess should move a ranking without overturning it, and
  every rationale says which of the two produced the number — "this is StackFit
  reading the asset counts, not something the client said."
- 2026-09-12 — **An unknown estate scores every product alike (85).** No
  preference and no inventory is not evidence against anything. Same rule as
  Phase 3d's "an absent inventory means *not asked*, never *does not exist*",
  carried rather than re-decided.
- 2026-09-12 — **A stated preference still outranks the estate.** Pinned by a
  test: a cloud-only product in a cloud-native estate, for a client who asked for
  on-prem, still scores 30. The client's words are not overridden by the tool's
  reading of their asset counts.

**Worth eyeballing.** The three Phase 3d estates, same catalog, no stated
preference, deployment dimension before → after:

| Estate | Shape | Moved up | Moved down |
|---|---|---|---|
| SaaS consultancy | `saas_centric` | **CrowdStrike 30 → 100** | Velociraptor, Graylog, OpenVAS, Nessus 100 → 85 |
| On-prem manufacturer | `on_prem_centric` | CrowdStrike **30 → 55**, Sentinel **30 → 55** | Defender 100 → 85 |
| OT plant | `ot_heavy` | Sentinel **30 → 55** | Defender 100 → 85 |

The SaaS row is the defect in one line: the only product built for an estate with
no server room was the one product the tool marked down. The moves down are the
inferred hybrid fallback — a self-hosted tool still fits a SaaS estate, it is just
not the obvious shape for it.

**No recommended stack changed in any of the three**, which is the compressed band
working as intended: 10 to 15 points on a dimension weighted 10 tilts a ranking
without overturning it. What changed is that the reason each product scored what
it did is now true, and on the card.

- 2026-09-12 — **The fit score had no working shown, and §9 forbids that.**
  Found while checking that the new deployment rationale reached the screen: it
  did not, and neither did any of the other six. The category card rendered
  `fit 94.3/100` as a badge, and nothing in `apps/web` read `ProductScore.
  dimensions` at all — the sentences every dimension has carried since Phase 4
  existed only in the engine's output. §9 is explicit: *"if you cannot render a
  rationale for a number, do not render the number."* A folded `<details>` per
  card now shows each dimension, its score, the weight actually used after any
  procurement-bias adjustment, its contribution, and the engine's own sentence.
  Native `<details>`, so it costs no client JavaScript.
- 2026-09-12 — **The rationale built its prose by swapping underscores for
  spaces**, which read as "this is a on prem centric environment" the moment it
  was on screen. One phrase per estate shape in code now. It is wording, not a
  tunable, so it does not belong in `data/config/`.

**The pattern, for the fifth time:** a rule established in one stage
(*infrastructure decides what an unregulated client should buy*, Phase 3d) had
not been carried into the next. Phase 4's review named this exact failure mode
and predicted it would recur.

### Phase 6 review — the two questions that gated Phase 7, and a third defect

Both open questions are closed, and answering the first one found a defect
neither of them was about.

- 2026-09-12 — **Effort figures are graded, and the grade travels.**
  `EstimateConfidence` (`vendor_documented` / `field_measured` /
  `analyst_estimate` / `placeholder`) is now required on both `opsBurden` and
  `implementation`, graded separately because a vendor that publishes a
  professional-services day count usually says nothing about who runs the thing
  afterwards. A `placeholder` needs a TODO in the notes, the same convention a
  placeholder price follows. All eight seed products are `analyst_estimate` —
  what the catalog headers have said in prose since Phase 1; nothing was
  upgraded, because no vendor here publishes a staffing guide.
  `ProductCost` carries both grades, the ops-FTE rationale states the
  confidence, `catalog:validate` lists any ungrounded figure, and the
  assumptions panel shows them beside the prices. Carrying it to the screen was
  the point: a grade that stays in the YAML is not a grade anyone reads.
- 2026-09-12 — **⚠ A control was credited to a tier that does not sell it.**
  Found while checking the five claims. `controlsCovered` was product-level
  while capabilities are sold by tier, so a bundle costed on the cheapest tier
  inherited every claim the top tier made. On the committed catalog, **Defender
  Plan 1 was selected and credited with `cis-v8:7` continuous vulnerability
  management** while the same entry's own tier list puts that in Plan 2.
  `ProductTier.controlsCovered` is additive to the product-level list, so
  product level means "what every tier does" and a stage that has not picked a
  tier under-credits rather than over-credits. Pinned by a regression that was
  checked by sabotaging the lookup, not by assuming it would fail.
- 2026-09-12 — **The five out-of-mapping claims are settled one at a time**,
  because the right answer genuinely differs between them. Sentinel keeps both
  incident-response claims and `cis-v8:17` / `RS.MA` gain `siem` in their
  `satisfiedBy` — Sentinel's playbooks are sold as SOAR, and a SIEM that makes
  no such claim still reads `partial`. Wazuh drops `cis-v8:1` (syscollector
  inventories hosts that already run an agent; Control 1 is about the ones that
  do not) and keeps `cis-v8:4` as a **deliberate product-level exception**, the
  only one left: the SCA module really does run CIS benchmark checks and most
  SIEMs do not, so widening the category would be false. Defender drops
  `cis-v8:7` outright — Plan 2's TVM is real, but the control names
  `vulnerability_management` and an EDR is not one.
- 2026-09-12 — **Defender's `cis-v8:7` restored on plan-2 only** (your call,
  same day). Dropping it outright rested on Plan 1 having no vulnerability
  management, which tier-level claims now express directly — so the claim sits
  where it is true. Second deliberate exception in the catalog, alongside
  Wazuh's `cis-v8:4`.
- 2026-09-12 — **⚠ A plan-2-only claim cannot currently reach a bundle.**
  `runPipeline` costs every product at its cheapest tier (`computeProductCosts`
  returns them cheapest-first and the pipeline takes `[0]`), so Plan 2 is never
  selected and the restored claim is dormant. Nothing in PROJECT_SPEC describes
  tier selection at all — §7.4 ranks *products*, never tiers — so this is an
  unspecified corner rather than a deviation. It matters more as the catalog
  grows: most commercial products are tiered, and "would the next tier up close
  a mandatory gap?" is a question an analyst asks on every call. **Worth a
  decision in Phase 7**: leave tier choice on price alone, or let a tier that
  closes a mandatory control be costed as an upgrade option.
- 2026-09-12 — **A category mapping is a floor for what a *kind* of tool does,
  not a ceiling on what one product can claim.** That is the rule the five
  disagreements were really about, and it is now written down: a claim that
  outruns its category is allowed, has to be true of that specific product, and
  carries a note in the catalog saying why.

**Worth eyeballing.** A 300-seat Windows estate on CIS v8, Defender selected at
Plan 1:

| Control | Before | After |
|---|---|---|
| CIS 2 Inventory and Control of Software Assets | covered | **partial** — a plan-2 claim |
| CIS 7 Continuous Vulnerability Management | covered by Defender + Nessus | covered by **Nessus only** |
| CIS 17 Incident Response Management | covered, reported as a conflict | covered, mapping agrees |

The retailer worked example moves RS.MA from gap to partial and its coverage
percentage does not move at all, which is the two-signal rule doing exactly what
it was built for: partial is reported, never counted.

### Phase 6 review — the SKU becomes part of the recommendation

The tier-selection limitation recorded earlier the same day turned out to be
load-bearing, so it was fixed properly rather than deferred to Phase 7. A
candidate is now a product *at a tier*, which is what a client buys.

- 2026-09-12 — **The pipeline costed only the cheapest tier, so every stage
  after costing was blind to the rest.** A SKU that closed a compliance control
  could not be scored, selected, recommended or quoted as an upgrade, because
  nothing had ever priced it. `costCatalog` prices every tier; `CostsByProduct`
  keeps a product's tiers together, which is also the shape the upgrade question
  needs.
- 2026-09-12 — **Scoring is per SKU, and only compliance fit differs.** That is
  the one dimension the catalog has evidence for — a tier's own control claims.
  Asset coverage, operability, deployment, scale and maturity score identically
  across tiers rather than being invented, which is hard rule 2 applied where it
  would be easy to fudge. An eliminated product still yields exactly one score:
  every §7.3 filter tests the product, not what you pay for it.
- 2026-09-12 — **⚠ Ideal was optimising for value, which cannot quantify a gap.**
  §7.4 step 5 defines Ideal as "ignores the budget cap; exists to quantify the
  gap", and it sorted on value density with the cap switched off — an objective
  whose best answer is by construction the *cheap* one. Latent while a product
  was one candidate; fatal once it was three, because density picks the entry
  tier every time and Ideal would have quoted exactly what Recommended quoted.
  `SelectionOptions.objective` now names the three objectives the three bundles
  actually have: `cheapest`, `value_density`, `best_fit`.
- 2026-09-12 — **A tier is a decision the client pays for, so hard rule 5 applies
  to it.** Every selection carries the tier's own name and a sentence saying why
  this SKU and not the one beside it, with the price difference in it.
- 2026-09-12 — **⚠ A partial control had no route to being closed.** Found while
  proving the upgrade path. The gap list held only `gap` controls, so a control
  the stack half-addressed was excluded from the coverage percentage *and* from
  the fix list: the client was shown a number with no way to improve it.
  Partials are now gaps of kind `partial`.
- 2026-09-12 — **A closer that claims nothing cannot close a partial.** The
  shopping list was offering Wazuh to close a control it does not claim, on a
  stack that already had a SIEM — a purchase that would have changed the status
  not at all. A partial now requires a closer that claims the control outright.
- 2026-09-12 — **An upgrade is priced as the difference and says so.** One-time
  cost is floored at nothing, because the product is already deployed and
  re-charging the whole rollout would overstate it. The FTE line says explicitly
  that no extra people are shown *because ops burden is recorded per product
  rather than per tier* — a heavier SKU usually is more work to run, and this
  catalog cannot yet say how much.

**Worth eyeballing.** A 300-seat Windows estate on CIS v8, same catalog:

| Bundle | Defender SKU | Annual spend |
|---|---|---|
| Essential | Plan 1 | USD 13,033 |
| Recommended | Plan 1 | USD 26,367 |
| Ideal | **Plan 2** | USD 34,287 |

Three bundles that differ in depth, not only in breadth. And with the scanner
out of reach, the gap list now answers CIS 7 with **"upgrade Defender from Plan
1 to Plan 2, +USD 7,920/yr, no new tool to deploy, run or renew"** rather than
sending the analyst to quote a second product.

The §12.1 retailer moves from "9 gaps, all unclosable, empty fix list" to 11
uncovered controls, 9 genuinely unclosable, and one purchase that closes two.

**Known limits, stated rather than papered over:**

- **A dearer SKU only wins where the catalog has evidence.** Compliance fit is
  the sole per-tier dimension, so on a scenario where no product claims the
  client's framework at all, Ideal picks the cheaper tier — correctly, because
  nothing says the dearer one is better. It is a limit of the data, not of the
  model, and it will lift as Phase 7 fills in tier-level claims.
- **`opsBurden` and `supports` are still product-level.** A top tier usually is
  more work to run and sometimes scales further. Both are inventable, neither is
  sourced, so neither was invented. Worth a schema decision in Phase 7 alongside
  the tier-level claims the catalog will need anyway.

### Phase 7

Ten new categories and three top-ups, researched and written on 2026-09-12. The
catalog went from 8 products across 3 categories to **65 across all 13**. Every
price is read from a vendor page or an authoritative feed on that date; nothing
was written from memory, and where a vendor publishes nothing the entry says so
rather than inventing a number.

It raised more design questions than any phase since 4, and answered one of them
with a schema change.

**Decisions.**

- 2026-09-12 — **A vendor's free tier must declare its condition, and the
  condition is enforced.** Three free tiers were selected for clients who could
  not actually take them, because a zero-cost tier whose condition the engine
  cannot see beats every priced option by construction. `ProductTier.limits`
  now exists and closes this — see the section below.

  A client who genuinely already owns a prerequisite should list it in
  `retainedTools`, which is the field that models "already owned" and is what
  the prerequisite check reads.

- 2026-09-12 — **A product too important to omit may ship on `analyst_estimate`
  pricing, flagged, when the vendor publishes nothing.** Precedent set by
  Microsoft Defender for Endpoint in Phase 1 and applied again to Veeam,
  Proofpoint Essentials, Fortinet FortiGate, Sophos MDR, CrowdStrike Falcon
  Complete and Arctic Wolf. 13 pricing rules are now `analyst_estimate`. Each
  says NOT VENDOR-PUBLISHED in its notes, names its corroborating sources, and
  will show a confidence warning wherever it is costed.

- 2026-09-12 — **Where reported prices disagree, the higher figure is used and
  the spread is stated.** Proofpoint Essentials Business is reported between USD
  3.03 and 3.93 per user per month — about 30% apart. For a pre-sales budget,
  overstating costs a conversation and understating costs a proposal that cannot
  be honoured.

- 2026-09-12 — **Control claims are split by what a product does, not by the
  category it sits in.** Guacamole controls the session and claims no credential
  control; Passbolt protects the credential and claims no session control;
  Arkime records and claims no detection; ntopng describes traffic and claims
  neither; Shuffle orchestrates and claims no case management; TheHive holds the
  case and claims no mitigation. The pairings an analyst would actually propose
  fall out of the entries rather than being asserted.

**Defects found and fixed.** Each pinned by a regression test.

1. **A bigger budget could buy less compliance.** `buildRecommended` runs two
   strategies and compared them on weighted need alone. They optimise different
   denominators — `cheapest` on what a product costs to *buy*, `value_density`
   on fit per unit of what it costs to *own* — so they can fund the same
   categories with different products, tie, and let density win. Surfaced by
   `iam`: at a USD 20,000 cap identity was Keycloak, claiming CIS Controls 5 and
   6; at USD 50,000 it became Duo Essentials, claiming only 6.
2. **A mandated control was outranked by one more funded category.** Same
   comparison, one level up. Surfaced by `ndr`: the PCI retailer started funding
   a ninth category by switching the endpoint pick to one that does not claim
   requirement 5, anti-malware, in a cardholder data environment. The comparison
   is now lexicographic — mandates, then weighted need, then controls, then
   density — and explains itself in both directions.
3. **Ops fit returned a flat score at zero security staff.** The
   `securityStaffFte === 0` branch returned a constant for every product,
   flattening the one dimension that should discriminate hardest in exactly the
   case it was written for. On §12.2 every product scored 15 — Huntress at 0.12
   FTE and Wazuh at 0.60 alike — while the rationale read "A managed alternative
   is the honest answer here". §12.2's own acceptance assertion had been
   standing in with a weaker claim since Phase 4 because of it. It now falls
   linearly to a floor as FTE rises to a new tunable,
   `unusableFteWithNoSecurityStaff`.

Plus one chore: `pnpm prices:refresh --write` enumerated three catalog filenames
by hand, so a drifting price in any new file was reported and then silently not
written. It reads the directory now.

**Limitations found and deliberately NOT fixed.** All are recorded here rather
than worked around in the data, and all understate rather than overstate.

- ~~**A tier cannot declare its limits.**~~ **Fixed the same day** — see
  "Tier limits" below. The other six stand.
- **A pricing rule cannot say what unit it bills or bands on.** `flat_tiered`
  always bands on `monitoredAssetCount`, which forced an assumed
  one-administrator-per-40-assets mapping onto ManageEngine PAM360's published
  per-administrator bands — the crudest number in the catalog. The same gap put
  Proxmox's per-server and OPNsense's per-installation rates behind assumed
  bands, and stopped Bareos's "larger of TB or clients" unit being modelled at
  all.
- **Azure meters quote per hour or per month; the catalog stores per year.**
  `prices:refresh` compares the feed figure to the stored one directly, so Azure
  Backup and Azure Firewall are deliberately `refresh: manual` despite coming
  from the machine-readable feed. Annualising a meter needs a human.
- **There is no hardware capex line.** PROJECT_SPEC §7.2 names `hardwareCost`;
  the cost engine implements licence, support, infrastructure, ops FTE,
  implementation and training. Every NGFW appliance entry understates year one
  by whatever the box costs, and ntopng's perpetual licences could not be
  catalogued at all.
- **There is no network-throughput sizing figure.** Azure Firewall and AWS
  Network Firewall both bill per GB of traffic processed. The sizing stage
  derives log ingest in GB/day, a different and much smaller quantity, so the
  data-processing fee is named in the notes and excluded rather than billed
  against the wrong number.
- **`termYears` is in the schema and no code reads it.** Harmless today — every
  rule in the catalog is `termYears: 1` — but a three-year rule would be
  silently costed as an annual one.
- **A vendor onboarding fee has no home.** Blumira publishes one-time onboarding
  fees per edition. The engine's only one-off lines are implementation services
  and training, and an onboarding fee is neither.

**Worth eyeballing.** The §12.1 retailer — 60 staff, PCI DSS, USD 25k/yr cap —
went from 62.5% PCI coverage with three unmet mandates at the start of the phase
to **100% on both PCI DSS and NIST CSF, with an empty gap list**. PCI requirement
7 is the clearest single trace of what the catalog is for: an unclosable
critical gap before Phase 7, a closable one after `iam` (fixable by upgrading a
tier already in the bundle), and simply covered after `pam`.

**Price transparency, by category.** Worth knowing before a scoping call which
markets will give you a number and which will not.

| Category | Publish a rate | Notes |
|---|---|---|
| iam | 4 of 5 | Only Keycloak is free; everyone else publishes. |
| backup | 3 of 5 | Nakivo, Commvault, Rubrik, Cohesity, Veritas all refuse. |
| email_security | 2 of 5 | Worst in the catalog. Eight vendors checked, all quote-only. |
| pam | 2 of 5 | Every market leader is quote-only. |
| ngfw | 4 of 5 | Fortinet publishes nothing; Palo Alto and Sophos likewise. |
| ndr | 5 of 5 free | The commercial half is unpriceable and therefore absent. |
| soar | 1 of 5 paid | Free tiers are real; paid tiers are quote-only. |
| mdr | 2 of 5 | The category that most needs a number and least gives one. |
| asset_discovery | 2 of 5 | runZero's paid platform is "Starts at $5,000", which is not a price. |
| deception | 4 of 5 free | Thinkst publishes no rate; reported figures vary by 2×. |
| siem | 4 of 5 | Splunk Enterprise Security is quote-only; Graylog publishes a floor, not a rate. |
| edr | 3 of 5 | ESET, Sophos and Bitdefender all answer "price available on request". |
| vulnerability_management | 4 of 5 | Rapid7 and Qualys are quote-only; Tenable publishes a worked example. |

Across the whole catalog: **106 prices, none a placeholder, 16 of them
`analyst_estimate`** — roughly one in seven. Every one of those sixteen names
its sources and says NOT VENDOR-PUBLISHED in its own notes.

## Open questions

**Nothing blocking Phase 8.** Everything this section carried was closed on
2026-09-12.

- ~~**Should a `ProductTier` gain a `limits` block?**~~ Asked and answered on
  2026-09-12: yes, and it is done. Five of the seven limits are now enforced
  exactly, one remains approximated, and the two tiers that had been dropped
  from the catalog are back. See "Tier limits" in the Phase 7 section.

- ~~**The remaining 12 products need a session with web research available.**~~
  Done. `deception` landed with five, and `siem`, `edr` and
  `vulnerability_management` were topped up to five each.

  The caveat this carried — Elastic Security's unverified free-tier split — was
  chased down on 2026-09-12 and **the entry was wrong**. It listed Elastic
  Defend and case management as Basic capabilities and claimed the
  incident-response controls that lean on them, which would have offered a
  client endpoint protection and a case workflow at zero cost. Corrected:
  prebuilt detection rules and the Security app are in Basic and are still
  claimed; Defend, case management and machine-learning detections are not, and
  CSF RS.AN, ISO A.5.25 and rbi-csf:incident-response came off with them.

  ⚠ Still corroborated rather than vendor-stated. Elastic's subscriptions page
  does not set the Security split out plainly and its docs describe permissions
  rather than tiers, so this rests on independent sources agreeing. Confirm with
  Elastic before it reaches a proposal.

Still unverified rather than unanswered:
- **The dashboard has never been looked at in a browser, and the charts cannot
  be checked any other way.** Verified again on 2026-09-12 against the finished
  65-product catalog: `pnpm dev` starts clean, the home page, wizard and results
  pages all return 200, the dev server logs zero errors or warnings, and the
  results page renders every one of the seven §8 sections with all thirteen
  categories recommended. Application code took ~700 ms for the full pipeline
  run, so the 8× catalog growth did not hurt render time. Pricing-confidence
  badges render correctly on real selections — Elastic Security "public list",
  Sophos MDR "analyst estimate".

  ⚠ What HTTP verification can never cover is the charts, and now we know
  exactly why: Recharts' `ResponsiveContainer` needs a measured width, so the
  server HTML contains the container div and **zero `<svg>` elements**. The
  charts exist only after client-side hydration. Four sessions of HTTP checking
  have therefore proven nothing at all about them.

  Browser automation has been unavailable in all four sessions — the Claude
  in Chrome extension reports as not connected. Until someone opens
  `http://localhost:3000` by hand, the two Recharts figures in §8 are the only
  part of this application that has never been observed working.

### Phase 8

The proposal, as four outputs of one document model.

**Decisions.**

- 2026-09-12 — **The exports share a document model, not a template.** Three
  renderers are required — HTML, DOCX, PDF — and writing the content decisions
  three times is how three exports come to disagree about the same number.
  `packages/engine/src/proposal.ts` builds typed sections and blocks with money
  left as `Money`; each renderer formats through one shared `renderCell` at the
  web layer. A test asserts every paragraph, bullet and callout appears in both
  the PDF and the DOCX, so a client reading one is not reading a different
  proposal from a client reading the other.

- 2026-09-12 — **`asOf` is passed into the proposal, never read from a clock.**
  The disclaimer then names the day the figures were priced rather than the day
  the file was generated, which is the honest date for a budgetary estimate, and
  the same scenario exports the same content twice.

- 2026-09-12 — **The XLSX writes money as numbers, the DOCX and PDF as strings.**
  The client gets prose; the analyst gets cells that sort, sum and pivot. A
  spreadsheet full of currency strings is not a spreadsheet, and the distinction
  is asserted rather than assumed.

- 2026-09-12 — **Roadmap phasing is bounded by delivery capacity, not product
  count.** Nobody deploys thirteen tools at once, and the catalog already records
  how long each takes to stand up. Ordering is mandatory categories first then by
  weight — the same priority the portfolio stage spent the money in, so the plan
  to deploy matches the plan to buy. `parallelWorkstreams` in
  `portfolio-assumptions.yaml` is the assumption that actually moves the plan:
  halve it and the roadmap roughly doubles.

**Dependencies added**, each with the justification hard rule 7 asks for:

| Package | Why | Note |
|---|---|---|
| `docx` | PROJECT_SPEC §3 names it; generating OOXML by hand is not reasonable | |
| `write-excel-file` | XLSX writer, one transitive dep (fflate) | ⚠ `exceljs` was tried first and removed — it pins `uuid@8.3.2`, which carries GHSA-w5hq-g745-h8pq. Forcing uuid 11 into a library that has not adapted to its API change would trade a clean audit for a runtime failure nobody would see until a client opened the file. |
| `@react-pdf/renderer` | PROJECT_SPEC §3 names it | |
| `jszip`, `fast-xml-parser` | devDependencies, used only to take generated files apart in tests | |

`pnpm audit` stays clean.

**Library limits found, and worked around honestly rather than papered over.**

- **A DOCX cannot be made byte-identical.** JSZip dates every zip entry, and
  docx 9.7.1 hard-codes `new Date()` in its timestamp element — `created` and
  `modified` are not in `IPropertiesOptions` at all, so passing them is a type
  error rather than future-proofing. `docProps/core.xml` therefore carries the
  generation time. It affects only Word's File → Info panel; the date that
  matters is on page one and in the disclaimer. The determinism test excludes
  that one part and says why, rather than asserting a determinism the library
  will not give.

- **Verifying a PDF is not obvious.** react-pdf emits glyphs as hex strings
  inside TJ arrays, so the natural "find the parenthesised strings" extractor
  returns nothing and would let the tests pass while proving nothing. And the
  bytes are WinAnsi rather than Latin-1 — an em-dash is 0x97, a bullet 0x95 —
  so decoding wrongly made the harness report paragraphs as missing from a file
  that contained them. Both are explained in the test that depends on them.

**What is tested.** Word does not degrade gracefully: one malformed part and the
whole file reports as corrupt. So the export tests unzip the real output, assert
every required OOXML part is present and every XML part parses, then read the
text back out — all seven sections present, money formatted rather than raw
minor units, and the §6 rule 4 disclaimer verbatim. An export is exactly where a
client stops seeing the dashboard's badges, which is why that last one has a test
of its own in all three formats.

### Phase 9

- 2026-09-12 — **A clone carries the sizing overrides too.** They are part of
  what makes two runs comparable: an override the analyst corrected on the call
  is a deliberate input, and dropping it on copy would silently change a second
  variable in an experiment meant to change one.

- 2026-09-12 — **A clone is a new row, not a version.** Phase 9 asks for two
  scenarios that can be opened, edited and compared independently. Versioning is
  a different feature with a different UI and was not built.

- 2026-09-12 — **A comparison has no notion of an original.** The change kinds
  are `only-left` and `only-right` rather than "added" and "removed", because
  neither side came first. Flipping the two sides must show the same differences
  rather than an inverted story about who changed what, and a test pins that
  symmetry.

- 2026-09-12 — **A comparison across two currencies refuses to subtract.** Every
  money delta is suppressed and the mismatch is stated at the top of the summary
  rather than in a footnote. A number in a difference column looks like an
  answer, and rupees minus dollars is not one. Everything currency-free — FTE,
  asset counts, coverage percentages — still compares, and is the more useful
  half of the comparison anyway.

**Worth eyeballing.** Cloning the 300-bed hospital and raising security staff
from 2 FTE to 6 moves the recommendation toward *more* operationally demanding
products — Bareos over Proxmox Backup Server, OpenSearch over Elastic Security —
at identical annual spend and USD 63,079 more in people. The stack gets better
because there is now somebody to run it, and the cost moves entirely into a line
the budget cap does not constrain. That is the question clone-and-compare exists
to answer.

## Open defects

Found on 2026-09-12 while fixing the charts. Neither is a chart bug; both are
visible on the charts, which is how they surfaced.

- ~~**Self-hosted infrastructure is charged per product, sized from the whole
  estate's log volume.**~~ **Fixed 2026-09-12.** `infra.byCategory` in
  `cost-assumptions.yaml` now states what each category's self-hosted footprint
  runs on — `log_ingest` for siem and ndr, `monitored_assets` for everything
  else — and only the log platforms pay for log-retention storage. The schema
  requires an entry for all thirteen categories, so a new category forces the
  decision. On the hospital scenario total infrastructure went from about USD
  69,500/yr across thirteen identical segments to USD 22,400/yr that
  differentiates: SIEM and NDR USD 6,319, management servers USD 1,080, a
  honeypot USD 540, MDR nothing.

  Two gaps are now explicit rather than silently wrong, both stated in the
  config: **backup storage is not modelled** (it is the dominant cost of a
  backup product, and charging it a SIEM's retention was a wrong number rather
  than a missing one), and **PAM session recording is not modelled** either.

  Fixing it exposed a third way this stage could buy less with more money — a
  greedy-knapsack failure where one expensive high-weight category starved two
  cheaper ones worth more between them. `buildRecommended` now also fills in
  risk-reduction-per-pound order and keeps whichever of three bundles covers
  most. Caught by the §12.1 acceptance monotonicity assertion, pinned by its own
  regression.

- **The per-row Annual column can differ from the Total by a cent.** Each row is
  rounded to whole currency units for display while the total is the exact sum
  of minor units, so thirteen rows can sum to USD 1,647,203 under a total of USD
  1,647,202. This is correct behaviour under hard rule 1 — the total is the
  authoritative figure and must not be replaced by the sum of rounded rows — but
  it looks sloppy in a client-facing table. Showing cents, or a footnote, would
  settle it. Left alone deliberately.

## Known placeholders

<!-- every catalog entry still on placeholder pricing, so they can be chased down before any client sees output -->
<!-- `pnpm catalog:validate` prints this list; keep it in sync -->

**No `placeholder`-confidence prices anywhere in the catalog**, and none has
ever shipped. ⚠ But `analyst_estimate` is now 16 pricing rules across 9
products, up from 2 before Phase 7, because whole categories publish nothing.
Each is flagged NOT VENDOR-PUBLISHED in its own notes and carries corroborating
sources; each will show a confidence warning wherever it is costed. In order of
how much they could be wrong by:

| Product | Rules | Why it is an estimate |
|---|---|---|
| `arctic-wolf` | 1 | The weakest price in the catalog. Arctic Wolf prices on the whole environment — users, sensors, log sources, cloud accounts — not on any unit this catalog holds, so the rule is a per-user approximation of a third-party benchmark. |
| `fortinet-fortigate` | 1 | Reseller-listed UTP bundle renewals for the FG-60F and FG-100F. Excludes the appliance, which is capex the engine cannot model. |
| `proofpoint-essentials` | 3 | Sources disagree by about 30%; the higher figure is used deliberately. |
| `sophos-mdr` | 2 | Partner-led sales, so the price depends on which partner is asked. |
| `crowdstrike-falcon-complete` | 1 | CrowdStrike publishes Falcon Go and nothing above it. |
| `veeam-data-platform` | 3 | VUL per workload, corroborated across two independent licensing sources. Veeam raised list prices in January of both 2025 and 2026, so this ages faster than a normal list price. |
| `microsoft-defender-for-endpoint` | 2 | Phase 1. Microsoft publishes no standalone per-plan price, only the bundled Defender Suite. |
| `thinkst-canary` | 1 | No published rate, and reported figures vary by a factor of two. Its single price band does not scale with decoy count, which is why scaleCeiling is "mid". |
| `bitdefender-gravityzone` | 2 | ESET, Sophos and Bitdefender all answer "price available on request". The reporting source states its figures "are estimates, not quotes". |

The two Phase 1 placeholders were closed by research on 2026-09-09:

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

- **Web toolchain added 2026-09-11.** Next **16.3.4** (App Router, Turbopack — webpack is no
  longer the default and `next lint` is gone, so the repo's own flat ESLint config is the only
  linter), React **19.3.0**, Tailwind **4.3.3** (configured in CSS, not a config file), Zustand
  **5.0.15**, Prisma **7.10.0** with `@prisma/adapter-better-sqlite3`. `better-sqlite3` installed
  from a prebuild — no MSVC toolchain needed on this machine.
- **A fresh clone needs `pnpm db:generate` then `pnpm db:push`** before `pnpm dev`. The Prisma
  client is generated into `apps/web/src/generated/` and is gitignored; the SQLite file is
  created on first push and is gitignored too.
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
