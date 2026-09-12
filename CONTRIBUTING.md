# StackFit: Security Solution Advisor & Budget Portal

Scoping tool. An analyst enters a prospective client's environment (assets, headcount,
compliance, budget); the portal recommends a security stack (SIEM / EDR / PAM / IAM / VM /
NDR / email / SOAR / backup / MDR), costs it over 3 years, and exports a proposal.

Full requirements: `@PROJECT_SPEC.md`. Read it when starting a phase, not every session.
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

- `packages/engine`: pure TypeScript. No React, no DB, no `fetch`, no `fs`, no `Date.now()`,
  no randomness. Same input must always produce the same output.
- `packages/schema`: Zod schemas are the single source of truth. Infer TS types from Zod;
  never hand-write a type that duplicates a schema.
- `apps/web`: Next.js App Router. Presentation and orchestration only. Reads `data/`
  through `@stackfit/data` on the server; runs the engine in the browser where a number has
  to move as the analyst types.
- `packages/data`: loads and Zod-validates the `data/` tree. The boundary the engine does
  not cross: scripts, tests and the web app all read through it.
- `data/catalog/*.yaml`: product records, one file per category.
- `data/config/*.yaml`: tunable assumptions (sizing coefficients, labour rates, FX, MSSP rates).
- `data/frameworks/*.yaml`: compliance control mappings.

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
   block: `azure_retail_prices` where a machine can do it, `manual` with a URL plus a note on
   what to look for otherwise. A price nobody can re-check is a price that goes stale silently.
   `pnpm catalog:staleness` fails on anything stale or undateable.
10. **OWASP Top 10 is a baseline, not a phase.** Zod-validate every external input. All DB
   access through Prisma. No raw or string-built SQL. Security headers + CSP configured in
   the web app. Every mutation behind the server-action layer so authz has one home. No
   secrets in the repo; keep `pnpm audit` clean.

## Testing

- Any engine change ships with Vitest tests in the same commit.
- The acceptance scenarios in `test/scenarios/` (PROJECT_SPEC §12) must stay green. Do not edit
  an acceptance test to make a change pass: fix the code or raise it with me. (They live at the
  repo root, not in `packages/engine/test/`, because they run the *committed* data, and
  package-level tests deliberately do not read files. See `vitest.config.ts`.)
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
  `"exports": "./src/index.ts"`. No build step needed to consume them. Vitest, tsx and
  (later) Next.js `transpilePackages` handle it. `tsc --build` still emits to `dist/`
  (gitignored) for typechecking only.
- `tsconfig.base.json` sets **`module: preserve`**, so relative imports are extensionless
  (`import { x } from '../src/index'`). It used to be `NodeNext`, which demanded `.js`
  extensions pointing at files that do not exist: tsc understands that, Turbopack does not,
  and `experimental.extensionAlias` is webpack-only. Nothing ever runs the emitted `dist/`.
- **`prisma@latest` is an 8.0.0 release candidate.** The stable pair is `prisma@7.10.0` +
  `@prisma/client@7.10.0`, both pinned. Prisma 7 is Rust-free, so SQLite needs the
  `@prisma/adapter-better-sqlite3` driver adapter. It is not optional.
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
  the results worksheet is the only writer of that column. The wizard's autosave deliberately
  does not touch it.
- **Restart `pnpm dev` after `prisma db push`.** The Prisma client is cached on `globalThis`
  to survive hot reloads, so a schema change leaves the old client in memory and every write
  to the new column fails validation until the server restarts.
- `pnpm` is a user-scoped global (`npm i -g pnpm@9.15.0`), not corepack: corepack needs admin
  on this machine. Node is v24 (winget LTS). Re-open the shell after any Node reinstall so
  `PATH` refreshes.
- `pnpm install` only runs `esbuild`'s post-install script (`package.json` →
  `pnpm.onlyBuiltDependencies`). Add a package there only with a reason, same bar as a new
  dependency.
- Keep `pnpm audit` clean (hard rule 10). The Vitest/Vite/esbuild chain is the usual source
  of noise: `vite` is pinned as a direct devDependency so it resolves to a patched major
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
  pricing anywhere on its own site. Only the bundled Defender Suite, a different SKU.
- Money in the engine is integer minor units end to end. **Currency conversion is done in
  BigInt**: INR minor units × a rate in millionths passes 2^53 at around INR 100 million.
  Rounding is half-away-from-zero, not `Math.round`, which biases negative amounts.
- **A framework file groups all its controls or none of them.** `groups: []` is a
  flat list; declare one group and every control must name one, or the schema
  rejects the file. A half-grouped framework would roll up a partial denominator
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
  else (administrators (ManageEngine PAM360), backup servers (Proxmox),
  installations (OPNsense)) carry an explicit analyst assumption converting
  estate size into the vendor's unit. Those assumptions are stated on the rule,
  and they are the crudest numbers in the catalog.
