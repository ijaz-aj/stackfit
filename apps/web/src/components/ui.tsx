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
  primary: 'bg-accent text-ground hover:bg-accent/90 font-medium',
  secondary: 'bg-panel-raised text-ink border border-line hover:border-line-strong',
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
        'inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
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
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-line bg-panel rounded border', className)}>
      {title !== undefined && (
        <header className="border-line border-b px-4 py-2.5">
          <h2 className="text-ink text-[13px] font-semibold tracking-tight">{title}</h2>
          {hint !== undefined && <p className="text-faint mt-0.5 text-[11px]">{hint}</p>}
        </header>
      )}
      <div className="p-4">{children}</div>
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
      <label htmlFor={htmlFor} className="text-muted text-[11px] font-medium tracking-wide uppercase">
        {label}
      </label>
      {children}
      {hint !== undefined && <p className="text-faint text-[11px] leading-snug">{hint}</p>}
    </div>
  );
}

const CONTROL_CLASSES =
  'bg-ground border-line text-ink placeholder:text-faint w-full rounded border px-2 py-1.5 text-[13px] transition-colors hover:border-line-strong focus:border-accent';

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

export function Select({
  options,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <select className={cn(CONTROL_CLASSES, 'appearance-none', className)} {...props}>
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
        'border-line hover:border-line-strong flex cursor-pointer items-start gap-2.5 rounded border px-3 py-2 transition-colors',
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
        <span className="text-ink block text-[13px] leading-tight">{label}</span>
        {hint !== undefined && <span className="text-faint block text-[11px] leading-snug">{hint}</span>}
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
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] tracking-wide uppercase',
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
      <span className="text-faint text-[10px] tracking-wide uppercase">{label}</span>
      <span
        className={cn(
          'tabular text-ink text-[15px] leading-none',
          tone === 'accent' && 'text-accent',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
        {unit !== undefined && <span className="text-faint ml-1 text-[11px]">{unit}</span>}
      </span>
      {hint !== undefined && <span className="text-faint text-[10px] leading-snug">{hint}</span>}
    </div>
  );
}
