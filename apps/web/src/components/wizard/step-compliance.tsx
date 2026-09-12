'use client';

import type { FrameworkId } from '@stackfit/schema';

import { Badge, Card, Checkbox } from '@/components/ui';

import { useWizard } from './store';

export interface FrameworkOption {
  readonly id: FrameworkId;
  readonly name: string;
  readonly version: string;
  readonly sourceQuality: 'publisher_verified' | 'secondary_sources' | 'provisional';
  readonly commonIn: readonly string[];
  readonly controlCount: number;
}

const QUALITY_TONE = {
  publisher_verified: 'good',
  secondary_sources: 'warn',
  provisional: 'bad',
} as const;

const QUALITY_LABEL = {
  publisher_verified: 'publisher verified',
  secondary_sources: 'secondary sources',
  provisional: 'provisional',
} as const;

/**
 * Which frameworks are in scope (PROJECT_SPEC §5.4).
 *
 * This is the step that changes the answer most: a selection here promotes a
 * product category from optional to mandatory, and sets the log retention the
 * sizing stage uses. The source-quality badge is on the tick box rather than
 * buried in a report, because a coverage claim is only as good as the control
 * list behind it.
 */
export function StepCompliance({ frameworks }: { frameworks: readonly FrameworkOption[] }) {
  const profile = useWizard((state) => state.profile);
  const patchProfile = useWizard((state) => state.patchProfile);

  const suggested = frameworks.filter((framework) => framework.commonIn.includes(profile.region));

  return (
    <Card
      title="Compliance"
      hint="Each one can make a category mandatory and lengthen log retention."
    >
      {suggested.length > 0 && (
        <p className="text-faint mb-3 text-xs">
          Common in {profile.region.toUpperCase()}:{' '}
          {suggested.map((framework) => framework.name).join(', ')}. A suggestion, never a
          constraint.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {frameworks.map((framework) => (
          <Checkbox
            key={framework.id}
            checked={profile.compliance.includes(framework.id)}
            onChange={(checked) =>
              patchProfile({
                compliance: checked
                  ? [...profile.compliance, framework.id]
                  : profile.compliance.filter((id: FrameworkId) => id !== framework.id),
              })
            }
            label={
              <span className="flex flex-wrap items-center gap-2">
                {framework.name}
                <span className="text-faint">{framework.version}</span>
                <Badge tone={QUALITY_TONE[framework.sourceQuality]}>
                  {QUALITY_LABEL[framework.sourceQuality]}
                </Badge>
              </span>
            }
            hint={`${framework.controlCount} controls`}
          />
        ))}
      </div>

      <p className="text-faint mt-4 text-xs leading-snug">
        Below <em>publisher verified</em>, a framework is fine for shortlisting. Reconcile it before
        a coverage figure reaches the client.
      </p>
    </Card>
  );
}
