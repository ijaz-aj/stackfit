# Web application audit

Walked end to end on 2026-09-13 as a consultant who does this work by hand
would: open the tool cold, scope a client, produce something to put in front of
a board, and see where it embarrasses you.

**The lens is deliberately not the engineer's.** The engine is in good order and
this audit barely touches it. What is audited here is the thing a non-technical
executive reads — a CFO, a COO, a board sponsor — and the question is always the
same: *could this person reach a decision from this screen without an analyst
sitting next to them translating it?*

Today the honest answer is no, and the reasons are not subtle. They are
structural, and most of them are cheap to fix.

Severity is what it would cost us in front of a client, not what it costs to
build.

| | Finding | Severity | Status |
|---|---|---|---|
| A1 | The proposal is unreachable from the interface | **Blocking** | **Fixed** |
| A2 | The results page has no executive summary | **Blocking** | **Fixed** |
| A3 | The proposal's executive summary contains no money | **Blocking** | **Fixed** |
| B1 | "Session" and "scenario" are the same thing under two names | High | **Fixed** |
| B2 | Navigation is labelled in internal vocabulary | High | **Fixed** |
| B3 | "Bundle" is not a word a client uses, and "Phase 2" does two jobs | High | **Fixed** |
| B4 | "Estate", "inventory" and "environment" are used interchangeably | Medium | **Fixed** |
| C1 | Our margin sits on the screen an analyst turns toward the client | **Blocking** | **Fixed** |
| C2 | The results dashboard has no print stylesheet | Medium | **Fixed** |
| C3 | The rupee equivalent appears on one panel out of nine | Medium | **Fixed** |
| C4 | Nothing on the page says when it was priced until the last panel | Medium | **Fixed** |
| C5 | No way to tell, from the interface, that exports exist at all | High | **Fixed** |
| D1 | Nine panels, no stated reading order, no summary-first structure | High | **Fixed** |
| D2 | The first screen after intake is a six-column comparison table | High | **Fixed** |
| D3 | Dark-only theme, against boardroom and print reality | Low (by design) | Print fixed |
| E1 | An analyst-voice instruction was rendering in client-facing copy | **Blocking** | **Fixed** |
| E2 | "Required" was amber on met requirements and silent on unmet ones | High | **Fixed** |

Two findings were discovered while fixing the others and are recorded as E1
and E2 at the end.

---

## A. Blocking

### A1. The proposal is unreachable from the interface

The document this entire product exists to produce cannot be reached by
clicking. There is no link to `/scenarios/[id]/proposal` from the results page,
the wizard, the session list, or the command palette. Searching every `href`,
`router.push` and `Link` in `apps/web/src` returns nothing pointing at it.

The only route in is to type the URL.

The page itself is finished and good: an HTML preview of exactly what the client
receives, with DOCX, PDF and XLSX download buttons above it. Four export
formats, all tested, all carrying the disclaimer verbatim — and no user can find
them.

The command palette offers "*{session}*: results" and stops there.

> An analyst who does this by hand ends the call by sending a document. The tool
> gets them to a dashboard and abandons them.

### A2. The results page has no executive summary

The page opens on `BundleComparison`: a table of three tiers across six columns
— Year 1, Procurement/yr, All-in/yr, 3-yr TCO, coverage, pricing confidence.

Nowhere on the page, in any panel, is there a sentence that says:

> *We recommend X. It costs Y in year one and Z a year after that. It takes you
> from A% to B% against the frameworks you named. You need to decide C.*

Everything needed to write that sentence is already computed. It is spread
across nine panels in the order the engine happens to produce it — bundles,
categories, who pays, people, cost, coverage, gaps, sizing, assumptions — which
is the pipeline's order, not a reader's.

An executive opening this page has to assemble the recommendation themselves
from a comparison table. That is precisely the work they are paying us to have
already done.

### A3. The proposal's executive summary contains no money

`executiveSummary()` in `packages/engine/src/proposal.ts` produces, in order:
estate size, staff count, security FTE, number of controls recommended, horizon,
compliance coverage percentages, operational FTE, and any budget warnings.

