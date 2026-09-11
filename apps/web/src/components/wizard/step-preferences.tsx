'use client';

import { DataSensitivity, DeploymentMode, ProcurementBias } from '@stackfit/schema';

import { Badge, Card, Field, Select } from '@/components/ui';

import { BIAS_LABELS, CATEGORY_LABELS, DEPLOYMENT_LABELS, SENSITIVITY_LABELS } from './labels';
import { useWizard } from './store';

export interface ProductOption {
  readonly id: string;
  readonly name: string;
  readonly vendor: string;
  readonly category: string;
}

const optionsFrom = (values: readonly string[], labels: Readonly<Record<string, string>>) =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

/**
 * Constraints and preferences (PROJECT_SPEC §5.1, §7.3).
 *
 * `air_gapped` is the only deployment preference that eliminates products
 * outright — a SaaS tool in an air-gapped site cannot work at all, whereas an
 * on-premises tool for a cloud-preferring client is merely not what they asked
 * for, which is what the deployment-fit score is for.
 */
export function StepPreferences({ products }: { products: readonly ProductOption[] }) {
  const profile = useWizard((state) => state.profile);
  const patchProfile = useWizard((state) => state.patchProfile);

  const toggle = (list: readonly string[], id: string, on: boolean): string[] =>
    on ? [...list, id] : list.filter((entry) => entry !== id);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Constraints and preferences">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data sensitivity" htmlFor="dataSensitivity">
            <Select
              id="dataSensitivity"
              value={profile.dataSensitivity}
              options={optionsFrom(DataSensitivity.options, SENSITIVITY_LABELS)}
              onChange={(event) =>
                patchProfile({
                  dataSensitivity: event.target.value as typeof profile.dataSensitivity,
                })
              }
            />
          </Field>

          <Field
            label="Deployment preference"
            htmlFor="deploymentPreference"
            hint="Only air-gapped rules products out; the rest is scored, not filtered."
          >
            <Select
              id="deploymentPreference"
              value={profile.deploymentPreference}
              options={optionsFrom(DeploymentMode.options, DEPLOYMENT_LABELS)}
              onChange={(event) =>
                patchProfile({
                  deploymentPreference: event.target.value as typeof profile.deploymentPreference,
                })
              }
            />
          </Field>

          <Field
            label="Procurement bias"
            htmlFor="procurementBias"
            hint="Open source first raises the weight on operability as well as tilting the ranking — free tools still have to be runnable by this team."
            className="sm:col-span-2"
          >
            <Select
              id="procurementBias"
              value={profile.procurementBias}
              options={optionsFrom(ProcurementBias.options, BIAS_LABELS)}
              onChange={(event) =>
                patchProfile({
                  procurementBias: event.target.value as typeof profile.procurementBias,
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Incumbent tools"
        hint="What they already own and will keep, and what they have already ruled out."
      >
        {products.length === 0 ? (
          <p className="text-faint text-[12px]">The catalog is empty.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {products.map((product) => {
              const retained = profile.retainedTools.includes(product.id);
              const excluded = profile.excludedProducts.includes(product.id);
              return (
                <div key={product.id} className="border-line rounded border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-ink text-[13px]">{product.name}</span>
                    <Badge>{CATEGORY_LABELS[product.category] ?? product.category}</Badge>
                  </div>
                  <div className="mt-1.5 flex gap-4">
                    <label className="text-muted flex items-center gap-1.5 text-[11px]">
                      <input
                        type="checkbox"
                        className="accent-accent h-3 w-3"
                        checked={retained}
                        onChange={(event) =>
                          patchProfile({
                            retainedTools: toggle(profile.retainedTools, product.id, event.target.checked),
                            ...(event.target.checked
                              ? {
                                  excludedProducts: profile.excludedProducts.filter(
                                    (id) => id !== product.id,
                                  ),
                                }
                              : {}),
                          })
                        }
                      />
                      keeps it
                    </label>
                    <label className="text-muted flex items-center gap-1.5 text-[11px]">
                      <input
                        type="checkbox"
                        className="accent-bad h-3 w-3"
                        checked={excluded}
                        onChange={(event) =>
                          patchProfile({
                            excludedProducts: toggle(
                              profile.excludedProducts,
                              product.id,
                              event.target.checked,
                            ),
                            ...(event.target.checked
                              ? {
                                  retainedTools: profile.retainedTools.filter(
                                    (id) => id !== product.id,
                                  ),
                                }
                              : {}),
                          })
                        }
                      />
                      ruled out
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-faint mt-3 text-[11px] leading-snug">
          Ruling a product out is a judgement about this client — a failed proof of concept, a vendor
          the board will not approve. It does not remove the product from the catalog for anyone
          else.
        </p>
      </Card>
    </div>
  );
}
