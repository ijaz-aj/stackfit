# StackFit — Security Solution Advisor & Budget Portal

Pre-sales tool. An analyst enters a prospective client's environment (assets, headcount,
compliance, budget); the portal recommends a security stack (SIEM / EDR / PAM / IAM / VM /
NDR / email / SOAR / backup / MDR), costs it over 3 years, and exports a proposal.

Full requirements: `@PROJECT_SPEC.md` — read it when starting a phase, not every session.
Current phase and open threads: `@docs/STATUS.md`

## Commands

```
pnpm dev                # Next.js dev server
pnpm test               # all tests
pnpm test:engine        # engine unit tests only (fast, use this while iterating)
pnpm typecheck
pnpm lint
pnpm catalog:validate   # Zod-validate every YAML in data/
pnpm catalog:staleness  # what needs re-checking and where; non-zero if anything is stale
pnpm prices:refresh     # re-read machine-refreshable prices; --write applies drift
pnpm db:push            # apply the Prisma schema to the local SQLite file
pnpm db:generate        # regenerate the Prisma client (gitignored)
```

## Architecture

- `packages/engine` — pure TypeScript. No React, no DB, no `fetch`, no `fs`, no `Date.now()`,
  no randomness. Same input must always produce the same output.
- `packages/schema` — Zod schemas are the single source of truth. Infer TS types from Zod;
  never hand-write a type that duplicates a schema.
- `apps/web` — Next.js App Router. Presentation and orchestration only. Reads `data/`
  through `@stackfit/data` on the server; runs the engine in the browser where a number has
  to move as the analyst types.
- `packages/data` — loads and Zod-validates the `data/` tree. The boundary the engine does
  not cross: scripts, tests and the web app all read through it.
- `data/catalog/*.yaml` — product records, one file per category.
- `data/config/*.yaml` — tunable assumptions (sizing coefficients, labour rates, FX, MSSP rates).
- `data/frameworks/*.yaml` — compliance control mappings.

Engine pipeline, each stage a pure function: `sizing → cost → scoring → portfolio → coverage`.

## Hard rules

1. **Money is an integer in minor units plus an ISO currency code.** Never a float, never a
   bare number. All arithmetic in minor units; format only at the render boundary.
2. **Never invent a price, a vendor capability, or a compliance mapping.** If it cannot be
   sourced: `pricingConfidence: 'placeholder'` plus a `TODO` note. Say so in your summary.
3. Every price entry carries `sources: [{ url, asOf }]`.
4. **No business logic in React components.** If it computes money, a score, or a
   recommendation, it belongs in `packages/engine`.
5. Every engine output carries `rationale: string[]`. A number with no explanation does not ship.
6. Tunable assumptions live in `data/config/`, never as literals in code.
7. No new dependency without a one-line justification in the commit message.
8. Open-source products cost money. `opsBurden` FTE and implementation effort are mandatory
   fields; a TCO that omits them is a bug, not a simplification.
9. **Every price declares how it gets re-checked.** A new catalog price needs a `refresh`
   block — `azure_retail_prices` where a machine can do it, `manual` with a URL plus a note on
   what to look for otherwise. A price nobody can re-check is a price that goes stale silently.
   `pnpm catalog:staleness` fails on anything stale or undateable.
10. **OWASP Top 10 is a baseline, not a phase.** Zod-validate every external input. All DB
   access through Prisma — no raw or string-built SQL. Security headers + CSP configured in
   the web app. Every mutation behind the server-action layer so authz has one home. No
   secrets in the repo; keep `pnpm audit` clean.

## Testing

- Any engine change ships with Vitest tests in the same commit.
- The acceptance scenarios in `test/scenarios/` (PROJECT_SPEC §12) must stay green. Do not edit
  an acceptance test to make a change pass — fix the code or raise it with me.
  (They live at the repo root, not in `packages/engine/test/`, because they run the *committed*
  data — and package-level tests deliberately do not read files. See `vitest.config.ts`.)
- A determinism test (same input twice → identical output) must exist and stay green.
- Run `pnpm test` before claiming a phase is complete. Paste the output.

## Conventions

