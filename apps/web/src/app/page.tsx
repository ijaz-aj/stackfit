import { coverageDisclaimer, proposalDisclaimer } from '@stackfit/engine';
import { Newsreader } from 'next/font/google';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CATEGORY_LABELS } from '@/components/wizard/labels';
import { engineData, today } from '@/lib/config.server';

/*
 * The display face, loaded here and nowhere else.
 *
 * `next/font` scopes a font to the module that imports it, so the application
 * routes never download this: the variable simply does not exist there and
 * `--font-serif` (globals.css) falls through to Georgia. Self-hosted at build
 * time, because `font-src 'self'` is the policy — a link to a font CDN would be
 * blocked rather than merely slow.
 */
const display = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'StackFit — Security Solution Advisor',
  description:
    'Describe a client estate; get a costed security stack, a three-year budget and a proposal — with the reasoning behind every figure.',
};

/**
 * The public landing page.
 *
 * The one route in this application that does **not** call `requireAnalyst()`,
 * which is the whole point of it and also the thing to be careful about. Two
 * rules follow from that and are worth stating where someone editing this file
 * will read them:
 *
 * 1. **Nothing here touches the database.** No scenario, no client name, no
 *    estate. Everything below is either the committed catalog or fixed copy.
 * 2. **The engine is never run here.** `runPipeline` returns `attribution` —
 *    our fee, our cost base, our margin — and a public route is the last place
 *    that should be one careless destructure away. The figures in the specimen
 *    are a worked example, written out, and labelled as one.
 *
 * Both are asserted in `test/public-route.test.ts` rather than left to this
 * comment.
 *
 * What *is* live is the catalog arithmetic: product, category, framework and
 * control counts are counted from `data/` rather than typed into the copy. A
 * landing page for a tool whose second hard rule is "never invent a number"
 * should not contain a number nobody can check, and a figure typed into
 * marketing copy is stale the first time someone adds a product.
 *
 * **This page is not indexed.** `X-Robots-Tag: noindex, nofollow` is served on
 * every response by `next.config.ts`. StackFit is an internal tool that happens
 * to be reachable over the public internet, and a well-written page explaining
 * what it does, what it costs a client to run and which vendors it prices is a
 * reconnaissance document if a search engine files it. See the note on
 * `src/app/robots.ts`, which deliberately does *not* disallow crawling.
 */

/**
 * Regenerated daily, rather than served static forever or rendered per request.
 *
 * This page touches no database, so Next prerenders it — which would also
 * freeze `today()` at build time, and `today()` is a real clock reading. The
 * pricing disclaimer in the footer ends "as of <date>", so a build left alone
 * for a season would go on asserting that its prices were checked the morning
 * it was compiled. That is precisely the silent staleness `catalog:staleness`
 * exists to prevent elsewhere in this repo, and it should not be reintroduced
 * on the one page a stranger reads first.
 *
 * A day is the right period because `today()` has day granularity: anything
 * shorter re-renders to produce the identical string.
 */
export const revalidate = 86_400;

/**
 * The way in, named once.
 *
 * **It is deliberately not called "Sign in".** That word names the obstacle
 * rather than the destination, and it is wrong in three separate ways here:
 *
 * 1. Sign-in is not always what happens. `authEnabled()` is false on a local
 *    install by design, and `/signin` redirects straight through to the portal;
 *    an analyst who already holds a session never sees a form either. A button
 *    labelled for a step that frequently does not occur is a button that lies
 *    about where it goes.
 * 2. It describes the turnstile, not the room. Nobody walks to a colleague's
 *    desk to sign in; they go to look at a client's numbers. The label should
 *    name the thing they came for.
 * 3. "Portal" is this product's own noun, not a borrowed one. PROJECT_SPEC's
 *    title is "Security Solution Advisor & **Budget Portal**", and the footer
 *    below has always said so. `test/vocabulary.test.ts` exists to enforce one
 *    word for one thing on every surface a client can see; the front door is a
 *    surface a client can see.
 *
 * The obvious alternative, "Start a scoping session", is barred by that same
 * lint: *session* is a banned word in user-facing copy, because the object this
 * tool saves is a **scenario** and the two were used interchangeably in 54
 * places before the audit. It would also be wrong for a returning analyst, who
 * wants the list of what they already have rather than a new one.
 *
 * The label lives in this constant and nowhere else so the masthead, the hero
 * and the closing card cannot drift apart. `test/landing.test.ts` asserts that.
 *
 * The gate is not hidden, it is just not the button: every placement carries a
 * line of text saying who the portal is for.
 */
