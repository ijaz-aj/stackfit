'use client';

import { AssetCriticality, NetworkVendor, type AssetClass } from '@stackfit/schema';

import { Badge, Card, Checkbox, Field, NumberInput, Select } from '@/components/ui';
import { humanise } from '@/lib/format';

import { ASSET_GROUPS, ASSET_LABELS } from './labels';
import { useWizard } from './store';

/**
 * The estate (PROJECT_SPEC §5.2).
 *
 * Every count is optional, and an empty box is not a zero: blank means "not
 * asked", a typed 0 means "asked, none". The sizing stage reads them
 * differently, so the UI has to preserve the difference.
 */
function AssetRow({ assetClass }: { assetClass: AssetClass }) {
  const line = useWizard((state) => state.inventory[assetClass]);
  const setAssetCount = useWizard((state) => state.setAssetCount);
  const patchAssetLine = useWizard((state) => state.patchAssetLine);

  const hasCount = line !== undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2">
      <label htmlFor={assetClass} className="text-ink text-base">
        {ASSET_LABELS[assetClass]}
      </label>
      <NumberInput
        id={assetClass}
        min={0}
        value={line?.count ?? ''}
        placeholder="—"
        onChange={(event) => {
          const raw = event.target.value;
          setAssetCount(assetClass, raw === '' ? null : Math.max(0, Number(raw) || 0));
        }}
      />

      {hasCount && (
        <div className="col-span-2 -mt-1 flex flex-wrap items-center gap-2 pl-3">
          <Select
            aria-label={`${ASSET_LABELS[assetClass]} criticality`}
            className="h-6 w-auto py-0 text-xs"
            value={line.criticality ?? ''}
            options={[
              { value: '', label: 'criticality —' },
              ...AssetCriticality.options.map((value) => ({ value, label: humanise(value) })),
            ]}
            onChange={(event) =>
              patchAssetLine(assetClass, {
                criticality:
                  event.target.value === ''
                    ? undefined
                    : (event.target.value as (typeof AssetCriticality.options)[number]),
              })
            }
          />
          <label className="text-faint flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              className="accent-accent h-3 w-3"
              checked={line.internetFacing === true}
              onChange={(event) =>
                patchAssetLine(assetClass, {
                  internetFacing: event.target.checked ? true : undefined,
                })
              }
            />
            internet-facing
          </label>
        </div>
      )}
    </div>
  );
}

export function StepEstate() {
  const inventory = useWizard((state) => state.inventory);
  const patchInventory = useWizard((state) => state.patchInventory);

  const lineCount = ASSET_GROUPS.flatMap((group) => group.classes).filter(
    (assetClass) => inventory[assetClass] !== undefined,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Estate"
        hint="Counts drive every number downstream. Leave a row blank if it did not come up — blank means not asked, 0 means asked and none."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={lineCount === 0 ? 'warn' : 'accent'}>{lineCount} classes captured</Badge>
          <span className="text-faint text-xs">
            Criticality and internet-facing are captured for the proposal. Today&apos;s engine sizes
            on counts alone, so they change the write-up rather than the recommendation.
          </span>
        </div>

        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
          {ASSET_GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <header>
                <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">
                  {group.title}
                </h3>
                {group.hint !== '' && (
                  <p className="text-faint mt-0.5 text-xs leading-snug">{group.hint}</p>
                )}
              </header>
              <div className="flex flex-col gap-1.5">
                {group.classes.map((assetClass) => (
                  <AssetRow key={assetClass} assetClass={assetClass} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <Card title="Network and logging" hint="Used for parser fit and for the ingest estimate.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firewall throughput class" htmlFor="firewallThroughputClass">
            <Select
              id="firewallThroughputClass"
              value={inventory.firewallThroughputClass ?? ''}
              options={[
                { value: '', label: 'Not stated' },
                { value: 'under_1g', label: 'Under 1 Gbps' },
                { value: '1g_to_10g', label: '1–10 Gbps' },
                { value: 'over_10g', label: 'Over 10 Gbps' },
              ]}
              onChange={(event) =>
                patchInventory(
                  event.target.value === ''
                    ? { firewallThroughputClass: undefined }
                    : {
                        firewallThroughputClass: event.target
                          .value as typeof inventory.firewallThroughputClass,
                      },
                )
              }
            />
          </Field>

          <Field
            label="Log verbosity"
            htmlFor="verbosityOverride"
            hint="Override only if you know the estate is chattier or quieter than typical."
          >
            <Select
              id="verbosityOverride"
              value={inventory.verbosityOverride ?? ''}
              options={[
                { value: '', label: 'Default profile' },
                { value: 'quiet', label: 'Quiet' },
                { value: 'default', label: 'Default' },
                { value: 'chatty', label: 'Chatty' },
              ]}
              onChange={(event) =>
                patchInventory(
                  event.target.value === ''
                    ? { verbosityOverride: undefined }
                    : { verbosityOverride: event.target.value as typeof inventory.verbosityOverride },
                )
              }
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Network vendors" hint="Whose gear the logs will come from.">
              <div className="flex flex-wrap gap-2">
                {NetworkVendor.options.map((vendor) => {
                  const selected = inventory.networkVendors.includes(vendor);
                  return (
                    <Checkbox
                      key={vendor}
                      className="w-auto px-2 py-1"
                      label={humanise(vendor)}
                      checked={selected}
                      onChange={(checked) =>
                        patchInventory({
                          networkVendors: checked
                            ? [...inventory.networkVendors, vendor]
                            : inventory.networkVendors.filter((entry) => entry !== vendor),
                        })
                      }
                    />
                  );
                })}
              </div>
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}
