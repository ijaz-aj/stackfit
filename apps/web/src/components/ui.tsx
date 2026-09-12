import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * The whole primitive set, in one file.
 *
 * shadcn/ui's conventions — native elements, Tailwind classes, variants as
 * plain data — without pulling in a component library for a form. Anything that
 * genuinely needs a portal or focus trap can be added when something needs one.
 */

const BUTTON_VARIANTS = {
  primary:
    'bg-accent text-ground font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-accent/90',
  secondary:
    'bg-panel-raised text-ink border border-line-strong shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] hover:border-line-control',
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
        'inline-flex items-center justify-center gap-1.5 rounded-(--radius-control) px-3 py-1.5 text-base transition-[color,background-color,border-color,transform] duration-(--duration-instant) active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0',
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
  hint?: string;
  children: ReactNode;
  className?: string;
  /** Sits opposite the title — a link or control that belongs to the card. */
  action?: ReactNode;
}) {
  return (
    <section className={cn('surface', className)}>
      {title !== undefined && (
        <header className="border-line flex items-start justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            {/* `text-lg` is 16px now, against 12.5px body. A card heading used
                to be 13px against 12px, which is not a hierarchy. */}
            <h2 className="text-ink text-lg font-semibold">{title}</h2>
            {hint !== undefined && <p className="text-faint mt-1 text-xs">{hint}</p>}
          </div>
          {action !== undefined && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
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
  'bg-ground border-line-control text-ink placeholder:text-faint w-full rounded-(--radius-control) border px-2.5 py-2 text-base transition-[color,background-color,border-color] duration-(--duration-quick) hover:border-accent/60 focus:border-accent';

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
 * `appearance-none` strips the native chevron, and nothing replaced it — so
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
        'border-line-strong hover:border-accent/60 hover:bg-panel-raised/60 flex cursor-pointer items-start gap-2.5 rounded-(--radius-control) border px-3 py-2.5 transition-colors duration-(--duration-quick)',
        checked && 'border-accent/60 bg-accent/5',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent mt-0.5 h-3.5 w-3.5"
      />
      <span className="flex-1">
        <span className="text-ink block text-base leading-tight">{label}</span>
        {hint !== undefined && <span className="text-faint block text-xs leading-snug">{hint}</span>}
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
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium uppercase',
        BADGE_TONES[tone],
        className,
      )}
    >
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
    <div className="flex flex-col gap-0.5">
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
