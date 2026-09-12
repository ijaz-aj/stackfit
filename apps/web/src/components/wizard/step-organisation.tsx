'use client';

import { Industry, Region, RiskTolerance, SocPosture } from '@stackfit/schema';

import { Card, Field, NumberInput, Select, TextInput } from '@/components/ui';

import { INDUSTRY_LABELS, REGION_LABELS, RISK_LABELS, SOC_LABELS } from './labels';
import { useWizard } from './store';

const optionsFrom = (
  values: readonly string[],
  labels: Readonly<Record<string, string>>,
): readonly { value: string; label: string }[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

export function StepOrganisation() {
  const profile = useWizard((state) => state.profile);
  const patchProfile = useWizard((state) => state.patchProfile);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Organisation"
        hint="Who they are, and how many people are available to run any of this."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name" htmlFor="orgName" className="sm:col-span-2">
            <TextInput
              id="orgName"
              value={profile.orgName}
              onChange={(event) => patchProfile({ orgName: event.target.value })}
              placeholder="Acme Retail Pvt Ltd"
            />
          </Field>

          <Field label="Industry" htmlFor="industry">
            <Select
              id="industry"
              value={profile.industry}
              options={optionsFrom(Industry.options, INDUSTRY_LABELS)}
              onChange={(event) =>
                patchProfile({ industry: event.target.value as typeof profile.industry })
              }
            />
          </Field>

          <Field
            label="Region"
            htmlFor="region"
            hint="A hint, not a constraint: it suggests labour rates and likely frameworks, and you can override both."
          >
            <Select
              id="region"
              value={profile.region}
              options={optionsFrom(Region.options, REGION_LABELS)}
              onChange={(event) =>
                patchProfile({ region: event.target.value as typeof profile.region })
              }
            />
          </Field>

          <Field label="Employees" htmlFor="employeeCount">
            <NumberInput
              id="employeeCount"
              min={0}
              value={profile.employeeCount}
              onChange={(event) => patchProfile({ employeeCount: Number(event.target.value) || 0 })}
            />
          </Field>

          <Field label="IT staff" htmlFor="itStaffCount">
            <NumberInput
              id="itStaffCount"
              min={0}
              value={profile.itStaffCount}
              onChange={(event) => patchProfile({ itStaffCount: Number(event.target.value) || 0 })}
            />
          </Field>

          <Field
            label="Security staff (FTE)"
            htmlFor="securityStaffFte"
            hint="Zero is a valid answer, and the one that changes the recommendation most."
          >
            <NumberInput
              id="securityStaffFte"
              min={0}
              step={0.5}
              value={profile.securityStaffFte}
              onChange={(event) =>
                patchProfile({ securityStaffFte: Number(event.target.value) || 0 })
              }
            />
          </Field>

          <Field label="SOC" htmlFor="hasSoc">
            <Select
              id="hasSoc"
              value={profile.hasSoc}
              options={optionsFrom(SocPosture.options, SOC_LABELS)}
              onChange={(event) =>
                patchProfile({ hasSoc: event.target.value as typeof profile.hasSoc })
              }
            />
          </Field>

          <Field label="Risk tolerance" htmlFor="riskTolerance" className="sm:col-span-2">
            <Select
              id="riskTolerance"
              value={profile.riskTolerance}
              options={optionsFrom(RiskTolerance.options, RISK_LABELS)}
              onChange={(event) =>
                patchProfile({ riskTolerance: event.target.value as typeof profile.riskTolerance })
              }
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