It never states what the thing costs.

The first cost figure in the document appears in section 4, "Costs". A CFO reads
page one and learns everything except the price. This is the single most
predictable complaint a proposal can attract, and it is a handful of lines to
fix: the numbers are on `recommended` already.

### C1. Our margin sits on the screen an analyst turns toward the client

`engagement.tsx` renders an internal block: our fee, what the engagement costs us
to run, our delivery cost, our margin per year, our margin in year one, and — as
of the most recent change — the margin as a percentage of the fee.

It is collapsed inside a `<details>` and labelled *"Internal: what this
engagement costs us. Not for the client."* That is careful, and it is still the
wrong guarantee.

The exports have the right one: `buildProposal` never receives `attribution` at
all, so no renderer *can* leak it. The screen relies on nobody clicking a
disclosure triangle during a screen-share, on a page the analyst is explicitly
expected to turn toward the client.

On the retail preset that disclosure reveals a **95.5% margin**. There is no
recovering a meeting in which a client sees that number.

> The fix is not a better label. It is to make the screen match the exports:
> internal figures on a route the client-facing view never renders.

---

## B. Language and coherence

### B1. "Session" and "scenario" are the same thing under two names

Counted across the UI layer: **54 uses of "session", 167 of "scenario"**. They
refer to the same object.

- The home page is titled "Scoping sessions" and its second card is "Saved sessions".
- The route is `/scenarios/[id]`.
- The delete control is `DeleteSession`; the confirm copy says "session".
- The header's accessible label is "StackFit, back to sessions".
- Every error state says "This session cannot be opened".
- The command palette says "All scoping sessions" and "Compare two sessions".

Nobody reading this is confused for long — but an enterprise product does not
make its reader do that reconciliation at all, and a client watching a
screen-share sees two nouns for one thing and wonders which one they missed.

### B2. Navigation is labelled in internal vocabulary

The results nav reads: **Bundles · By category · Who pays · People · Cost ·
Coverage · Gaps · Sizing · Assumptions**.

Four of those nine are terms of art. "Sizing" is an engineering word for
estimating log volume and asset counts. "Gaps" means unclosed compliance
controls, not gaps in the proposal. "Bundles" is explained nowhere on the page.
"People" could reasonably be read as a directory of staff.

### B3. "Bundle" is not a word a client uses, and "Phase 2" does two jobs

"Bundle" appears as the primary noun for what a client would call an *option*, a
*tier*, or a *plan*.

Worse, **"Phase 2" names both a bundle and a roadmap phase**. The proposal has a
Roadmap section that phases delivery over weeks; the bundle comparison has a
column called Phase 2 that means "deferred to a later budget year". A reader who
meets both in one document has no way to know they are unrelated.

### B4. "Estate", "inventory" and "environment" are used interchangeably

The home page says "Start from a typical estate" and "Open this estate →". The
wizard step is titled "Estate". The engine calls it an `AssetInventory`. The
profile field is `environment`, meaning something else entirely (cloud/on-prem).
The results warning says "No estate has been captured yet" and links to "the
estate step".

Three words, two concepts, and one of the words (`environment`) is a different
field with a different meaning.

---

## C. Enterprise-readiness

### C2. The results dashboard has no print stylesheet

`print:` utilities appear in exactly two files, both on the proposal side. The
results page — fourteen thousand pixels tall, dark-themed, with a sticky header,
a sticky section nav and two charts that render only after hydration — has none.

Somebody will press Ctrl-P on it during a meeting. What comes out will be a dark
slab with a navigation column down the side.

### C3. The rupee equivalent appears on one panel out of nine

`MoneyWithRupees` exists precisely because "$1,642,766" gives an Indian reader
nothing to judge scale against, and it is a genuinely good component: compact,
prefixed "≈", suppressed when the scenario is already INR.

It is used in `bundle-comparison.tsx` and nowhere else. The cost breakdown, the
engagement panel, the gap fix list and the roadmap all show bare foreign
currency.

### C4. Nothing says when it was priced until the last panel