- Conventional commits (`feat:`, `fix:`, `data:`, `test:`, `chore:`). One logical change per commit.
- Catalog and config edits are `data:` commits, never mixed with code changes.
- Files kebab-case, types PascalCase. No default exports outside Next.js route files.
- Comments explain *why*, not *what*.
- Prefer boring, readable code. This repo is maintained by a security engineer, not a
  full-time frontend developer.

## Working agreement

- Work one phase at a time (PROJECT_SPEC §11). Stop at the end of a phase and wait for review.
- Ambiguity → ask one focused question. Do not guess across five files.
- Do not refactor or reformat code outside the current phase's scope.
- Update `docs/STATUS.md` at the end of every phase.
- When you learn something non-obvious about this codebase, append it to Gotchas below
  instead of rediscovering it next session.

## Gotchas

<!-- append as we hit them, one line each -->

- Workspace packages (`@stackfit/engine`, `@stackfit/schema`) expose raw TS via
  `"exports": "./src/index.ts"` — no build step needed to consume them. Vitest, tsx and
  (later) Next.js `transpilePackages` handle it. `tsc --build` still emits to `dist/`
  (gitignored) for typechecking only.
- `tsconfig.base.json` sets **`module: preserve`**, so relative imports are extensionless
  (`import { x } from '../src/index'`). It used to be `NodeNext`, which demanded `.js`
  extensions pointing at files that do not exist — tsc understands that, Turbopack does not,
  and `experimental.extensionAlias` is webpack-only. Nothing ever runs the emitted `dist/`.
- **`prisma@latest` is an 8.0.0 release candidate.** The stable pair is `prisma@7.10.0` +
  `@prisma/client@7.10.0`, both pinned. Prisma 7 is Rust-free, so SQLite needs the
  `@prisma/adapter-better-sqlite3` driver adapter — it is not optional.
- **The Prisma client is generated into `apps/web/src/generated/`** and gitignored. A fresh
  clone needs `pnpm db:generate` before `pnpm dev`, and `pnpm db:push` to create the file.
- **The web app's data loader is `@stackfit/data`**, the same one the scripts and the
  repo-root tests use. Import it only from server components and server actions: it reads the
  filesystem, which the engine still never does.
- **`runPipeline` in the engine is the only wiring** from sizing through to coverage. The
  acceptance harness and the web app both call it; neither assembles the stages itself.
- **A `BundleSelection` carries the `ProductCost` it was selected on.** Never re-look-up a
  selected product's cost by id to build a breakdown: a suite-discounted selection is costed
  a second time inside `portfolio.ts`, and the by-id figure is the undiscounted one.
- **Sizing assumptions are overridable per scenario** (`SizingOverrides`, stored on the
  Scenario row, applied by `applySizingOverrides`). The committed YAML is never mutated, and
  the results worksheet is the only writer of that column — the wizard's autosave deliberately
  does not touch it.
- **Restart `pnpm dev` after `prisma db push`.** The Prisma client is cached on `globalThis`
  to survive hot reloads, so a schema change leaves the old client in memory and every write
  to the new column fails validation until the server restarts.
- `pnpm` is a user-scoped global (`npm i -g pnpm@9.15.0`), not corepack — corepack needs
  admin on this machine. Node is v24 (winget LTS). Re-open the shell after any Node reinstall
  so `PATH` refreshes.
- `pnpm install` only runs `esbuild`'s post-install script (`package.json` →
  `pnpm.onlyBuiltDependencies`). Add a package there only with a reason, same bar as a new
  dependency.
- Keep `pnpm audit` clean (hard rule 10). The Vitest/Vite/esbuild chain is the usual source
  of noise — `vite` is pinned as a direct devDependency so it resolves to a patched major
  instead of a stale transitive one.
- **Catalog YAML writes money in minor units**: `unitPrice: { amountMinor: 5999, currency: USD }`
  is USD 59.99. Placeholder prices must use the sentinel `99999999` *and* a note containing
  `TODO`; the `PricingRule` schema rejects a plausible-looking invented number wearing the
  placeholder flag.
