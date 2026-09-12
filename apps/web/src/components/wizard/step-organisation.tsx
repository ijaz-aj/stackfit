'use client';

import {
  Industry,
  Region,
  RiskTolerance,
  SocPosture,
  type ClientProfile,
  type CurrencyCode,
  type FxConfig,
} from '@stackfit/schema';
import { useState } from 'react';

import { Button, Card, Field, NumberInput, Select, TextInput } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { withRegion } from '@/lib/scenario';

import { INDUSTRY_LABELS, REGION_LABELS, RISK_LABELS, SOC_LABELS } from './labels';
import { useWizard } from './store';

const optionsFrom = (
  values: readonly string[],
  labels: Readonly<Record<string, string>>,
): readonly { value: string; label: string }[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

export function StepOrganisation({
  fx,
  currencyByRegion,
}: {
  fx: FxConfig;
  currencyByRegion: Readonly<Record<string, CurrencyCode>>;
}) {
  const profile = useWizard((state) => state.profile);
  const patchProfile = useWizard((state) => state.patchProfile);
  const replaceProfile = useWizard((state) => state.replaceProfile);

  /*
   * The profile as it was before the last region change, so the conversion can
   * be put back.
   *
   * Moving the client to another region moves the money with them, which is
   * almost always what is meant and is never what an analyst wants done behind
   * their back. The figure is converted, what happened is stated in the two
   * currencies it happened in, and the previous profile is held here until the
   * next edit so one click restores it.
   */
  const [beforeRegion, setBeforeRegion] = useState<ClientProfile | null>(null);

  const changeRegion = (region: ClientProfile['region']) => {
    const next = withRegion(profile, region, currencyByRegion, fx);
    setBeforeRegion(next.budget.currency === profile.budget.currency ? null : profile);
    replaceProfile(next);
  };

  const priorCap = beforeRegion?.budget.annualCap ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Organisation">
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
            hint="Sets the labour rate, the likely frameworks and the currency. None of them is a constraint."
          >
            <Select
              id="region"
              value={profile.region}
              options={optionsFrom(Region.options, REGION_LABELS)}
              onChange={(event) => changeRegion(event.target.value as typeof profile.region)}
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

        {beforeRegion !== null && (
          <div
            role="status"
            className="border-accent/40 bg-accent/10 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-(--radius-control) border px-3 py-2.5"
          >
            <p className="text-muted min-w-0 flex-1 text-xs leading-relaxed">
              <span className="text-ink">
                Currency set to {profile.budget.currency} for {REGION_LABELS[profile.region]}.
              </span>{' '}
              {priorCap !== null && profile.budget.annualCap !== null ? (
                <>
                  The annual cap was converted at the {fx.asOf} rate: {formatMoney(priorCap)} is{' '}
                  {formatMoney(profile.budget.annualCap)}.
                </>
              ) : (
                <>No budget is stated yet, so nothing was converted.</>
              )}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                // The region stays; only the money goes back. Changing the
                // region was deliberate, and undoing that too would fight the
                // analyst rather than help them.
                const restore = beforeRegion;
                setBeforeRegion(null);
                patchProfile({ budget: restore.budget });
              }}
            >
              Keep {beforeRegion.budget.currency}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
