import Link from 'next/link';

/**
 * The way into the portal, named once for the whole application.
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
 *    title is "Security Solution Advisor & **Budget Portal**". `vocabulary.test.ts`
 *    exists to enforce one word for one thing on every surface a client can
 *    see; the front door is a surface a client can see.
 *
 * The obvious alternative, "Start a scoping session", is barred by that same
 * lint: *session* is a banned word in user-facing copy, because the object this
 * tool saves is a **scenario** and the two were used interchangeably in 54
 * places before the audit. It would also be wrong for a returning analyst, who
 * wants the list of what they already have rather than a new one.
 *
 * This lives in `components/` rather than beside one page because it is now on
 * two routes that never render together: the door at `/`, which a stranger
 * reaches, and `/about` behind the gate. Two copies of a label whose entire
 * point is that it cannot drift would be the joke writing itself.
 * `test/landing.test.ts` asserts the label is declared exactly once.
 */
export const PORTAL = { href: '/scenarios', label: 'Open the portal' } as const;

/**
 * One component, three grounds.
 *
 * The fill changes with what it sits on and the reason is contrast, not
 * variety. On the bone ground it is UST's teal #006E74 with white on it, which
 * is the colour they fill a primary button with and clears AA at 5.54:1. On the
 * charcoal closing card that teal would be mud, so there it is their cyan
 * #0097AB with the dark ink on top, at 4.75:1. The outline variant takes the
 * cyan as its boundary: 3.02:1, which is exactly what WCAG 1.4.11 asks of a
 * control you have to be able to aim at, and what the token's own comment
 * reserves it for.
 *
 * `prefetch={false}` everywhere. Next prefetches a `<Link>` that enters the
 * viewport, so leaving it on would have every reader's browser fire a request
 * at a gated route that, for anyone not signed in, can only answer with a
 * redirect to `/signin`. Nothing is cached at the end of it, and the route is
 * dynamic anyway, so there is no payload to warm.
 */
export function PortalLink({
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