- **A YAML list item containing `": "` becomes a map, not a string.** Bit us on
  `- Go is the entry bundle: no threat hunting`. Quote any bullet with a colon in it.
  `catalog:validate` catches it as `Expected string, received object`.
- Control ids are `<framework-id>:<control>` (`pci-dss-4.0:10`). `catalog:validate` fails if a
  product claims a control that no file in `data/frameworks/` defines, so adding a mapping
  means adding the control in the open.
- **The Azure Retail Prices API (`https://prices.azure.com/api/retail/prices?$filter=...`) is
  Microsoft's authoritative, unauthenticated price feed.** Use it for any Azure or Sentinel
  price. The Sentinel pricing page and the `learn.microsoft.com` billing article both refuse to
  quote figures on purpose. Microsoft does *not* publish standalone Defender for Endpoint P1/P2
  pricing anywhere on its own site — only the bundled Defender Suite, a different SKU.
- Money in the engine is integer minor units end to end. **Currency conversion is done in
  BigInt**: INR minor units × a rate in millionths passes 2^53 at around INR 100 million.
  Rounding is half-away-from-zero, not `Math.round`, which biases negative amounts.
- **A framework file groups all its controls or none of them.** `groups: []` is a
  flat list; declare one group and every control must name one, or the schema
  rejects the file — a half-grouped framework would roll up a partial denominator
  in `coverage.ts` and read as a coverage figure. Only `nist-csf-2.0` is grouped
  today (the six CSF Functions); PCI's six goals and ISO's four themes could
  follow the same way.
- **Coverage counts a control as covered only when a selected product *claims*
  it.** The category mapping (`satisfiedBy`) having the right kind of tool in the
  bundle is `partial`, and controls mapping to no category at all are outside the
  denominator entirely. Percentages are therefore lower than a category-level
  reading would give, and deliberately so.
- `scripts/lib/validate-data.ts` holds the data-validation rules; `scripts/validate-catalog.ts`
  is a thin CLI over it and `test/data.test.ts` asserts the committed tree is clean. So
  `pnpm test` fails on a bad `data:` commit, not just the command someone forgot to run.
  That root-level `test/` directory is its own Vitest project, named `data`.
- **`flat_tiered` always bands on `monitoredAssetCount`**, and a pricing rule
  cannot say otherwise. Several catalog entries whose vendor bands on something
  else — administrators (ManageEngine PAM360), backup servers (Proxmox),
  installations (OPNsense) — carry an explicit analyst assumption converting
  estate size into the vendor's unit. Those assumptions are stated on the rule,
  and they are the crudest numbers in the catalog.
- **A capped or conditional tier declares `limits`, and the engine enforces it.**
  `caps` are measured against the sizing figure their unit names and eliminate
  that tier alone; `prerequisites` are checked against `retainedTools` and are
  unmet by default; `allowances` are the limits nothing here can measure (live
  workflows, metered executions) and are carried into the tier's scoring
  rationale rather than enforced. Never ship a zero-cost tier whose condition is
  only described in prose — it beats every priced option by construction, and
  did exactly that twice before the field existed. Only Tines Free is still
  approximated with `scaleCeiling: small`, because a workflow count is not a
  quantity the sizing stage produces.
- **An Azure meter's unit is not the catalog's unit.** `prices:refresh` compares
  the feed's number to the stored one directly, so a meter quoting "1 Hour" or
  "1/Month" cannot be stored as a per-year price and still be machine-refreshed.
  Azure Backup and Azure Firewall are `refresh: manual` for that reason even
  though they come from the machine-readable feed. Only per-unit meters that
  match the pricing model (Sentinel's per-GB) can use `azure_retail_prices`.
- **The cost engine has no hardware line and no network-throughput figure.**
  §7.2 names `hardwareCost`; the implementation does not have one. Appliance
  vendors therefore understate year one, and cloud firewalls' per-GB traffic
  charges are named in notes rather than billed against log-ingest GB/day, which
  is a different and much smaller quantity.
- **`termYears` is on `PricingRule` and nothing reads it.** Every committed rule
  is `termYears: 1`, so this is latent rather than broken — but a multi-year
  rule would be costed as if it were annual.