"Prices were aged against {today}" is the last line of the Standing Disclaimers
block, inside the Assumptions panel, which is the ninth of nine. For a document
whose entire value rests on price freshness, the as-at date belongs in the
header.

### C5. No way to tell, from the interface, that exports exist

A consequence of A1, but worth its own line because the fix is different. Even
with the proposal page linked, nothing on the results page indicates that a
DOCX, a PDF and a costed XLSX model are one click away. An analyst who has not
been told will not discover them.

---

## D. Information architecture

### D1. Nine panels, no stated reading order, no summary-first structure

The page is ordered by the pipeline: sizing feeds cost feeds scoring feeds
portfolio feeds coverage. That is the right order for deriving the answer and
the wrong order for reading it.

An executive wants: **the answer, the money, the risk, then the working.** The
page gives: the options, the products, the split, the staffing, the money, the
coverage, the gaps, the sizing, the caveats.

### D2. The first screen after intake is a six-column comparison table

Related to A2 but distinct: even once a summary exists, `BundleComparison` is a
dense financial table and it is the first thing rendered. Year 1 / Procurement /
All-in / TCO is four money columns whose differences are not self-evident —
"procurement" versus "all-in" is exactly the licence-versus-people distinction
this product is built to teach, and the table assumes the reader already knows
it.

### D3. Dark-only theme, against boardroom and print reality

`viewport.colorScheme` is `'dark'` and `globals.css` states plainly that there is
no light theme, by design (PROJECT_SPEC §9).

Recorded as a consideration rather than a defect, because it was a decision. But
the two places it costs us are real: projectors in meeting rooms wash dark
themes out badly, and printing is covered above. A light *print* treatment
resolves both without touching the screen design.

---

## What is genuinely good, and should not be touched

Worth recording so a later pass does not "improve" these:

- **Every number carries its own working.** The staffing panel, the sizing
  worksheet and the rationale lists are better than what most consultancies hand
  over, and they are the product's real differentiator.
- **The disclaimers are load-bearing and correctly placed.** The header badge,
  the coverage disclaimer, the pricing-confidence grades, the "analyst estimate"
  flags. Do not soften any of them for tidiness.
- **The empty-estate warning** on the results page and in the proposal. Catching
  "you have not filled in the inventory" before it becomes a three-year TCO for
  nothing is exactly right.
- **The shortfall reporting names which cap ran out.** Annual and one-time are
  reported separately, with the minimum viable figure for each.
- **The exports cannot leak internal figures**, structurally rather than by
  convention.
- **Money formatting.** Indian digit grouping, compact notation with a
  fractional digit, minor units end to end.

---

## Recommended order of work

1. **A1, C5** — link the proposal, surface the exports. Smallest change, largest
   gap closed.
2. **C1** — get our margin off the client-facing screen.
3. **A2, D1** — an executive summary panel at the top of the results page.
4. **A3** — the investment figure in the proposal's executive summary.
5. **B1–B4** — one vocabulary, applied everywhere.
6. **B2** — plain-English navigation.
7. **C4, C3, C2** — as-at date in the header, rupee equivalents throughout, a
   print treatment.

---

## E. Found while fixing the above

### E1. An analyst-voice instruction was rendering in client-facing copy

`attribution.ts` pushed this into `rationale`, the list the results page renders
on the half an analyst turns toward the client:

> ⚠ Our fee is more than the whole stack would cost the client to own and run.
> Either this engagement is genuinely not worth buying as a managed service, or
> the rate card does not apply here … **Check it before this figure reaches a
> client.**

One sentence doing two jobs, and only one of them was the client's. The *fact*
is theirs and they are entitled to it — buying as a service costs more than
owning, which is a real input to their decision. The *diagnosis* is ours, and
the closing instruction is addressed to the analyst while being rendered to the
client, inviting them to audit our own rate card.

It fires on both INR presets, where the fee runs about nine times the build
cost.

**Fixed** by splitting it: the plain fact stays in `rationale`, the rate-card
diagnosis moves to `providerRationale`. The test now asserts the client-facing
list contains neither "rate card" nor "regional dimension".

### E2. "Required" was amber on met requirements and silent on unmet ones

