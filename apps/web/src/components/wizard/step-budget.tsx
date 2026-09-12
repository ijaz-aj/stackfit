'use client';

import { CurrencyCode } from '@stackfit/schema';

import { Card, Field, Select, TextInput } from '@/components/ui';
import { toMajorUnitsText, toMinorUnits } from '@/lib/format';
import { withCurrency } from '@/lib/scenario';

import { useWizard } from './store';

/**
 * Budget (PROJECT_SPEC §5.1).
 *
 * Both caps are *procurement* spend — licence, support, infrastructure. The
 * engine constrains them against the same figure, deliberately: a stated
 * security budget is a purchase-order number, and the client's own salaried
 * team is not on that purchase order.
 */
export function StepBudget() {
  const profile = useWizard((state) => state.profile);
  const patchProfile = useWizard((state) => state.patchProfile);
  const replaceProfile = useWizard((state) => state.replaceProfile);

  const { budget } = profile;

  const setCap = (key: 'annualCap' | 'oneTimeCap', text: string) => {
    const amountMinor = toMinorUnits(text, budget.currency);
    patchProfile({
      budget: {
        ...budget,
        [key]: amountMinor === null ? null : { amountMinor, currency: budget.currency },
      },
    });
  };

  return (
    <Card title="Budget" hint="Leave blank for “not stated”, which is not the same as zero.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Currency"
          htmlFor="currency"
          hint="Changing this re-labels the caps below; it never converts them."
        >
          <Select
            id="currency"
            value={budget.currency}
            options={CurrencyCode.options.map((value) => ({ value, label: value }))}
            onChange={(event) =>
              replaceProfile(withCurrency(profile, event.target.value as typeof budget.currency))
            }
          />
        </Field>

        <Field label="Horizon (years)" htmlFor="horizonYears" hint="What the TCO is totalled over.">
          <Select
            id="horizonYears"
            value={String(budget.horizonYears)}
            options={[1, 2, 3, 4, 5].map((years) => ({ value: String(years), label: `${years}` }))}
            onChange={(event) =>
              patchProfile({ budget: { ...budget, horizonYears: Number(event.target.value) } })
            }
          />
        </Field>

        <Field
          label={`Annual cap (${budget.currency})`}
          htmlFor="annualCap"
          hint="Recurring licence, support and infrastructure. Not salary."
        >
          <TextInput
            id="annualCap"
            inputMode="decimal"
            className="tabular text-right"
            value={toMajorUnitsText(budget.annualCap)}
            placeholder="not stated"
            onChange={(event) => setCap('annualCap', event.target.value)}
          />
        </Field>

        <Field
          label={`One-time cap (${budget.currency})`}
          htmlFor="oneTimeCap"
          hint="Implementation, training and hardware in year one."
        >
          <TextInput
            id="oneTimeCap"
            inputMode="decimal"
            className="tabular text-right"
            value={toMajorUnitsText(budget.oneTimeCap)}
            placeholder="not stated"
            onChange={(event) => setCap('oneTimeCap', event.target.value)}
          />
        </Field>
      </div>

      <p className="text-faint mt-4 text-xs leading-snug">
        If the budget cannot cover what compliance makes mandatory, the tool says so and reports the
        shortfall. It never quietly recommends a stack that fails the obligation.
      </p>
    </Card>
  );
}