const PORTAL = { href: '/scenarios', label: 'Open the portal' } as const;

export default async function LandingPage() {
  const { catalog, frameworks } = engineData();

  const productCount = catalog.length;
  const categoryCount = new Set(catalog.map((product) => product.category)).size;
  const frameworkCount = frameworks.size;
  const controlCount = [...frameworks.values()].reduce(
    (total, framework) => total + framework.controls.length,
    0,
  );

  /** In the order the categories read, not alphabetical: the stack an analyst builds. */
  const categories = [...new Set(catalog.map((product) => product.category))];

  return (
    /*
      `display-serif` must sit on the same element as `next/font`'s generated
      variable class — see the note on that class in globals.css. Split across
      two elements it compiles, ships, and renders every heading in Inter.
    */
    <div className={`${display.variable} display-serif bg-ground`}>
      {/*
        Its own masthead. `SiteHeader` declines to render here (see the note in
        that file): every control it carries is for somebody already inside.
      */}
      <header className="border-line mx-auto flex w-full max-w-[1120px] items-center gap-3 border-b px-6 pt-6 pb-4">
        <span className="text-ink text-lg font-semibold tracking-tight">StackFit</span>
        <span className="text-faint hidden text-xs sm:inline">Security Solution Advisor</span>
        <PortalLink tone="outline" className="ml-auto" />
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-6">
        {/* ================= HERO ================= */}
        <section className="flex flex-col gap-11 py-16 sm:py-20">
          <div className="flex flex-col gap-6">
            <p className="text-accent text-2xs flex items-center gap-3 tracking-[0.11em] uppercase">
              Scoping &amp; budget
              <span aria-hidden className="bg-line-strong h-px w-24 sm:w-40" />
            </p>

            {/*
              A serif at 60px, against Inter everywhere else in the product.
              The application is a working instrument and Inter is right for it;
              this page has one job Inter cannot do, which is to sound like
              something rather than nothing.
            */}
            <h1 className="text-ink font-serif text-[clamp(2.4rem,6vw,4.1rem)] leading-[1.04] font-normal tracking-[-0.028em] text-balance">
              Every number on the page can be <em className="text-accent italic">taken apart.</em>
            </h1>

            <p className="text-ink max-w-[54ch] text-lg leading-relaxed">
              An analyst describes a prospective client&rsquo;s estate: assets, headcount,
              compliance, budget. StackFit returns a security stack, costs it over three years, and
              shows the reasoning behind each figure before anyone is asked to believe it.
            </p>

            {/*
              The primary call to action, and the first one this page has had
              above the fold. It previously opened with two paragraphs and a
              specimen card, and the only way in was a text link in the masthead
              and two buttons fourteen screens down. A reader who arrived
              convinced had nowhere to go.
            */}
            <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <PortalLink tone="solid" />
              <p className="text-faint max-w-[34ch] text-xs leading-relaxed">
                For named analysts. Sign-in is handled on the way through, not here.
              </p>
            </div>
          </div>

          {/*
            The hero is a recommendation with its working shown, because that is
            the one thing this product does that a spreadsheet does not. Built
            from the application's own classes — `.surface`, `.tabular`,
            `.rationale`, `.warned` — so it cannot drift from what the portal
            actually renders. If the rationale list changes shape in
            globals.css, this changes with it.
          */}
          <figure className="surface m-0 overflow-hidden">
            <figcaption className="border-line bg-panel-raised flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-5 py-3">
              <span className="text-muted text-2xs tracking-wide uppercase">Recommended stack</span>
              <span className="border-line text-faint rounded-full border px-2 py-0.5 text-2xs tracking-wide uppercase">
                Worked example
              </span>
              <span className="text-faint ml-auto text-2xs tracking-wide uppercase">
                Hospital · 300 beds · HIPAA
              </span>
            </figcaption>

            <div className="p-5 sm:p-6">
              <dl className="border-line bg-line grid gap-px overflow-hidden rounded-(--radius-control) border sm:grid-cols-2 lg:grid-cols-4">
                <Figure
                  label="Year one"
                  value="$1,244,085"
                  note="Licences, infrastructure, implementation, training and people."
                  lead
                />
                <Figure
                  label="Each year after"
                  value="$1,020,985"
                  note="The same, without the one-off setup."
                />
                <Figure
                  label="Three-year total"
                  value="$3,286,054"
                  note="Everything above, plus the people to run it."
                />
                <Figure
                  label="People to run it"
                  value="5.93"
                  unit="FTE"
                  note="Administering the tools. Monitoring is counted separately."
                />
              </dl>

              <ul className="rationale measure text-muted mt-6 flex flex-col gap-1.5 text-sm leading-relaxed">
                <li>
                  Nine products across thirteen categories, covering 77.8% of the HIPAA controls a
                  purchase can satisfy.
                </li>
                <li>
                  90-day default retention sizes 5.42 TB of storage against 120.3 GB/day of ingest.
                </li>
                <li>
                  Licences rise a little each year with the subscription uplift; the cash-flow chart
                  carries each year separately.
                </li>
                <li className="warned text-warn">
                  This stack needs 5.93 FTE to administer and the client has 2. Either the gap is
                  hired, or the engagement is managed.
                </li>
              </ul>
            </div>

            <p className="border-line bg-ground text-faint border-t px-5 py-3 text-xs leading-relaxed">
              A worked example, not a live quote. {proposalDisclaimer(today())}
            </p>
          </figure>
        </section>

        {/* ================= THE PROBLEM ================= */}
        <Band marker="Scoping" markerSub="The problem">
          <h2 className="text-ink font-serif max-w-[21ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
            A security stack is usually scoped in a spreadsheet.
          </h2>
          <p className="text-muted measure text-[15px] leading-relaxed">
            Somebody sits with a prospective client for an hour, writes down roughly what they run,
            and goes away to build a number. The number comes back a week later and it is three
            things at once: a recommendation, a budget, and a claim about compliance. Nothing on the
            page says which parts were researched and which were recalled.
          </p>

          {/*
            Three failure modes rather than a feature list. Divided by hairlines
            instead of boxed into cards: this is the one place on the page that
            describes a *problem*, and giving it the same panel treatment as the
            answers below would flatten the distinction.
          */}
          <div className="divide-line border-line grid divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Failing n="01" title="The price is remembered.">
              A per-endpoint rate from a deal last year, a figure from a vendor deck, a number
              somebody was told on a call. None of it carries a date or a link, so none of it can be
              checked and all of it ages silently.
            </Failing>
            <Failing n="02" title="The people are free.">
              A tool with no licence fee is entered as zero. The two-thirds of a person it takes to
              run it is entered nowhere, which is how the cheapest line on the sheet becomes the
              most expensive thing in the estate.
            </Failing>
            <Failing n="03" title="The answer cannot be defended.">
              Six weeks later the client asks why the SIEM was sized that way. The sheet holds the
              result and not the reasoning, so the honest answer is that nobody now remembers.
            </Failing>
          </div>

          {/*
            The answer to the three above, and it uses the hero's device rather
            than the rail's: serif, with the operative clause in accent italic.

            It was a teal left rule, which is what `Band` draws beside its own
            marker. Two teal verticals at different depths of the same band read
            as a system with a rule it is not following. The emphasised `<em>`
            is already established one screen up, in the `<h1>`, and repeating a
            device on purpose is the opposite problem from repeating one by
            accident.
          */}
          <p className="text-ink font-serif max-w-[34ch] text-[clamp(1.3rem,2.4vw,1.6rem)] leading-snug font-normal tracking-[-0.014em] text-balance">
            The same conversation, with the arithmetic{' '}
            <em className="text-accent italic">written down, dated and sourced.</em>
          </p>
        </Band>

        {/* ================= WHAT AN ANALYST DOES ================= */}
        <Band marker="Intake" markerSub="What you do">
          <h2 className="text-ink font-serif max-w-[23ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
            Six questions, asked in the order a call answers them.
          </h2>
          <p className="text-muted measure text-[15px] leading-relaxed">
            Every step is optional and every step saves as it is typed, because a scoping call does
            not produce clean data and an analyst should not have to choose between listening and
            filling in a form. An estimate sits in the margin and re-runs while the client is still
            describing the estate.
          </p>

          {/*
            A rail rather than a grid of six cards. The steps are a sequence, and
            a connector drawn between them says so with no words spent; six equal
            boxes would say the opposite. Vertical at every width: six of these
            read as a list going down and as a jumble going across.
          */}
          <ol className="flex list-none flex-col p-0">
            <Step n="1" name="Organisation" hint="Who they are.">
              Sector, region, headcount, currency. Region pre-ticks the frameworks a client of that
              kind usually answers to, and suggests a labour rate. It is a hint, never a constraint.
            </Step>
            <Step n="2" name="Estate" hint="What they run.">
              Thirty asset classes, from Windows endpoints to PLCs. Firewalls dominate log ingest
              and domain controllers are the loudest thing in a Windows estate, so those are the
              counts worth getting right.
            </Step>
            <Step n="3" name="Compliance" hint="What they answer to.">
              Eleven frameworks. Ticking one promotes a product category from optional to mandatory
              and can lengthen log retention, which is why two clients with identical estates and
              different obligations get different stacks.
            </Step>
            <Step n="4" name="Budget" hint="What they can spend.">
              Two independent budgets: what they can spend every year, and what they can spend once
              on getting it in. A stack that fits one and breaks the other is reported as such
              rather than quietly trimmed.
            </Step>
            <Step n="5" name="Preferences" hint="How they buy.">
              On-premises, cloud, hybrid or air-gapped. What they already own and intend to keep.
              How many security staff they actually have, which is what decides whether a
              self-hosted tool is a saving or a liability.
            </Step>
            <Step n="6" name="Review" hint="What it produced." last>
              Reports on the five above and captures nothing of its own. It is where an analyst
              checks what the tool thinks it heard before anyone sees a figure.
            </Step>
          </ol>

          <div className="flex flex-col gap-4">
            <p className="text-faint text-2xs tracking-[0.09em] uppercase">And what comes back</p>
            <div className="border-line bg-line grid gap-px overflow-hidden rounded-(--radius-card) border sm:grid-cols-3">
              <Returns title="Three options">
                <strong className="text-ink font-medium">Essential</strong> is the minimum
                defensible posture plus everything compliance mandates.{' '}
                <strong className="text-ink font-medium">Recommended</strong> is what to buy this
                year inside the stated budget.{' '}
                <strong className="text-ink font-medium">Deferred</strong> is real, worth buying,
                and deliberately not this year. The deferred one is priced too, so putting it off is
                a decision on the record rather than a silence.
              </Returns>
              <Returns title="A coverage matrix">
                Control by control, per framework, for the stack actually selected. What is left
                open is graded by risk and comes with a costed plan for closing it.
              </Returns>
              <Returns title="A proposal">
                Built from one document model and rendered four ways, so the paper that leaves the
                building cannot disagree with the screen it came from.
              </Returns>
            </div>
          </div>
        </Band>

        {/* ================= VOCABULARY ================= */}
        <Band marker="Vocabulary" markerSub="What the words mean">
          <h2 className="text-ink font-serif max-w-[22ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
            Six words this tool uses precisely.
          </h2>
          <p className="text-muted measure text-[15px] leading-relaxed">
            Most of them are in general circulation and most of them are used loosely. They are not
            used loosely here, and a figure is only as trustworthy as the reader&rsquo;s
            understanding of what it counts.
          </p>

          <dl className="grid gap-x-12 sm:grid-cols-2">
            <Term word="Scenario">
              One client, one estate, one set of answers. It is saved, re-openable, and can be
              cloned to ask a what-if without disturbing the original. It is the unit of work here,
              and the only one.
            </Term>
            <Term word="Sizing">
              The estate turned into physical quantities: events per second, gigabytes a day,
              retention in days, storage in terabytes. Thirty coefficients do the conversion and
              each one carries a written basis for where it came from.
            </Term>
            <Term word="Ops burden">
              The fraction of a person it takes to administer a product, in FTE. A mandatory field
              on every catalog entry, because this is the number that decides whether a free licence
              is actually cheap. Monitoring the alerts is counted separately.
            </Term>
            <Term word="Fit">
              How well a product suits this particular estate: whether it scales to it, whether it
              can be deployed the way the client deploys things, and what it costs them in effort to
              operate. Explicitly not licence price, which would rank every self-hosted tool first.
            </Term>
            <Term word="Coverage">
              The share of a framework&rsquo;s controls that a selected product actually claims to
              support. It is a shortlisting aid and it is not compliance: the distinction is carried
              verbatim into every export, and the disclaimer at the foot of this page is the exact
              wording.
            </Term>
            <Term word="TCO" last>
              Three years of everything: licence, support, infrastructure, implementation, training,
              and the people. Money is held as an integer number of minor units throughout and
              formatted only at the last step, so nothing rounds twice.
            </Term>
          </dl>
        </Band>

        {/* ================= CATALOG ================= */}
        <Band marker="Catalog" markerSub="What it knows">
          <h2 className="text-ink font-serif max-w-[21ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
            A researched catalog, not a vendor list.
          </h2>
          <p className="text-muted measure text-[15px] leading-relaxed">
            Every price is sourced to a URL and a date, and every price declares how it gets
            re-checked — against Microsoft&rsquo;s retail price feed where a machine can do it, and
            by a named human reading a named page where it cannot. A price nobody can re-check is a
            price that goes stale silently.
          </p>

          {/* Counted from data/ on this request, not typed into the copy. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
            <Count n={productCount} k="products, at least five in every category" />
            <Count n={categoryCount} k="categories, from SIEM to deception" />
            <Count n={frameworkCount} k="frameworks, each graded for source quality" />
            <Count n={controlCount} k="controls mapped to the categories that support them" />
          </dl>

          {/*
            Named, not keyed.

            These rendered the raw enum: `vulnerability_management`,
            `asset_discovery`, `ngfw`, in a monospace face, on the one page in
            this product written for somebody who has never seen it. The
            sentence directly above them says "categories, from SIEM to
            deception", which is what they are called; the chips underneath were
            showing what the database calls them.

            `CATEGORY_LABELS` is the map the wizard and the results dashboard
            already read, and its own header says why it exists: "the engine's
            vocabulary is the enum, and this file never decides anything, it
            only names things." A front door quoting the schema at a reader is
            exactly the drift `test/vocabulary.test.ts` was written against.

            Falling back to the key rather than throwing, because a category
            added to `data/` before it is added to the map should show up on
            this page looking unfinished, not take the page down.
          */}
          <ul className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <li
                key={category}
                className="border-line bg-panel text-muted rounded border px-2.5 py-1 text-xs"
              >
                {CATEGORY_LABELS[category] ?? category}
              </li>
            ))}
          </ul>
        </Band>

        {/* ================= PIPELINE ================= */}
        <Band marker="Engine" markerSub="How it answers">
          <h2 className="text-ink font-serif max-w-[21ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
            Five stages, each a pure function.
          </h2>
          <p className="text-muted measure text-[15px] leading-relaxed">
            No database, no network, no clock, no randomness. The same input produces the same
            output every time, which is what lets an analyst re-open a scenario six weeks later and
            defend the number in front of a client.
          </p>

          {/*
            Numbered, and numbered honestly: each stage consumes the one before
            it, so the order is information rather than ornament.
          */}
          <ol className="flex list-none flex-col p-0">
            <Stage
              n="01"
              name="sizing"
              what="Turns an asset inventory into events per second, GB/day, retention and storage. Thirty coefficients, each carrying a written basis."
            />
            <Stage
              n="02"
              name="cost"
              what="Eleven pricing models, priced in integer minor units. Currency conversion in BigInt, because rupees pass the safe-integer limit at around a hundred million."
            />
            <Stage
              n="03"
              name="scoring"
              what="Ranks candidates on estate fit, deployment fit and the effort to operate them — not on licence price, which would make every self-hosted tool look free."
            />
            <Stage
              n="04"
              name="portfolio"
              what="Fills two independent budgets — annual and implementation — and reports what it could not fund, rather than quietly recommending a stack that fails the obligation."
            />
            <Stage
              n="05"
              name="coverage"
              what="Scores the chosen stack against the selected frameworks, control by control, and grades what is left open by risk."
            />
          </ol>
        </Band>

        {/* ================= LIMITS ================= */}
        <Band marker="Limits" markerSub="What it won't do">
          <h2 className="text-ink font-serif max-w-[22ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
            The rules it will not break to look better.
          </h2>
          <p className="text-muted measure text-[15px] leading-relaxed">
            A scoping tool is worth only the trust placed in its worst number. These are enforced by
            the schema and pinned by tests, not left to discipline.
          </p>

          <div className="border-line bg-line grid gap-px overflow-hidden rounded-(--radius-card) border sm:grid-cols-2">
            <Limit rule="Hard rule 2" title="It will not invent a price.">
              Anything unsourced must carry a placeholder sentinel and a TODO. The schema rejects a
              plausible-looking invented number wearing the placeholder flag.
            </Limit>
            <Limit rule="Hard rule 8" title="Open source is not free.">
              Operational FTE and implementation effort are mandatory fields. A three-year total
              that omits them is treated as a bug, not a simplification.
            </Limit>
            <Limit rule="Hard rule 5" title="No figure ships unexplained.">
              Every engine output carries its rationale as text. A number with nothing to say for
              itself does not reach the screen or the proposal.
            </Limit>
            <Limit rule="Coverage" title="It will not call coverage compliance.">
              A product <em>supports</em> a control; it does not satisfy one. The disclaimer at the
              foot of this page is verbatim on every surface that shows a percentage.
            </Limit>
          </div>
        </Band>

        {/* ================= OUTPUT ================= */}
        <Band marker="Output" markerSub="What comes out">
          <h2 className="text-ink font-serif max-w-[21ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
            One document model, four renderings.
          </h2>
          <p className="text-muted measure text-[15px] leading-relaxed">
            The proposal is built once as typed sections and blocks, with money left as money until
            the final step. Each format renders that same model, so a renderer can never quietly
            disagree with the other three about what the recommendation was.
          </p>

          <div className="flex flex-wrap gap-2.5">
            <Output kind="HTML" what="in-portal preview" />
            <Output kind="DOCX" what="the client's copy" />
            <Output kind="PDF" what="the version that gets emailed" />
            <Output kind="XLSX" what="money as numbers, so it pivots" />
          </div>

          <p className="text-faint measure text-sm leading-relaxed">
            Every export carries the pricing disclaimer verbatim, and each format has a test
            asserting it is there. An export is where a client stops seeing the dashboard&rsquo;s
            confidence badges.
          </p>
        </Band>

        {/* ================= CLOSE ================= */}
        <section className="border-line border-t py-16">
          <div className="bg-ink flex flex-col gap-5 rounded-(--radius-card) px-7 py-12 sm:px-11">
            <h2 className="text-ground font-serif max-w-[19ch] text-[clamp(1.7rem,3.4vw,2.3rem)] leading-tight font-normal tracking-[-0.021em] text-balance">
              Scope it on the call, not the week after.
            </h2>
            <p className="max-w-[56ch] text-[15px] leading-relaxed text-[#c9c6cc]">
              Six steps, every one optional, saving as the analyst types. The estimate updates while
              the client is still describing the estate, and the proposal is a button rather than a
              project.
            </p>
            {/*
              One call to action, not two. This card used to carry "Open the
              portal" beside "Sign in": two buttons, one destination, two names
              for it, and the quieter of the two named the turnstile. A reader
              had to work out that they were the same door.
            */}
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <PortalLink tone="on-dark" />
              <p className="max-w-[34ch] text-xs leading-relaxed text-[#9a96a0]">
                For named analysts. Sign-in is handled on the way through.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-line mx-auto flex w-full max-w-[1120px] flex-col gap-5 border-t px-6 pt-8 pb-14">
        {/*
          The two disclaimers, imported from the engine rather than retyped.
          They are the same strings the DOCX, the PDF, the XLSX and the results
          dashboard carry, so this page cannot end up making a softer claim than
          the document it is advertising.
        */}
        <div className="grid gap-6 sm:grid-cols-2">
          <Disclaimer heading="Pricing">{proposalDisclaimer(today())}</Disclaimer>
          <Disclaimer heading="Coverage">{coverageDisclaimer()}</Disclaimer>
        </div>
        <p className="text-faint flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>StackFit</span>
          <span aria-hidden>·</span>
          <span>Security Solution Advisor &amp; Budget Portal</span>
          <span aria-hidden>·</span>
          <span>Internal tool — all rights reserved</span>
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local building blocks. Not in `components/ui.tsx`: nothing else in  */
/* the application has a landing page's proportions, and putting them  */
/* in the shared set would invite the application to grow them.        */
/* ------------------------------------------------------------------ */