Raised as a question about the retail preset and worth recording as a defect,
because the question was the symptom.

In the wizard's "Indicative bundles" card, `required` is badged in **warning
amber** on every mandated category — but the badge sits on a *selection*, so it
only ever appears on requirements that were **met**. Meanwhile a mandated
category the budget could not fund has no row at all.

On retail's Essential column that means four amber "required" badges on
satisfied requirements, and `backup` and `edr` — genuinely unfunded — shown by
absence.

Amber on the met ones, nothing on the unmet ones. Exactly backwards, and the
first question asked of the screen was "does required mean required but not
met?".

**Fixed**: met requirements take a neutral accent badge, unfunded mandatory
categories get their own struck-through rows marked "not funded", and the
column carries a count badge.

---

## The vocabulary, decided

B3 and B4 were held back on the first pass because they are naming decisions
rather than substitutions. Decided as follows, and applied everywhere.

| Meaning | The word | Not |
|---|---|---|
| The saved piece of work | **scenario** | session |
| One of the three things a client chooses between | **option** | bundle, tier |
| The one we would put off to a later budget year | **deferred** | Phase 2 |
| A step in the delivery sequence | **phase** (Immediate / Consolidate / Extend) | — |
| The client's assets | **estate** | inventory |
| Where those assets run | **where their systems run** | environment |

"Deferred" because the roadmap's own column is headed *Phase*, so the word was
carrying a delivery step and a budget-year deferral in the same document.
Nothing in the engine was renamed: `phase2` is still the `BundleKind`, still in
the URL, and the reasoning for the three options is still recorded on it. Only
what a reader sees changed.

**`apps/web/test/vocabulary.test.ts` now enforces this.** It reads every page
and component, extracts the strings a user can actually see — JSX text and the
props that render as words — and fails on a banned one. Comments are stripped
first, deliberately: this repo explains its own history, and the prose recording
why a word was replaced necessarily contains that word.

