import type {
  ReactNode,
  SelectHTMLAttributes,
  InputHTMLAttributes,
  ButtonHTMLAttributes,
} from 'react';

import { cn } from '@/lib/cn';

/**
 * The whole primitive set, in one file.
 *
 * shadcn/ui's conventions (native elements, Tailwind classes, variants as
 * plain data) without pulling in a component library for a form. Anything that
 * genuinely needs a portal or focus trap can be added when something needs one.
 */

const BUTTON_VARIANTS = {
  primary:
    'bg-accent text-ground font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-accent/90',
  secondary:
    'bg-panel-raised text-ink border border-line-strong hover:border-line-control',
  ghost: 'text-muted hover:text-ink hover:bg-panel-raised',
  danger: 'text-bad border border-line hover:border-bad/60 hover:bg-bad/10',
} as const;

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-(--radius-control) px-3 py-2 text-base transition-[color,background-color,border-color,transform] duration-(--duration-instant) active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  title,
  hint,
  children,
  className,
  action,
}: {
  title?: string;
  hint?: string | undefined;
  children: ReactNode;
  className?: string;
  /** Sits opposite the title. A link or control that belongs to the card. */
  action?: ReactNode;
}) {
  return (
    <section className={cn('surface', className)}>
      {title !== undefined && (
        <header className="border-line flex items-start justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0">
            {/* `text-lg` is 16px now, against 12.5px body. A card heading used
                to be 13px against 12px, which is not a hierarchy. */}
            <h2 className="text-ink text-lg font-semibold">{title}</h2>
            {hint !== undefined && <p className="text-faint mt-1 text-xs">{hint}</p>}
          </div>
          {action !== undefined && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-muted text-xs font-medium tracking-wide uppercase">
        {label}
      </label>
      {children}
      {hint !== undefined && <p className="text-faint text-xs leading-snug">{hint}</p>}
    </div>
  );
}

/*
 * `border-line-control`, not `border-line`. An input's outline is a UI component
 * boundary under WCAG 1.4.11 and needs 3:1; the shared divider colour is 1.33:1
 * and was, measurably, an edge you had to already know was there.
 */
const CONTROL_CLASSES =
  'bg-ground border-line-control text-ink placeholder:text-faint w-full rounded-(--radius-control) border px-3 py-2 text-base transition-[color,background-color,border-color] duration-(--duration-quick) hover:border-accent/60 focus:border-accent';

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_CLASSES, className)} {...props} />;
}

export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="numeric"
      className={cn(CONTROL_CLASSES, 'tabular text-right', className)}
      {...props}
    />
  );
}

/**
 * A select that looks like one.
 *
 * `appearance-none` strips the native chevron, and nothing replaced it, so
 * every dropdown in the intake was visually identical to a text input, with no
 * affordance that it opened at all. `.select-chevron` (globals.css) draws it
 * back as a background image: it cannot be tabbed to, cannot intercept a click,
 * and needs no wrapper element.
 *
 * `appearance-none` stays, because the native control renders differently on
 * every platform and ignores the border and background set above.
 */
