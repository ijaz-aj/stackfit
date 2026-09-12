'use client';

import { AssetCriticality, NetworkVendor, type AssetClass } from '@stackfit/schema';

import { Badge, Card, Checkbox, Field, NumberInput, Select } from '@/components/ui';
import { formatNumber, humanise } from '@/lib/format';

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
        placeholder="–"
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
              { value: '', label: 'criticality' },
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
          <label className="text-faint flex items-center gap-2 text-xs">
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

/**
 * One group of asset classes, closed until it is needed.
 *
 * Thirty numeric fields, each with a criticality select and an internet-facing
 * checkbox, is about ninety controls on one screen. On a scoping call that is
 * not a form, it is an obstacle: the analyst scrolls past six groups that do
 * not apply to this client to reach the two that do, and an empty field looks
 * identical to a field nobody has reached yet.
 *
 * A call does not go "how many PLCs". It goes "do you have OT at all?", and
 * only then "roughly how many". So the group asks the first question and opens
 * to ask the second.
 *
 * Open when it already holds a count, which is what makes a preset legible:
 * load the hospital and the six groups it fills are the six that are open. The
 * rest state what they are and stay out of the way.
 *
 * `<details>` rather than component state, deliberately. It survives a re-render
 * from autosave without a `useEffect` to put it back, it is keyboard-operable
 * and screen-reader-announced for free, and a browser find-in-page can still
 * reach a closed group's contents.
 */
function AssetGroup({ group }: { group: (typeof ASSET_GROUPS)[number] }) {
  const inventory = useWizard((state) => state.inventory);

  const counted = group.classes.filter((assetClass) => {
    const line = inventory[assetClass];
    return line !== undefined && line.count > 0;
  });
  const total = counted.reduce((sum, assetClass) => sum + (inventory[assetClass]?.count ?? 0), 0);

  return (
    <details
      open={counted.length > 0}
      className="border-line group mb-3 break-inside-avoid rounded-(--radius-control) border"
    >
      <summary className="hover:bg-panel-raised/60 flex cursor-pointer items-center gap-2.5 rounded-(--radius-control) px-3 py-2.5 transition-colors [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="text-faint h-3 w-3 shrink-0 transition-transform duration-(--duration-quick) group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 3L7.5 6L4.5 9" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-sm font-medium">{group.title}</span>
          {group.hint !== '' && (
            <span className="text-faint block text-xs leading-snug group-open:hidden">
              {group.hint}
            </span>
          )}
        </span>
        {/*
          What is in there, without opening it. "Not asked" rather than "none":
          a group nobody reached and a group the client genuinely does not have
          are different answers, and only the analyst can tell them apart.
        */}
        <span className="shrink-0 text-xs">
          {counted.length > 0 ? (
            <span className="tabular text-accent">{formatNumber(total)}</span>
          ) : (
            <span className="text-faint">not asked</span>
          )}
        </span>
      </summary>

      <div className="border-line flex flex-col gap-2 border-t px-3 py-3">
        {group.hint !== '' && <p className="text-faint mb-1 text-xs leading-snug">{group.hint}</p>}
        {group.classes.map((assetClass) => (
          <AssetRow key={assetClass} assetClass={assetClass} />
        ))}
      </div>
    </details>
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
      <Card title="Estate" hint="Blank means not asked. 0 means asked, and none.">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={lineCount === 0 ? 'warn' : 'accent'}>{lineCount} classes captured</Badge>
          <span className="text-faint text-xs">
            Criticality and internet-facing are for the proposal. Sizing is on counts alone, so they
            change the write-up rather than the recommendation.
          </span>
        </div>

        {/*
          The first question, because it can make the rest of the step a
          formality.

          Everything below this derives log volume from an events-per-second
          figure per device class. That is what every vendor sizing calculator
          does and it is the right fallback, but the published figures for one
          class disagree by more than tenfold: a Windows workstation is quoted
          at 1, 2, 5 and 10 to 50 EPS by four different sources, because what a
          machine emits is decided by its audit policy and not by what it is.

          A client already running a SIEM does not need any of that estimated.
          They know their GB/day, because it is the number the licence bills on.
          Asked here, on the call, rather than buried in an advanced panel on a
          page they reach afterwards.

          The counts below are still wanted either way: they size per-endpoint
          and per-asset licences, they decide which products can reach the
          estate, and they are what the coverage matrix is scored against. The
          measurement replaces the volume arithmetic, not the inventory.
        */}
        <div className="border-line mb-5 rounded-(--radius-control) border px-3 py-3">
          <p className="text-ink text-sm font-medium">
            Does the client already know their log volume?
          </p>
          <p className="text-faint measure mt-1 text-xs leading-relaxed">
            If they run a SIEM today, these are on their licence and their collector. Either one
            replaces the estimate below, which is a coefficient and not a measurement.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Measured events/sec" htmlFor="measuredEps">
              <NumberInput
                id="measuredEps"
                min={0}
                value={inventory.measuredEps ?? ''}
                placeholder="they do not know"
                onChange={(event) =>
                  patchInventory({
                    measuredEps:
                      event.target.value === ''
                        ? undefined
                        : Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </Field>
            <Field label="Measured GB/day" htmlFor="measuredGbPerDay">
              <NumberInput
                id="measuredGbPerDay"
                min={0}
                step={0.1}
                value={inventory.measuredGbPerDay ?? ''}
                placeholder="they do not know"
                onChange={(event) =>
                  patchInventory({
                    measuredGbPerDay:
                      event.target.value === ''
                        ? undefined
                        : Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </Field>
          </div>
        </div>

        {/*
          Columns that flow, not a grid.

          These groups are wildly different lengths (Endpoints has three rows,
          Network has eight) and a two-column *grid* aligns them in rows, so a
          short group beside a tall one leaves a hole the height of the
          difference. On this step that was most of a screen of empty space
          next to the Servers column.

          Multi-column flow packs them instead: each group falls into whichever
          column has room. `break-inside-avoid` is what stops a group being
          split across the two, which is the one way this layout can look worse
          than the grid it replaces.
        */}
        <div className="gap-x-8 lg:columns-2">
          {ASSET_GROUPS.map((group) => (
            <AssetGroup key={group.title} group={group} />
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
                    : {
                        verbosityOverride: event.target.value as typeof inventory.verbosityOverride,
                      },
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