It earned its place immediately. The phrase-by-phrase pass before it had missed
eleven more, including every error page ("if you followed a link to a scoping
session…"), the compare screen's back link, and four panels still calling an
option a bundle.

## What this pass did not do

Recorded plainly so the next one does not have to rediscover it.

- **The rupee equivalent is on the totals, not on every row.** The executive
  summary's four figures and the cost table's total carry it; the thirteen
  category rows above that total do not, and that is a decision rather than an
  omission. `MoneyWithRupees` renders a second line, and thirteen of them would
  double the table's height to restate, thirteen times, the one thing a reader
  needs once: the order of magnitude.
- **Everything above was verified in a browser** — see "Seen in a browser"
  below. Two things were not: what a *printed* page looks like (the tooling
  cannot emulate print media, though the `@media print` block is confirmed to
  reach the stylesheet), and the phone layout, because window resizing would
  not move the rendering viewport after two attempts.
- **The dark theme is unchanged**, as intended. Only what leaves the building on
  paper was addressed.


---

## F. Found by reading the served page

Both of these were introduced by this pass's own fixes, survived typecheck, lint
and the whole suite, and were caught by fetching the page and reading the
numbers. Worth recording as a pair: they are the same mistake in two places, and
it is the mistake this product exists to prevent.

### F1. The executive summary set year one against procurement alone

The four figures shipped as year one — all-in: licence, support, infrastructure,
implementation, training *and people* — set beside `annualSpend`, which is
procurement only.

On the SaaS scale-up that rendered:

> Year one **₹5,28,77,686** · Every year after **₹7,98,959**

A sixty-six-fold collapse a year later, which does not happen. The people did
not go away. They were in one figure and not the other.

The labels said so — *"Licences, support and infrastructure. Not salaries."* —
and the labels were never going to carry it. **Two figures side by side are read
as comparable whatever is written underneath them.**

**Fixed**: both all-in, and the procurement split stated in the note where it
informs instead of inviting the comparison. The column now reconciles —
5.29 + 3.39 + 3.39 = 12.07 crore, which is exactly the stated three-year total.

### F2. The same defect in the proposal, where it goes to the client

Identical pairing in the investment table added under A3, and worse, because
this one is printed into a Word document a CFO reads without an analyst present.
On the retail chain:

> Year one **₹70,63,276** · Each year after **₹26,56,595** · Three-year total
> **₹1,74,24,298**

70.6 + 26.6 + 26.6 is ₹1.24 crore, not ₹1.74 crore. A reader who checks the
arithmetic finds it wrong, on page one, in the section written to establish
confidence.

**Fixed** the same way: the second row is now all-in (₹51,31,276), with
procurement indented beneath it as a component. 70.6 + 51.3 + 51.3 = ₹1.73
crore against a stated ₹1.74 crore — the remainder is the licence uplift
compounding on the later years.

**`proposal.test.ts` now asserts the reconciliation rather than the wording**:
year one plus the remaining years must land on the horizon total within the
uplift, *and* the broken pairing must not be able to reach it. A test on the
labels would have passed against both versions.

## Verified on the wire

Fetched from a running dev server, against real saved scenarios, after every
change above:

| Claim | How | Result |
|---|---|---|
| The summary renders (server component, unlike the charts) | fetch + strip tags | Present, reads correctly |
| Year one and each-year-after reconcile with the total | arithmetic on served figures | 5.29 + 3.39 + 3.39 = 12.07 crore ✓ |
| The proposal's investment column reconciles | arithmetic on served figures | 70.6 + 51.3 + 51.3 ≈ 174.2 lakh ✓ |
| The proposal is linked from results | grep the served HTML | 1 link |
| Internal figures absent by default | grep, managed scenario | 0 occurrences of all five |
| Internal figures present on `?view=internal` | same page, same greps | all five present |
| Nothing internal on a client-operated scenario | grep | 0, correctly |
| The print block reaches the browser | fetch the stylesheet | `@media print` × 2 |


---

## Seen in a browser

The Chrome extension connected, which closes the oldest open question in
`docs/STATUS.md`: *"the dashboard as a whole has never been looked at in a
browser"*, and specifically *"the two Recharts figures are the only part of this
application that has never been observed working."*

They work.

**The charts.** Both render. The category chart puts six horizontal bars with
their labels clear of one another — "Vulnerability management" wraps to two
lines and stays legible — over an axis of ₹0 / ₹6.5L / ₹13L / ₹19.5L / ₹26L, all
distinct. The cash-flow chart draws three bars with an axis of ₹0 to ₹80L.

**And the bar labels paint.** ₹70.6L, ₹51.6L, ₹52L sit above their bars. That is
the assertion `charts.test.tsx` has carried as a deliberately *skipped* test,
because `<LabelList>` needs computed geometry that jsdom never supplies. It can
be unskipped for a browser run, or left skipped with this recorded — but it is
no longer unknown.

**The rest, confirmed visually**: the executive summary and its four figures;
the plain-English section nav; the `Proposal →` button; the engagement panel
showing only client-facing figures with the opt-in link beneath; and, under
`?view=internal`, the amber "Internal view · do not show the client" block
carrying "Margin, per year ₹4,59,85,445 **96% of the fee**", the rota's full
working, and the rate-card caveat.

**One console error, and it is not ours.** A React hydration mismatch fires on
the results page. Every line of its diff is `fdprocessedid`, an attribute a
form-filler browser extension writes onto inputs and buttons before React loads
— which is the last cause React's own message lists. Nothing else logged:
no application errors, no warnings.

### F3. The page gave two answers to "what does it cost after year one"

Found by reading the summary and the cash-flow chart on the same screen.

The summary said **₹51,31,276**. The chart, two panels down, showed Year 2 at
**₹51.6L** and Year 3 at **₹52L**.

Both correct. `annualRecurring` is the steady annual cost at today's rates; the
cash flow applies the licence uplift, which compounds. Under a percent apart —
and a reader who finds two different answers to the same question stops trusting
both of them.

**Fixed** in copy rather than in figures: the note now says licences rise a
little each year with the subscription uplift and points at the chart, which has
each year separately. Changing the figure would have broken the like-for-like
property F1 exists to hold.