/**
 * The way in. One component, three grounds.
 *
 * The fill changes with what it sits on and the reason is contrast, not
 * variety. On the bone ground it is UST's teal #006E74 with white on it, which
 * is the colour they fill a primary button with and clears AA at 5.54:1. On the
 * charcoal closing card that teal would be mud, so there it is their cyan
 * #0097AB with the dark ink on top, at 4.75:1. The outline variant in the
 * masthead takes the cyan as its boundary: 3.02:1, which is exactly what WCAG
 * 1.4.11 asks of a control you have to be able to aim at, and what the token's
 * own comment reserves it for.
 *
 * `prefetch={false}` on all three. Next prefetches a `<Link>` that enters the
 * viewport, so leaving it on would have every anonymous reader's browser fire a
 * request at a gated route that can only answer with a redirect to `/signin`.
 * Three links, every visitor, nothing cached at the end of it. The route is
 * also dynamic, so there is no payload to warm.
 */
function PortalLink({
  tone,
  className = '',
}: {
  tone: 'solid' | 'outline' | 'on-dark';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-(--radius-control) font-medium ' +
    'transition-colors duration-(--duration-quick)';

  const tones = {
    solid: 'bg-accent px-6 py-3 text-base text-white hover:bg-[#005a5f]',
    outline:
      'border-accent-edge text-accent hover:bg-accent-dim border px-3.5 py-2 text-sm hover:border-accent',
    'on-dark': 'bg-accent-edge px-6 py-3 text-base text-[#06232b] hover:bg-[#2aabbb]',
  } as const;

  return (
    <Link href={PORTAL.href} prefetch={false} className={`${base} ${tones[tone]} ${className}`}>
      {PORTAL.label}
      <span aria-hidden>→</span>
    </Link>
  );
}

/**
 * A band of the page: a sticky marker in the left rail, content beside it.
 *
 * The rail is the same device the results dashboard uses to say where you are
 * in fifteen thousand pixels of panels. It collapses below `lg`, where there is
 * no width to spend on it — the same breakpoint, and the same reason, as
 * `CardSection` in `components/ui.tsx`.
 */
function Band({
  marker,
  markerSub,
  children,
}: {
  marker: string;
  markerSub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line grid gap-x-10 gap-y-6 border-t py-16 lg:grid-cols-[9rem_minmax(0,1fr)]">
      <p className="border-accent-edge text-faint h-fit border-l-2 pl-3 text-2xs tracking-[0.09em] uppercase lg:sticky lg:top-6">
        <span className="text-accent block font-semibold">{marker}</span>
        {markerSub}
      </p>
      <div className="flex min-w-0 flex-col gap-8">{children}</div>
    </section>
  );
}

function Figure({
  label,
  value,
  unit,
  note,
  lead = false,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  lead?: boolean;
}) {
  return (
    <div className="bg-panel flex flex-col gap-1.5 px-4 py-3.5">
      <dt className="text-faint text-2xs tracking-wide uppercase">{label}</dt>
      <dd className="m-0 flex flex-col gap-1.5">
        <span
          className={`tabular text-xl leading-none font-medium ${lead ? 'text-accent' : 'text-ink'}`}
        >
          {value}
          {unit !== undefined && <span className="text-faint ml-1 text-xs">{unit}</span>}
        </span>
        <span className="text-faint text-xs leading-snug">{note}</span>
      </dd>
    </div>
  );
}

/** One of the three ways a spreadsheet gets this wrong. */
function Failing({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <span className="tabular text-line-control text-xs">{n}</span>
      <h3 className="text-ink text-base font-semibold">{title}</h3>
      <p className="text-muted text-sm leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * One step of the intake, on a drawn rail.
 *
 * The connector is a child span rather than a `::before`, so that `group-last`
 * can retract it on the final step: a line continuing past the last number
 * promises a seventh question that does not exist.
 */
function Step({
  n,
  name,
  hint,
  children,
  last = false,
}: {
  n: string;
  name: string;
  hint: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4">
      {!last && (
        <span aria-hidden className="bg-line absolute top-8 bottom-0 left-[0.875rem] w-px" />
      )}
      <span className="border-line-strong bg-panel tabular text-accent z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs">
        {n}
      </span>
      <div className="pb-8">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-ink text-base font-semibold">{name}</span>
          <span className="text-faint text-xs">{hint}</span>
        </p>
        <p className="text-muted mt-1.5 max-w-[62ch] text-sm leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

/** One of the three things the portal hands back once the six steps are answered. */
function Returns({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel flex flex-col gap-2 px-5 py-5">
      <h3 className="text-ink text-base font-semibold">{title}</h3>
      <p className="text-muted text-sm leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * A defined term.
 *
 * The word is set in the figure face, because every one of these is a word that
 * names a number and the reader meets it next in a table. `last` closes the
 * bottom edge of a two-column list whose final row would otherwise be open on
 * one side.
 */
function Term({
  word,
  children,
  last = false,
}: {
  word: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`border-line border-t py-5 ${last ? 'border-b sm:border-b-0' : ''}`}>
      <dt className="tabular text-ink text-sm font-medium">{word}</dt>
      <dd className="text-muted m-0 mt-2 max-w-[54ch] text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

/**
 * A figure counted from `data/`, with what it counts.
 *
 * The caption used to be rendered twice: once as a visually-hidden `<dt>` and
 * again as a `<span>` inside the `<dd>`, so a screen reader read every one of
 * these four figures as "products, at least five in every category, 65,
 * products, at least five in every category". That is the usual cost of
 * reaching for `sr-only` to satisfy a `<dl>`, and it was unnecessary: the
 * caption is already visible, so it can simply *be* the `<dt>`.
 *
 * `flex-col-reverse` keeps the figure above its caption while leaving the DOM
 * in the order a definition list requires, term before description. Reading
 * order comes out as "products, at least five in every category: 65", which is
 * the sentence a person would say.
 */
function Count({ n, k }: { n: number; k: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-muted mt-2 max-w-[24ch] text-xs leading-relaxed">{k}</dt>
      <dd className="tabular text-ink m-0 text-[2rem] leading-none tracking-[-0.03em]">{n}</dd>
    </div>
  );
}

function Stage({ n, name, what }: { n: string; name: string; what: string }) {
  return (
    <li className="border-line grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 border-t py-5 first:border-t-0 first:pt-0 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
      <span className="tabular text-accent-edge pt-0.5 text-xs">{n}</span>
      <div>
        <span className="tabular text-ink block text-sm font-medium">{name}</span>
        <p className="text-muted mt-1.5 max-w-[58ch] text-sm leading-relaxed">{what}</p>
      </div>
    </li>
  );
}

function Limit({
  rule,
  title,
  children,
}: {
  rule: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel flex flex-col gap-2 px-5 py-6">
      <span className="text-accent text-2xs tracking-[0.08em] uppercase">{rule}</span>
      <h3 className="text-ink text-base font-semibold">{title}</h3>
      <p className="text-muted text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function Output({ kind, what }: { kind: string; what: string }) {
  return (
    <div className="border-line-strong bg-panel flex min-w-[8rem] flex-col gap-0.5 rounded-(--radius-control) border px-4 py-2.5">
      <span className="tabular text-ink text-xs font-medium">{kind}</span>
      <span className="text-faint text-xs">{what}</span>
    </div>
  );
}

function Disclaimer({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="border-line-strong border-l-2 pl-3.5">
      <span className="text-faint mb-1.5 block text-2xs tracking-[0.08em] uppercase">
        {heading}
      </span>
      <p className="text-muted measure text-xs leading-relaxed">{children}</p>
    </div>
  );
}
