import { coverageDisclaimer, proposalDisclaimer } from '@stackfit/engine';
import { Newsreader } from 'next/font/google';
import type { Metadata } from 'next';
import Link from 'next/link';

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
 * What *is* live is the catalog arithmetic: product, category, framework and
 * control counts are counted from `data/` rather than typed into the copy. A
 * landing page for a tool whose second hard rule is "never invent a number"
 * should not contain a number nobody can check, and a figure typed into
 * marketing copy is stale the first time someone adds a product.
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
      <header className="border-line mx-auto flex w-full max-w-[1120px] items-baseline gap-3 border-b px-6 pt-7 pb-4">
        <span className="text-ink text-lg font-semibold tracking-tight">StackFit</span>
        <span className="text-faint hidden text-xs sm:inline">Security Solution Advisor</span>
        <Link
          href="/scenarios"
          className="text-accent hover:text-accent/80 ml-auto text-sm font-medium transition-colors"
        >
          Sign in →
        </Link>
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
              An analyst describes a prospective client&rsquo;s estate — assets, headcount,
              compliance, budget. StackFit returns a security stack, costs it over three years, and
              shows the reasoning behind each figure before anyone is asked to believe it.
            </p>
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

          <ul className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <li
                key={category}
                className="border-line bg-panel text-muted tabular rounded border px-2 py-1 text-xs"
              >
                {category}
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
            it, so the order is information rather than ornament. Nothing else
            on this page is numbered.
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
              the client is still describing the estate — and the proposal is a button, not a
              project.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/scenarios"
                className="bg-accent-edge inline-flex items-center rounded-(--radius-control) px-5 py-2.5 text-base font-medium text-[#06232b] transition-colors duration-(--duration-quick) hover:bg-[#2aabbb]"
              >
                Open the portal →
              </Link>
              <Link
                href="/signin"
                className="text-ground inline-flex items-center rounded-(--radius-control) border border-[#4a5158] px-5 py-2.5 text-base transition-colors duration-(--duration-quick) hover:border-accent-edge hover:text-[#9fdbe4]"
              >
                Sign in
              </Link>
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

function Count({ n, k }: { n: number; k: string }) {
  return (
    <div>
      <dt className="sr-only">{k}</dt>
      <dd className="m-0">
        <span className="tabular text-ink block text-[2rem] leading-none tracking-[-0.03em]">
          {n}
        </span>
        <span className="text-muted mt-2 block max-w-[24ch] text-xs leading-relaxed">{k}</span>
      </dd>
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
