# Status

**Current phase:** 3b — price freshness (in review)
**Last updated:** 2026-09-09

## Phase log

| Phase | State | Notes |
|---|---|---|
| 0 Scaffold + CONTRIBUTING.md + tooling | done | pnpm monorepo, Vitest projects, engine + schema skeletons, 3 green smoke tests. `pnpm audit` clean. Next.js app + Prisma deferred to Phase 5. |
| 1 Schemas + catalog format + 8 seed products | done | `packages/schema` populated; 3 frameworks + 3 catalog files + 8 products; real `catalog:validate`. Q2 (MSSP) did **not** block this phase — see below. |
| 2 `sizing.ts` + tests | done | `computeSizing` + `data/config/sizing-assumptions.yaml` (30 asset-class coefficients, each with a stated basis). Determinism test in place. 3 worked examples in `test/sizing-worked-examples.test.ts`. |
| 3 `cost.ts` + tests | in review | `computeProductCost` covering all 11 pricing models, plus money arithmetic in BigInt. `fx.yaml`, `labour-rates.yaml`, `cost-assumptions.yaml` written. Every catalog price is now sourced — no placeholders left. 145 tests green. |
| 3b Price freshness (**inserted, not in PROJECT_SPEC §11**) | in review | Prices now age and say so. `catalog:staleness` + `prices:refresh`. Verified live against the Azure meter feed. Inserted ahead of catalog expansion on purpose — see the decision below. |
| 4 `scoring.ts` + `portfolio.ts` + tests | not started | This is the phase that produces the Essential / Recommended / Ideal bundles. **Blocked on two things**: the remaining 8 frameworks, and Q2 (MSSP rate card) for the §7.4 step 6 build-vs-buy alternative. |
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
- 2026-09-09 — **⚠ Amends the day-one frameworks decision: 3 of 11 frameworks shipped, not all 11.** `nist-csf-2.0`, `cis-v8` and `pci-dss-4.0` are in, because those are what the seed catalog maps against and their control lists were verified against the publishers. The other 8 (HIPAA, ISO 27001:2022, SOC 2, GDPR, NIS2, CERT-In, RBI, DPDP 2023) are **outstanding and must land before Phase 4**, which is where framework selection actually promotes a category to mandatory. Writing 8 more mapping files in Phase 1 without sourcing each one would have been exactly the fabrication hard rule 2 forbids.

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

- 2026-09-09 — **⚠ Deliberate deviation from the §7.2 formula: operational FTE is included in year 1.** The spec's `Year1 = licence + implementationServices + trainingCost + infraCost + hardwareCost` omits it, and `TCO(n) = Year1 + Σ Annual(2..n)` therefore counts ops FTE only from year 2. You are running the tool in year 1 too, and leaving it out understates exactly the open-source options hard rule 8 exists to keep honest — on the worked example it would have hidden about a third of Wazuh's three-year cost. **Flagging for your decision**: say the word and I will match the spec exactly instead.
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

## Open questions

- **PROJECT_SPEC §13 Q2 — In-house MSSP provider.** Include in v1? If yes, what shape is `data/config/mssp-rate-card.yaml`: per endpoint/month, per GB/day ingested/month, flat tiers by scale class, or a blend (base platform fee + per-endpoint add-on + per-GB/day ingest)? **Did not block Phase 1** — the `mdr` product category exists in the schema and no MSSP record was seeded. It **does** block the §7.4 step 6 "MSSP alternative per bundle" work, so it must be answered before Phase 3 costing.
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