export function Select({
  options,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <select className={cn(CONTROL_CLASSES, 'appearance-none select-chevron', className)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'border-line-strong hover:border-accent/60 hover:bg-panel-raised/60 flex cursor-pointer items-start gap-3 rounded-(--radius-control) border px-3 py-3 transition-colors duration-(--duration-quick)',
        checked && 'border-accent/60 bg-accent/5',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent mt-1 h-3.5 w-3.5"
      />
      <span className="flex-1">
        <span className="text-ink block text-base leading-tight">{label}</span>
        {hint !== undefined && (
          <span className="text-faint block text-xs leading-snug">{hint}</span>
        )}
      </span>
    </label>
  );
}

const BADGE_TONES = {
  neutral: 'border-line text-muted',
  accent: 'border-accent/50 text-accent',
  good: 'border-good/50 text-good',
  warn: 'border-warn/50 text-warn',
  bad: 'border-bad/50 text-bad',
} as const;

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
  className?: string;
  /** The long form, where the badge shows an abbreviation of it. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-1 text-2xs font-medium whitespace-nowrap uppercase',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The engine's `rationale: string[]`, rendered.
 *
 * Eight components were each writing the dash into the content of the item,
 * so a wrapped line ran back under it and the list lost its left
 * edge. `.rationale` (globals.css) hangs the marker instead, and `.measure`
 * stops the sentences running 190 characters wide.
 */
export function RationaleList({
  lines,
  className,
}: {
  lines: readonly string[];
  className?: string;
}) {
  if (lines.length === 0) return null;

  // `text-sm`, not `text-xs`. These are the sentences that explain every figure
  // on the page, and they were being set at 11.5px: smaller than the table
  // rows they justify, which inverts the importance. 12.5px is this scale's
  // stated workhorse, and at that size 76ch is also a wider box, so the column
  // stops looking stranded in a full-width card.
  return (
    <ul
      className={cn(
        'rationale measure text-muted flex flex-col gap-1.5 text-sm leading-relaxed',
        className,
      )}
    >
      {lines.map((line) => {
        /*
          A leading ⚠ is the engine's own convention for "this line is the one
          that matters": `cost.ts`, `coverage.ts` and `compare.ts` all emit it.
          Rendered as plain text it was a glyph in the middle of six
          identically-grey bullets, which is the opposite of a warning: "this
          bundle needs more people than the client has" sat unhighlighted
          between two notes about budget arithmetic.

          `.warned` (globals.css) replaces the em-dash marker with the symbol
          and lifts the text to the warning colour, so the list stays one list
          and the exception still reads as one.
        */
        const warning = line.startsWith('⚠');
        return (
          <li key={line} className={cn(warning && 'warned text-warn')}>
            {warning ? line.replace(/^⚠\s*/, '') : line}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A section inside a card: what it is on the left, what it says on the right.
 *
 * The assumptions panel had six sections and gave every one the same 11px
 * uppercase heading, with no rule, no spacing difference and no way to tell
 * where one ended. At 1,900 pixels tall that is not a document, it is a scroll.
 *
 * The two-column rail is what makes the width work. Prose has to stay near 75
 * characters to be readable, so in a 1,350px card a single column of text is a
 * narrow ribbon stranded against 900px of empty panel, which reads as a
 * layout bug even though the measure is correct. Putting the heading and its
 * one-line summary in a fixed rail spends that width on structure instead:
 * the reader can scan six headings down the left edge without reading a word
 * of the right, which is exactly how this panel gets used in a call.
 *
 * It collapses to one column below `lg`, where there is no width to spend.
 */
export function CardSection({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'border-line grid gap-x-10 gap-y-3 border-t pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[13rem_minmax(0,1fr)]',
        className,
      )}
    >
      <div className="lg:sticky lg:top-20 lg:self-start">
        <h3 className="text-ink text-base font-semibold">{title}</h3>
        {hint !== undefined && <p className="text-faint mt-1.5 text-xs leading-relaxed">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * A grade, as a dot and a word.
 *
 * The assumptions panel showed 26 amber `Badge`s in one section. Every
 * effort figure in the bundle is an analyst estimate, so every pill was the
 * warning colour. A warning that appears 26 times consecutively is not a
 * warning, it is a texture, and it drowned the two rows that genuinely needed
 * attention. A pill is for the exception; this is for a column where every row
 * carries one.
 */
const GRADE_DOTS = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-line-control',
} as const;

export function Grade({ tone, children }: { tone: keyof typeof GRADE_DOTS; children: ReactNode }) {
  return (
    <span className="text-muted inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', GRADE_DOTS[tone])} />
      {children}
    </span>
  );
}

/** A label over a number. The sidebar is made of these. */
export function Stat({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: 'accent' | 'warn';
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-faint text-2xs tracking-wide uppercase">{label}</span>
      <span
        className={cn(
          'tabular text-ink text-lg leading-none',
          tone === 'accent' && 'text-accent',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
        {unit !== undefined && <span className="text-faint ml-1 text-xs">{unit}</span>}
      </span>
      {hint !== undefined && <span className="text-faint text-2xs leading-snug">{hint}</span>}
    </div>
  );
}
