/**
 * Data-access facade. The only module the UI and route handlers import for
 * catalogue data.
 *
 * Resolution order:
 *   KARTLY_API_PROVIDER=rest + KARTLY_API_BASE_URL set  -> live REST provider
 *   anything else                                        -> bundled sample set
 *
 * A live provider that fails falls back to the sample snapshot and the snapshot
 * keeps `source: "sample"`, so the UI badge flips from "Live" to "Sample"
 * automatically. There is no code path in this app that can show sample prices
 * under a "live" label.
 */

import { apiConfig, liveConfigured, type ApiConfig } from "@/lib/api/config";
import { sharedCache } from "@/lib/api/cache";
import type { CatalogProvider } from "@/lib/api/types";
import { sampleProvider } from "@/lib/api/providers/sample";
import { createRestProvider } from "@/lib/api/providers/rest";
import { rankProducts } from "@/lib/api/normalize";
import {
  type CatalogFilters,
  type CatalogSnapshot,
  type CatalogSummary,
  type Offer,
  type ProductDetail,
  type SortKey,
  type Store,
  type StoreId,
} from "@/lib/types";
import { effectivePackPrice } from "@/lib/engine/pricing";

export function resolveProvider(config: ApiConfig = apiConfig()): CatalogProvider {
  if (liveConfigured(config)) return createRestProvider(config, sampleProvider);
  return sampleProvider;
}

function snapshotCache(config: ApiConfig) {
  return sharedCache<CatalogSnapshot>("catalog:snapshot", {
    ttlMs: config.cacheTtlSecs * 1000,
    staleMs: config.cacheTtlSecs * 4000,
  });
}

export async function getSnapshot(): Promise<CatalogSnapshot> {
  const config = apiConfig();
  const provider = resolveProvider(config);
  try {
    return await snapshotCache(config).wrap("snapshot", () => provider.load());
  } catch {
    // Last resort: never leave the user with a broken page.
    return sampleProvider.load();
  }
}

export async function getStores(): Promise<Store[]> {
  return (await getSnapshot()).stores;
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const snapshot = await getSnapshot();
  return snapshot.products.find((p) => p.id === id) ?? null;
}

export interface SearchResult {
  snapshot: CatalogSnapshot;
  items: CatalogSummary[];
  facets: {
    categories: string[];
    brands: string[];
    stores: Store[];
  };
  total: number;
}

/** Cheapest in-stock offer summary used for sorting, filtering and cards. */
export function summarise(product: ProductDetail): CatalogSummary {
  const stockedAt: StoreId[] = [];
  const availableAt: StoreId[] = [];
  let best: { price: number; storeId: StoreId } | null = null;
  let worst = 0;
  let freshest = Number.POSITIVE_INFINITY;
  let bestUnit: { price: number; unit: string } | null = null;
  const brands = new Set<string>();

  const perStore = new Map<StoreId, number>();
  for (const offer of product.offers) {
    brands.add(offer.brand);
    if (!stockedAt.includes(offer.storeId)) stockedAt.push(offer.storeId);
    if (!offer.inStock) continue;
    if (!availableAt.includes(offer.storeId)) availableAt.push(offer.storeId);
    const price = effectivePackPrice(offer, 1);
    const current = perStore.get(offer.storeId);
    if (current === undefined || price < current) perStore.set(offer.storeId, price);
    freshest = Math.min(freshest, offer.freshnessMins);
    const unitPrice = price / offer.quantity;
    if (!bestUnit || unitPrice < bestUnit.price) bestUnit = { price: unitPrice, unit: offer.unit };
  }

  for (const [storeId, price] of perStore) {
    if (!best || price < best.price) best = { price, storeId };
    if (price > worst) worst = price;
  }

  return {
    product,
    bestPrice: best?.price ?? 0,
    bestStoreId: best?.storeId ?? ("naheed" as StoreId),
    worstPrice: worst,
    stockedAt,
    availableAt,
    valueRatio: best && worst > 0 ? best.price / worst : 1,
    spread: Math.max(0, worst - (best?.price ?? 0)),
    freshestMins: Number.isFinite(freshest) ? freshest : 0,
    brands: [...brands].sort(),
    bestUnitPrice: bestUnit ? bestUnit.price : null,
    bestUnit: bestUnit ? (bestUnit.unit as CatalogSummary["bestUnit"]) : null,
    offerCount: product.offers.length,
  };
}

const summaryCache = new WeakMap<ProductDetail, CatalogSummary>();

function summaryOf(product: ProductDetail): CatalogSummary {
  const cached = summaryCache.get(product);
  if (cached) return cached;
  const summary = summarise(product);
  summaryCache.set(product, summary);
  return summary;
}

function sortSummaries(items: CatalogSummary[], sort: SortKey): CatalogSummary[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.bestPrice - b.bestPrice);
    case "price-desc":
      return sorted.sort((a, b) => b.bestPrice - a.bestPrice);
    case "savings-desc":
      return sorted.sort((a, b) => b.spread - a.spread);
    case "name-asc":
      return sorted.sort((a, b) => a.product.name.localeCompare(b.product.name));
    default:
      return sorted;
  }
}

export async function searchCatalog(filters: CatalogFilters = {}): Promise<SearchResult> {
  const snapshot = await getSnapshot();
  const query = (filters.query ?? "").trim();

  let products = snapshot.products;
  if (query) {
    const ranked = rankProducts(query, products);
    products = ranked.map((r) => r.product);
  }

  const storeSet = filters.stores?.length ? new Set(filters.stores) : null;
  const brandSet = filters.brands?.length ? new Set(filters.brands) : null;

  let items: CatalogSummary[] = [];
  for (const product of products) {
    if (filters.category && filters.category !== "all" && product.category !== filters.category) continue;
    const summary = summaryOf(product);
    if (storeSet && !summary.stockedAt.some((s) => storeSet.has(s))) continue;
    if (brandSet && !summary.brands.some((b) => brandSet.has(b))) continue;
    if (filters.inStockOnly && summary.availableAt.length === 0) continue;
    if (filters.maxPrice && summary.bestPrice > filters.maxPrice) continue;
    items.push(summary);
  }

  items = sortSummaries(items, filters.sort ?? "relevance");

  const categories = [...new Set(snapshot.products.map((p) => p.category))].sort();
  const brands = [...new Set(snapshot.products.flatMap((p) => p.offers.map((o) => o.brand)))].sort();

  return {
    snapshot,
    items,
    facets: { categories, brands, stores: snapshot.stores },
    total: items.length,
  };
}

/** Offers for a set of canonical ids — the payload the basket engine needs. */
export async function offersFor(canonicalIds: string[]): Promise<Offer[]> {
  const snapshot = await getSnapshot();
  const wanted = new Set(canonicalIds);
  return snapshot.products
    .filter((p) => wanted.has(p.id))
    .flatMap((p) => p.offers);
}

export type { CatalogProvider };
export { sampleProvider };