- **A capped or conditional tier declares `limits`, and the engine enforces it.**
  `caps` are measured against the sizing figure their unit names and eliminate
  that tier alone; `prerequisites` are checked against `retainedTools` and are
  unmet by default; `allowances` are the limits nothing here can measure (live
  workflows, metered executions) and are carried into the tier's scoring
  rationale rather than enforced. Never ship a zero-cost tier whose condition is
  only described in prose. It beats every priced option by construction, and
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
  is `termYears: 1`, so this is latent rather than broken, but a multi-year
  rule would be costed as if it were annual.
- **`Intl` compact notation needs fractional digits to stay honest.** Passing
  `maximumFractionDigits: 0` alongside `notation: 'compact'` collapses every
  value in a magnitude bucket onto one label: 1.5M, 2.0M and 2.4M all became
  "$2M", which put the same label at three heights on a chart axis and
  overstated a headline TCO by a third. `formatMoney` keeps one fractional digit
  in compact mode and `apps/web/test/format.test.ts` sweeps nice-numbered tick
  sets to prove distinct values stay distinct.
- **The charts and the wizard readout are client components, so nothing about
  them appears in server HTML.** `curl` on a results page returns the Recharts
  container div and zero `<svg>` elements, and the readout's figures are absent
  entirely. Four sessions of "verified over HTTP" said nothing whatsoever about
  either. Anything visual in those two places needs a real browser or a unit
  test on the pure function behind it.
- **The exports share one document model.** `packages/engine/src/proposal.ts`
  builds typed sections and blocks with money left as `Money`; the HTML preview,
  DOCX, PDF and XLSX all render from it through `renderCell` in
  `apps/web/src/lib/proposal.server.ts`. Add content to the model, never to a
  renderer. A renderer that decides content is a renderer that disagrees with
  the other three. The XLSX is the exception that proves it: it writes money as
  numbers rather than strings, because an analyst pivots it.
- **Every export carries the §6 rule 4 disclaimer, verbatim**, and each format
  has a test asserting it. An export is where a client stops seeing the
  dashboard's confidence badges.
- **Verifying a generated file: unzip it, do not trust the library.** DOCX and
  XLSX are zips of XML, and Word reports the whole file corrupt if one part is
  malformed. PDFs are harder: react-pdf writes glyphs as hex strings inside TJ
  arrays and encodes them as WinAnsi, so a naive extractor returns nothing or
  silently mangles punctuation. `apps/web/test/export.test.ts` has a working
  extractor for each.
- **The two budget caps bind independently, and `withinAnnualCap: true` does not
  mean the budget was adequate.** A shortfall is precisely the case where the
  bundle *underspends*. It could not buy compliance, so the annual cap is
  comfortably met. Anything gated on `!withinAnnualCap` will therefore never fire
  when it matters. Ask `unfundedMandatory`/`unfundedReasons` instead, and when
  reporting a shortfall say which cap caused it: the one-time cap runs out
  separately, and naming the wrong one sends the analyst into the wrong
  negotiation with the client.
- **Verify a regression by reverting its fix and watching it go red.** Two of the
  Phase 10 tests passed against the broken code. One because the "bug" it
  targeted was unreachable dead code, which was worth more to learn than the test
  was. A test written alongside a fix proves nothing until it has failed once.
- **An enum value that secretly means "unanswered" will be answered.**
  `deploymentPreference: 'hybrid'` was the wizard's wording for "no strong
  preference" and scoring branched on it that way, so a client who genuinely ran
  a hybrid estate could not say so and was told in writing that they had said
  nothing. Absence needs its own name (`not_asked`), and a field that carries
  both a fact and a policy needs splitting into two.
- **Ranking candidates on `procurementAnnual` inverts hard rule 8.** It makes a
  self-hosted tool look free and picks it over a commercial one that is better
  *and* cheaper once `opsFteAnnual` is counted. The budget *cap* is rightly
  judged on procurement, salary is not a purchase order, but choosing between
  products is a different question. `cheapest` and `lowest_tco` exist as
  separate strategies for exactly this reason; do not merge them, and do not
  "fix" `cheapest` to rank on TCO. That breaks budget monotonicity, because at a
  tight cap the lowest-TCO option frequently does not fit the procurement cap.
- **There are three bundles: `essential`, `recommended`, `phase2`.** Essential is
  the floor. Recommended is year one. Phase 2 is everything with real weight that
  year one did not fund, priced and not held to this year's cap, so a deferral is
  a decision on the record rather than a silence. `ideal` and `operable` were
  removed; the reasoning is on `BundleKind` in `portfolio.ts` and in
  `docs/STATUS.md`.
- **`Control.satisfiedBy` is a disjunction. Never read it as a conjunction.**
  `[siem, soar, mdr]` means any one of the three closes the control, which is how
  `coverage.ts` has always read it and how it renders it in prose. `portfolio.ts`
  read it as "all three are mandatory" and that single misreading made twelve of
  thirteen categories compulsory for a PCI client, spent the budget before the
  ranking was consulted, and turned every recommendation into the whole catalog.
  Each mandatory control is now settled once, in favour of one category: a
  holding that already meets it, the only applicable option, or the
  highest-weighted of several, recorded in `mandateElections` so the choice can
  be defended on the call.
