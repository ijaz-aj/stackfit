# Status

**Current phase:** 2 — `sizing.ts` (in review)
**Last updated:** 2026-09-09

## Phase log

| Phase | State | Notes |
|---|---|---|
| 0 Scaffold + CONTRIBUTING.md + tooling | done | pnpm monorepo, Vitest projects, engine + schema skeletons, 3 green smoke tests. `pnpm audit` clean. Next.js app + Prisma deferred to Phase 5. |
| 1 Schemas + catalog format + 8 seed products | done | `packages/schema` populated; 3 frameworks + 3 catalog files + 8 products; real `catalog:validate`. Q2 (MSSP) did **not** block this phase — see below. |
| 2 `sizing.ts` + tests | in review | `computeSizing` + `data/config/sizing-assumptions.yaml` (30 asset-class coefficients, each with a stated basis). Determinism test in place. 3 worked examples in `test/sizing-worked-examples.test.ts` with snapshotted figures to sanity-check. 100 tests green. |
| 3 `cost.ts` + tests | not started | Needs `data/config/fx.yaml` + `labour-rates.yaml`. Q2 must be answered before the MSSP alternative can be costed. |
| 4 `scoring.ts` + `portfolio.ts` + tests | not started | **Remaining 8 frameworks must land before this phase** — see decisions. |
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
- 2026-09-09 — **OWASP Top 10 hardening is a standing requirement**: Zod at every input boundary, Prisma-only DB access (no raw/string-built SQL), security headers + CSP in the web app, secrets never committed, `pnpm audit` kept clean. (Q4) — added as CONTRIBUTING.md hard rule 9.
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

## Open questions

- **PROJECT_SPEC §13 Q2 — In-house MSSP provider.** Include in v1? If yes, what shape is `data/config/mssp-rate-card.yaml`: per endpoint/month, per GB/day ingested/month, flat tiers by scale class, or a blend (base platform fee + per-endpoint add-on + per-GB/day ingest)? **Did not block Phase 1** — the `mdr` product category exists in the schema and no MSSP record was seeded. It **does** block the §7.4 step 6 "MSSP alternative per bundle" work, so it must be answered before Phase 3 costing.
- **opsBurden and implementation figures have no confidence field.** Every one in the seed catalog is an analyst estimate, flagged in each product's `notes`, but the schema cannot distinguish an estimate from a measured figure the way `pricingConfidence` does for prices. Worth adding an `opsBurdenConfidence` before the catalog grows in Phase 7.

## Known placeholders

<!-- every catalog entry still on placeholder pricing, so they can be chased down before any client sees output -->
<!-- `pnpm catalog:validate` prints this list; keep the two in sync -->

| Product | Tier | Why | What to chase |
|---|---|---|---|
| `microsoft-sentinel` | `pay-as-you-go` | Microsoft retired the flat per-GB list rate from the Sentinel pricing page; it now redirects to the Azure pricing calculator, which is region- and commitment-tier specific. | Pay-as-you-go and commitment-tier per-GB rates for the client's Azure region. |
| `microsoft-defender-for-endpoint` | `plan-2` | No standalone list price published for P1 or P2. The product page lists only the bundled Defender Suite at USD 12.00/user/month billed yearly, which is a different SKU. | Per-plan pricing from Microsoft 365 licensing or the reseller. Note most clients reach P2 via an E5 bundle, which makes the marginal cost near zero. |

Also outstanding (not placeholders, simply not written yet):

- `data/config/fx.yaml` — schema shipped, data deferred to Phase 3. An FX rate committed now would be stale before the code that reads it exists, and it has to be sourced on the day it is used.
- `data/config/labour-rates.yaml` — Phase 3.

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
    hard rule 9 says keep audit clean).
  - added **`vite` ^7.3.6** as an explicit devDependency — Vitest 4 makes Vite a peer and
    was otherwise resolving the vulnerable `vite@5.4.21` / `esbuild@0.21.5`.
  - `eslint` 9 → **10.10.0** (`@eslint/js` **10.0.1** — its version line diverged from
    `eslint`'s), `@types/node` 22 → **24** to match the runtime.
  - root `package.json` gained **`"type": "module"`** so root-level ESM (`vitest.config.ts`,
    `scripts/`) typechecks under `verbatimModuleSyntax`.
- **Re-run `pnpm audit` before every phase.** This tree will drift; treat a dirty audit as
  a build break (hard rule 9).
