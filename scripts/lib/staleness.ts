/**
 * Which catalog prices need re-checking, and how.
 *
 * The engine decides *whether* a price is stale; this walks the catalog and
 * asks it about every one. Kept as a library so `pnpm catalog:staleness` and
 * the test suite give the same answer.
 */
import { assessPriceFreshness, type PriceFreshness } from '@stackfit/engine';
import type { FreshnessPolicy, IsoDate, Product } from '@stackfit/schema';

export interface PriceStatus {
  readonly productId: string;
  readonly productName: string;
  readonly tierId: string;
  readonly model: string;
  readonly confidence: string;
  readonly freshness: PriceFreshness;
  /** Where a human should go, when this cannot be refreshed automatically. */
  readonly checkUrl: string | undefined;
}

export interface StalenessReport {
  readonly all: readonly PriceStatus[];
  readonly stale: readonly PriceStatus[];
  readonly ageing: readonly PriceStatus[];
  readonly unknown: readonly PriceStatus[];
  /** Prices with no declared way to re-check them — the real backlog. */
  readonly undeclared: readonly PriceStatus[];
  readonly machineRefreshable: readonly PriceStatus[];
}

export function assessCatalogStaleness(
  catalog: ReadonlyMap<string, Product>,
  today: IsoDate,
  policy: FreshnessPolicy,
): StalenessReport {
  const all: PriceStatus[] = [];

  for (const product of catalog.values()) {
    for (const tier of product.tiers) {
      for (const rule of tier.pricing) {
        all.push({
          productId: product.id,
          productName: product.name,
          tierId: tier.id,
          model: rule.model,
          confidence: rule.pricingConfidence,
          freshness: assessPriceFreshness(rule, today, policy),
          checkUrl: rule.refresh?.method === 'manual' ? rule.refresh.checkUrl : undefined,
        });
      }
    }
  }

  // Sorted oldest-first: the thing most in need of attention reads first.
  all.sort((a, b) => (b.freshness.ageDays ?? Infinity) - (a.freshness.ageDays ?? Infinity));

  return {
    all,
    stale: all.filter((status) => status.freshness.status === 'stale'),
    ageing: all.filter((status) => status.freshness.status === 'ageing'),
    unknown: all.filter((status) => status.freshness.status === 'unknown'),
    undeclared: all.filter((status) => status.freshness.refreshMethod === 'undeclared'),
    machineRefreshable: all.filter(
      (status) => status.freshness.refreshMethod === 'azure_retail_prices',
    ),
  };
}