- **`deliveryModel` decides more than it looks like it does.** It replaced
  `hasSoc`, which asked what monitoring the client already had; every client here
  is being onboarded into our SOC, so that question had one answer. This one
  moves the scoring weights, decides whose FTE is the denominator of `ops_fit`
  (ours, via `opsFit.msspAnalystFtePerClient`, when we operate), and zeroes the
  `mdr` category weight on a managed engagement, because we are the monitoring
  and quoting a third-party MDR alongside our own fee is a duplicate charge.
- **`opsBurden` is administration effort, not SOC staffing.** Deploy, tune,
  maintain, upgrade. Not staffing continuous monitoring, which published
  benchmarks put at several analysts across shifts for in-house 24/7 SIEM
  operation. The two differ by an order of magnitude and are trivially
  conflated, so every surface that shows an FTE figure states which one it is.
  Do not "correct" these coefficients upward to match 24/7 benchmarks; that
  would be answering a different question.
- **`coverageDisclaimer()` is verbatim on every surface that shows a coverage
  percentage**, exactly like the §6 rule 4 pricing disclaimer, and for the same
  reason. A tool *supports* a control; it does not *satisfy* one: policy,
  process, evidence and an assessor decide that. "PCI DSS 100% covered" read as
  "the audit is handled" is the single largest client-facing liability this
  product has. Tests in the engine and in all three export formats pin it.
- **The security headers are pinned by `apps/web/test/security-headers.test.ts`,
  not just configured.** CSP lives in `src/proxy.ts` (per-request nonce) and the
  static headers in `next.config.ts`. Next renamed this convention once already
  , `middleware.ts` → `proxy.ts` in 16, and a rename that leaves the right
  function under the wrong filename disables every header while build, lint and
  typecheck all stay green. If those tests fail, the app has lost its headers;
  do not "fix" them by relaxing an assertion.
- **An error boundary shows `error.digest`, never `error.message`.** The digest
  is also written to the server log, so it is the string that makes a failure
  findable; the message can carry a database path or a row's contents, and this
  app holds a client's asset inventory. Next redacts messages in production
  builds. That is not a reason to depend on it.
- **Every page, route handler and server action starts with `requireAnalyst()`.**
  A server action is a POST endpoint with a generated URL, so gating the page
  that renders its form protects nothing. The gate has to be in the action. The
  same call also asserts that a production deployment is actually configured,
  which is why it is a function call on every request rather than a check at
  module load: `next build` runs with `NODE_ENV=production` and no secrets, and
  asserting at import time fails the build instead of the deployment.
- **An empty `STACKFIT_ALLOWED_EMAILS` admits nobody, deliberately.** A missing
  or misspelled environment variable is a configuration failure, and in an
  access check that reads as "no". Do not "fix" it to fail open for local
  convenience: local convenience is already handled, because an install with no
  auth configured at all runs in single-user mode and only production refuses.
- **A plain function exported from a `'use client'` module is a client
  reference, and calling it on the server throws.** `cost-breakdown.tsx` is a
  server component; it imported `categoryChartHeight` from `cost-charts.tsx` and
  called it, and the whole results page fell through to the error boundary with
  "Attempted to call categoryChartHeight() from the server". Nothing caught it:
  `tsc` types a client reference as the function it stands for, eslint has no
  rule for it, and the charts' own tests import that module directly, which is
  legal: typecheck, lint and 533 tests were all green against a page that would not
  render. Shared helpers go in a module with no directive (`chart-geometry.ts` is
  the pattern), and `apps/web/test/client-boundary.test.ts` now sweeps every server
  module for the violation by name.
- **Tailwind breakpoints are CSS pixels, and a 1080p-plus laptop usually is
  not.** This machine reports 1254 CSS pixels on a 1568-pixel panel because
  Windows scales the display at 125%, so every `xl:` rule (1280px) on the
  results page was written, shipped and never once rendered. The layout that
  was being tuned was the stacked fallback. Check `innerWidth` in the browser
  before reaching past `lg:`, and treat `xl:` as a rule for external monitors.
- **A `tsx scripts/…` run and a live `pnpm dev` are two SQLite connections, and
  they will disagree about what the database contains.** The dev server caches
  its Prisma client on `globalThis` across hot reloads and holds its handle
  open; a CLI script opens its own. Running one while the other is live
  produced a script read of 11 rows when there were 17, with four seeded demo
  sessions apparently missing and then present again minutes later. Nothing was
  lost and nothing errored: the reads were stale, which is worse, because a
  stale read is indistinguishable from a deletion and invites a "fix" that
  really does delete something. Stop the dev server before running any script
  that reads or writes the database, and never act on a surprising row count
  without re-reading it from a quiet process.
