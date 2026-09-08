# Status

**Current phase:** 0 — scaffold (in review)
**Last updated:** 2026-09-09

## Phase log

| Phase | State | Notes |
|---|---|---|
| 0 Scaffold + CONTRIBUTING.md + tooling | in review | pnpm monorepo, Vitest projects, engine + schema skeletons, 3 green smoke tests. `pnpm audit` clean. Next.js app + Prisma deferred to Phase 5. |
| 1 Schemas + catalog format + 8 seed products | not started | Needs Q2 (MSSP rate-card shape) answered first. |
| 2 `sizing.ts` + tests | not started | Determinism test lands here. |
| 3 `cost.ts` + tests | not started | |
| 4 `scoring.ts` + `portfolio.ts` + tests | not started | |
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

## Open questions

- **PROJECT_SPEC §13 Q2 — In-house MSSP provider.** Include in v1? If yes, what shape is `data/config/mssp-rate-card.yaml`: per endpoint/month, per GB/day ingested/month, flat tiers by scale class, or a blend (base platform fee + per-endpoint add-on + per-GB/day ingest)? Needed before Phase 1 catalog work.

## Known placeholders

<!-- every catalog entry still on placeholder pricing, so they can be chased down before any client sees output -->

_None yet — catalog starts in Phase 1._

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
