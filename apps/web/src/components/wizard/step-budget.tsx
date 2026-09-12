'use client';

import { convertMoney } from '@stackfit/engine';
import { CurrencyCode, type FxConfig, type Money } from '@stackfit/schema';
import { useState } from 'react';

import { Button, Card, Field, Select, TextInput } from '@/components/ui';
import { formatMoney, toMajorUnitsText, toMinorUnits } from '@/lib/format';
import { withCurrency } from '@/lib/scenario';

import { useWizard } from './store';

/**
 * Budget (PROJECT_SPEC §5.1).
 *
 * Both caps are *procurement* spend: licence, support, infrastructure. The
 * engine constrains them against the same figure, deliberately: a stated
 * security budget is a purchase-order number, and the client's own salaried
 * team is not on that purchase order.
 */

/** The caps, as the pair they are. Either may be unset. */
interface Caps {
  readonly annualCap: Money | null;
  readonly oneTimeCap: Money | null;
}

export function StepBudget({ fx }: { fx: FxConfig }) {
  const profile = useWizard((state) => state.profile);
  const patchProfile = useWizard((state) => state.patchProfile);
  const replaceProfile = useWizard((state) => state.replaceProfile);

  const { budget } = profile;

  /*
   * What the caps were immediately before the last currency change.
   *
   * Changing the currency re-labels the caps rather than converting them, and
   * that is the right default: an analyst who picked the wrong code wants the
   * number they typed left alone. But it is only right *sometimes*. A preset
   * arrives carrying a real figure in a real currency, and re-labelling turned
   * the manufacturer's EUR 250,000 budget into INR 250,000 without a word.
   * That is about EUR 2,750: it cut the budget by a factor of ninety, moved
   * the recommendation, and reported a shortfall that was an artifact of the
   * relabelling rather than anything about the client.
   *
   * Converting automatically is the mirror of the same bug, so neither
   * behaviour is picked on the analyst's behalf. What happened is stated, and
   * the other reading is one click away.
   */
  const [priorCaps, setPriorCaps] = useState<{ from: CurrencyCode; caps: Caps } | null>(null);

  const setCap = (key: 'annualCap' | 'oneTimeCap', text: string) => {
    const amountMinor = toMinorUnits(text, budget.currency);
    setPriorCaps(null); // A typed figure is the analyst's latest word on it.
    patchProfile({
      budget: {
        ...budget,
        [key]: amountMinor === null ? null : { amountMinor, currency: budget.currency },
      },
    });
  };

  const changeCurrency = (next: CurrencyCode) => {
    if (next === budget.currency) return;
    const stated = budget.annualCap !== null || budget.oneTimeCap !== null;
    setPriorCaps(
      stated
        ? {
            from: budget.currency,
            caps: { annualCap: budget.annualCap, oneTimeCap: budget.oneTimeCap },
          }
        : null,
    );
    replaceProfile(withCurrency(profile, next));
  };

  const convertPriorCaps = () => {
    if (priorCaps === null) return;
    const to = budget.currency;
    patchProfile({
      budget: {
        ...budget,
        annualCap:
          priorCaps.caps.annualCap === null ? null : convertMoney(priorCaps.caps.annualCap, to, fx),
        oneTimeCap:
          priorCaps.caps.oneTimeCap === null
            ? null
            : convertMoney(priorCaps.caps.oneTimeCap, to, fx),
      },
    });
    setPriorCaps(null);
  };

  return (
    <Card title="Budget" hint="Leave blank for “not stated”, which is not the same as zero.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Currency"
          htmlFor="currency"
          hint="Re-labels the caps below. It does not convert them."
        >
          <Select
            id="currency"
            value={budget.currency}
            options={CurrencyCode.options.map((value) => ({ value, label: value }))}
            onChange={(event) => changeCurrency(event.target.value as CurrencyCode)}
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

      {priorCaps !== null && (
        <div
          role="status"
          className="border-warn/40 bg-warn/10 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-(--radius-control) border px-3 py-2.5"
        >
          <p className="text-warn min-w-0 flex-1 text-xs leading-relaxed">
            Re-labelled, not converted.{' '}
            {priorCaps.caps.annualCap !== null && (
              <>
                {formatMoney(priorCaps.caps.annualCap)} a year now reads as{' '}
                {formatMoney({
                  amountMinor: priorCaps.caps.annualCap.amountMinor,
                  currency: budget.currency,
                })}
                .{' '}
              </>
            )}
            If the figure was stated in {priorCaps.from}, convert it instead.
          </p>
          <Button type="button" variant="secondary" onClick={convertPriorCaps}>
            Convert at the {fx.asOf} rate
          </Button>
        </div>
      )}

      <p className="text-faint mt-4 text-xs leading-snug">
        A budget that cannot cover what compliance mandates is reported as a shortfall, never
        quietly absorbed.
      </p>
    </Card>
  );
}
