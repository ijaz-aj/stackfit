/**
 * Which catalog prices need re-checking, and how.
 *
 * The engine decides *whether* a price is stale; this walks the catalog and
 * asks it about every one. Kept as a library so `pnpm catalog:staleness` and
 * the test suite give the same answer.
 */
import { assessPriceFreshness, type PriceFreshness } from '@stackfit/engine';
import type { FreshnessPolicy, IsoDate, PricingConfidence, Product } from '@stackfit/schema';

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
  /** Prices with no declared way to re-check them. The real backlog. */
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

/**
 * Prices that live in data/config rather than data/catalog.
 *
 * The MSSP rate card and the FX table are prices, they carry an `asOf`, and
 * they go stale exactly like a catalog price does, but only the catalog was
 * ever walked, so these rotted silently. Hard rule 9 says every price declares
 * how it gets re-checked; that has to include the ones that are not products.
 */
export function assessConfigStaleness(
  configs: readonly {
    file: string;
    confidence: PricingConfidence;
    sources: readonly { asOf: IsoDate }[];
    checkUrl?: string | undefined;
  }[],
  today: IsoDate,
  policy: FreshnessPolicy,
): StalenessReport {
  const all: PriceStatus[] = configs.map((config) => ({
    productId: config.file,
    productName: config.file,
    tierId: '(config)',
    model: 'config',
    confidence: config.confidence,
    // Config prices are re-checked by a human reading the source, always.
    freshness: assessPriceFreshness(
      { pricingConfidence: config.confidence, sources: config.sources, refresh: { method: 'manual' } },
      today,
      policy,
    ),
    checkUrl: config.checkUrl,
  }));

  all.sort((a, b) => (b.freshness.ageDays ?? Infinity) - (a.freshness.ageDays ?? Infinity));

  return {
    all,
    stale: all.filter((status) => status.freshness.status === 'stale'),
    ageing: all.filter((status) => status.freshness.status === 'ageing'),
    unknown: all.filter((status) => status.freshness.status === 'unknown'),
    undeclared: [],
    machineRefreshable: [],
  };
}
