import {
  coverageDisclaimer,
  type ControlCoverage,
  type CoverageResult,
  type FrameworkCoverage,
} from '@stackfit/engine';

import { Badge, Card, RationaleList } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * §8.4. The coverage matrix.
 *
 * Four states, not two. `covered` means a selected product claims that control;
 * `partial` means the stack has the right *kind* of product and that product
 * makes no such claim; `gap` means nothing addresses it; and `not addressable`
 * means no purchase can (policy, training, physical custody, cryptography)
 * which is why those cells are outside the percentage entirely.
 *
 * The status is carried by a letter as well as a colour, because colour alone
 * is not an encoding.
 */
const CELL = {
  covered: { tone: 'bg-good/25 text-good border-good/40', mark: 'C', label: 'Covered' },
  partial: { tone: 'bg-warn/20 text-warn border-warn/40', mark: 'P', label: 'Partial' },
  gap: { tone: 'bg-bad/20 text-bad border-bad/40', mark: 'G', label: 'Gap' },
  not_addressable: {
    tone: 'bg-panel-raised text-faint border-line',
    mark: '–',
    label: 'Not addressable by a purchase',
  },
} as const;

function ControlCell({ control }: { control: ControlCoverage }) {
  const cell = CELL[control.status];
  const covered = control.coveredBy.length > 0 ? `: ${control.coveredBy.join(', ')}` : '';

  return (
    <li
      className={cn('flex items-center gap-2 rounded border px-2 py-1 text-xs', cell.tone)}
      title={`${control.localId} ${control.title}: ${cell.label}${covered}`}
    >
      <span aria-hidden className="tabular w-3 shrink-0 text-center font-semibold">
        {cell.mark}
      </span>
      <span className="tabular text-ink/80 w-16 shrink-0 truncate">{control.localId}</span>
      <span className="text-muted truncate">{control.title}</span>
      {control.mandatory && <span className="text-warn ml-auto shrink-0">!</span>}
    </li>
  );
}

function FrameworkBlock({ framework }: { framework: FrameworkCoverage }) {
  const groups =
    framework.groups.length > 0
      ? framework.groups.map((group) => ({
          key: group.groupId,
          title: `${group.name}: ${group.coveredControls}/${group.addressableControls}${
            group.coveragePercent === null ? '' : ` (${group.coveragePercent}%)`
          }`,
          controls: framework.controls.filter((control) => control.group === group.groupId),
        }))
      : [{ key: 'all', title: '', controls: framework.controls }];

  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-ink text-base font-semibold">
          {framework.name} <span className="text-faint font-normal">{framework.version}</span>
        </h3>
        {framework.inScope ? <Badge tone="accent">in scope</Badge> : <Badge>reference view</Badge>}
        <Badge tone={framework.sourceQuality === 'publisher_verified' ? 'good' : 'warn'}>
          {framework.sourceQuality.replace(/_/g, ' ')}
        </Badge>
        <span className="tabular text-muted text-sm">
          {framework.coveredControls}/{framework.addressableControls} buyable controls covered
          {framework.coveragePercent === null ? '' : ` · ${framework.coveragePercent}%`}
        </span>
      </header>

      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {group.title !== '' && (
            <h4 className="text-faint text-2xs tracking-wide uppercase">{group.title}</h4>
          )}
          {/* `lg`, not `xl`: Tailwind breakpoints are CSS pixels, and a display
              at 125% scaling reports 1254 of them on a 1568px panel, so the
              third column had never appeared on the machine this was tuned on. */}
          <ul className="grid gap-1 md:grid-cols-2 lg:grid-cols-3">
            {group.controls.map((control) => (
              <ControlCell key={control.controlId} control={control} />
            ))}
          </ul>
        </div>
      ))}

      <RationaleList lines={framework.rationale} className="text-faint" />
    </section>
  );
}

export function CoverageMatrix({ coverage }: { coverage: CoverageResult }) {
  // In-scope frameworks first: what the client is on the hook for outranks a
  // lens we chose for them.
  const ordered = [...coverage.frameworks].sort((a, b) => Number(b.inScope) - Number(a.inScope));

  return (
    <Card
      title="Coverage matrix"
      hint="Covered means a product claims the control. Partial means the right kind of tool, claiming nothing."
    >
      {/* Verbatim, and first. This is the number most likely to be misread,
          and an export is where the reader stops seeing the qualifications. */}
      <p className="border-warn/40 bg-warn/10 text-warn mb-3 rounded border px-3 py-2 text-xs leading-snug">
        {coverageDisclaimer()}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {Object.entries(CELL).map(([status, cell]) => (
          <span key={status} className={cn('rounded border px-2 py-1 text-2xs', cell.tone)}>
            {cell.mark} {cell.label}
          </span>
        ))}
        <span className="text-faint px-1 py-1 text-2xs">! mandatory</span>
      </div>

      <div className="flex flex-col gap-6">
        {ordered.map((framework) => (
          <FrameworkBlock key={framework.frameworkId} framework={framework} />
        ))}
      </div>
    </Card>
  );
}
