# StackFit

A pre-sales security stack advisor. An analyst enters a prospective client's
environment — assets, headcount, compliance obligations, budget — and the portal
recommends a security stack, costs it over three years, and exports a proposal.

It covers ten categories: SIEM, EDR, PAM, IAM, vulnerability management, NDR,
email security, SOAR, backup and MDR, plus firewall, asset discovery and
deception. 65 products, 106 prices, every one of them sourced.

---

## Run it

Needs Node 24 and pnpm 9. Nothing else — no database server, no API keys, no
`.env` file.

```bash
pnpm install
pnpm db:generate     # Prisma client → apps/web/src/generated (gitignored)
pnpm db:push         # creates apps/web/stackfit.db
pnpm seed            # four demo scoping sessions
pnpm dev             # http://localhost:3000
```

A cold clone to a running demo takes about a minute, most of it `pnpm install`.

### What the demo sessions show

`pnpm seed` writes four sessions, built from the intake presets in
`data/presets/`. They are chosen to exercise different paths, not to look varied:

| Session | What it demonstrates |
|---|---|
| Hospital, 300 beds | The whole dashboard on a large estate: thirteen categories funded, no shortfall, 77.8% control coverage |
| Bank, 60 branches | Three frameworks at once (RBI CSF, PCI DSS, DPDP), priced in INR |
| Retail chain, 40 stores | A budget that cannot buy compliance — seven mandatory categories unfunded, and the engine says which cap stopped them |
| Retail chain — implementation funded | The same client with a larger one-time budget. Open it next to the previous one at **Compare** |

Comparing the hospital with the bank triggers the currency guard: the two are
priced in different currencies, so no money difference is calculated at all.
Subtracting rupees from dollars would produce a number that looks like an answer.

---

## What it will not do

These are design commitments, not limitations waiting to be fixed.

- **It never invents a price, a vendor capability or a compliance mapping.**
  Anything that cannot be sourced is flagged `placeholder` and says so in the UI
  and in the export. Every price carries a URL and the date it was checked.
- **Open source is not free.** Every product carries a mandatory operational-FTE
  burden and an implementation effort, and they are priced. A self-hosted SIEM
  routinely costs more than a commercial one once the people are counted.
- **A budget that cannot buy compliance is reported, not absorbed.** The engine
  will not quietly recommend a cheaper stack that fails the client's obligation.
  It names the unfunded categories, the shortfall, and which of the two budget
  caps actually blocked them.
- **Coverage means a selected product claims the control**, not that a tool of
  roughly the right kind is in the bundle. The percentages are lower than a
  category-level reading would give, deliberately.
- **Every number carries a rationale.** A figure with no explanation is a bug.

Everything it produces is a budgetary estimate for scoping. It is not a quote.

---

## How it is built

```
packages/schema   Zod schemas — the single source of truth. TS types are inferred.
packages/engine   Pure TypeScript. No fs, no clock, no randomness, no network.
packages/data     Loads and validates the data/ tree. The engine never reads a file.
apps/web          Next.js App Router. Presentation and orchestration only.
data/catalog      Product records, one YAML file per category.
data/config       Tunable assumptions — sizing coefficients, labour rates, FX.
data/frameworks   Compliance control mappings.
data/presets      Intake presets for the wizard.
```

The engine is a pipeline of pure functions, wired in exactly one place
(`runPipeline`):

```
sizing → cost → scoring → portfolio → coverage
```

Same input, same output, always — which is what makes "what did this look like
when we quoted it in March" answerable. The clock is read at the edge and handed
in; the engine may not read one.

Money is an integer in minor units plus an ISO currency code, everywhere, and is
formatted only at the render boundary. Currency conversion is done in BigInt,
because INR minor units pass 2^53 at around INR 100 million.

---

## Commands

```
pnpm dev                # dev server
pnpm test               # all tests
pnpm test:engine        # engine only — fast, use this while iterating
pnpm typecheck
pnpm lint
pnpm seed               # (re)write the demo sessions; idempotent
pnpm catalog:validate   # Zod-validate every YAML in data/
pnpm catalog:staleness  # what needs re-checking; non-zero if anything is stale
pnpm prices:refresh     # re-read machine-refreshable prices; --write applies drift
pnpm db:push            # apply the Prisma schema to the local SQLite file
pnpm db:generate        # regenerate the Prisma client (gitignored)
```

### Keeping the catalog honest

Every price declares how it gets re-checked. Where a machine can do it — any
Azure or Sentinel price — that is the Azure Retail Prices API. Everything else
names a URL and what to look for on it. `pnpm catalog:staleness` fails on
anything stale or undateable, so a price nobody can re-check cannot be committed
quietly.

`pnpm test` runs `catalog:validate` as part of its data project, so a bad catalog
edit breaks the build rather than the command someone forgot to run.

---

## Testing

440 tests across four Vitest projects — `engine`, `schema`, `data` and `web`.

The acceptance scenarios in `test/scenarios/` are PROJECT_SPEC §12 written as
real tests, and they run against the *committed* data rather than fixtures. They
have found three engine defects that unit tests did not. They are not edited to
make a change pass.

A determinism test (same input twice → byte-identical output) covers the engine
and the exports.

**One test is skipped and labelled.** Recharts' `<LabelList>` paints nothing
under jsdom — a bar label needs the bar's computed geometry — so the cash-flow
bar labels are pinned by a deliberately skipped test rather than an absent one.
Whether thirteen angled category labels *overlap* is also still a question only a
pair of eyes can answer; jsdom measures no text.

---

## Hosting

Not yet deployed. The intended target is **Vercel Hobby** plus a free Postgres
tier (Neon or Supabase), which costs nothing and is enough for a pre-sales tool
used by a handful of analysts.

Switching from SQLite to Postgres is two changes, and the schema was written for
it: no SQLite-only column types or features, so `prisma validate` accepts the
schema unchanged under `provider = "postgresql"` (checked, not assumed).

1. `provider = "sqlite"` → `"postgresql"` in `apps/web/prisma/schema.prisma`.
   Prisma does not accept an environment variable for `provider`, so this is a
   real edit rather than configuration.
2. Set `DATABASE_URL`. Both the app and the Prisma CLI already read it and fall
   back to the local SQLite file when it is absent.

There is no auth in v1. `Scenario.ownerId` and `createdBy` exist and stay null,
so adding it is a migration nobody has to think hard about, and every mutation
already goes through one server-action layer that is the place an authz check
belongs.

---

## Working on it

`CONTRIBUTING.md` holds the rules this codebase is written to — the money rule, the
no-invented-prices rule, what belongs in the engine rather than in React — plus a
Gotchas section that is worth reading before the first change. `PROJECT_SPEC.md`
is the full requirement. `docs/STATUS.md` is the running log: what each phase
decided and why, what is still open, and what is known to be wrong.
