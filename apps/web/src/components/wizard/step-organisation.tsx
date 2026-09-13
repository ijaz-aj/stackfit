'use client';

import {
  Industry,
  Region,
  RiskTolerance,
  DeliveryModel,
  MsspServiceLevel,
  type ClientProfile,
  type CurrencyCode,
  type FxConfig,
} from '@stackfit/schema';
import { useState } from 'react';

import { Button, Card, Field, NumberInput, Select, TextInput } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { withRegion } from '@/lib/scenario';

import {
  DELIVERY_HINTS,
  DELIVERY_LABELS,
  SERVICE_LEVEL_HINTS,
  SERVICE_LEVEL_LABELS,
  INDUSTRY_LABELS,
  REGION_LABELS,
  RISK_LABELS,
} from './labels';
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
            hint="Zero is a valid answer, and the one that changes the recommendation most. Presets run well under the published benchmark of 0.9 to 1.5 per 100 staff."
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

          {/*
            Who operates it, which used to be "does the client have a SOC".
            That question had one answer here, because every client on this
            screen is being onboarded into ours. This one decides how hard
            operability constrains the choice, whose people carry the load, and
            whether a third-party MDR service arises at all.
          */}
          <Field label="Who operates it" htmlFor="deliveryModel">
            <Select
              id="deliveryModel"
              value={profile.deliveryModel}
              options={optionsFrom(DeliveryModel.options, DELIVERY_LABELS)}
              onChange={(event) => {
                const deliveryModel = event.target.value as typeof profile.deliveryModel;
                /*
                 * The pair has to stay valid or the profile stops parsing:
                 * `client_operated` must carry no service level, anything else
                 * must carry one. Defaulting to `mdr` rather than remembering a
                 * previous answer keeps the two controls honest about each
                 * other, and the analyst sees the level in the next field and
                 * can change it.
                 */
                patchProfile({
                  deliveryModel,
                  serviceLevel: deliveryModel === 'client_operated' ? null : (profile.serviceLevel ?? 'mdr'),
                });
              }}
            />
            <p className="text-faint mt-1 text-xs leading-snug">
              {DELIVERY_HINTS[profile.deliveryModel]}
            </p>
          </Field>

          {/*
            How far our operation reaches. Absent on `client_operated`, where
            the honest answer is that there is nothing to set: we operate
            nothing, and a control offering to say otherwise would be a control
            that contradicts the field above it.

            This is what makes co-managed mean something. Before it existed the
            two managed models differed only by a scoring nudge, and produced
            byte-identical output on two of the six presets.
          */}
          {profile.deliveryModel !== 'client_operated' && profile.serviceLevel !== null && (
            <Field label="How far it reaches" htmlFor="serviceLevel">
              <Select
                id="serviceLevel"
                value={profile.serviceLevel}
                options={optionsFrom(MsspServiceLevel.options, SERVICE_LEVEL_LABELS)}
                onChange={(event) =>
                  patchProfile({
                    serviceLevel: event.target.value as typeof profile.serviceLevel,
                  })
                }
              />
              <p className="text-faint mt-1 text-xs leading-snug">
                {SERVICE_LEVEL_HINTS[profile.serviceLevel]}
              </p>
            </Field>
          )}

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
