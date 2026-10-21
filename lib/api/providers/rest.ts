import { STORE_MAP } from "@/lib/catalog/stores";
import {
  STORE_IDS,
  formatQuantity,
  type CatalogSnapshot,
  type CanonicalProduct,
  type Category,
  type Offer,
  type Promo,
  type Store,
  type StoreId,
  type Unit,
} from "@/lib/types";
import { parsePackSize } from "@/lib/api/normalize";
import type { ApiConfig } from "@/lib/api/config";
import type { CatalogProvider } from "@/lib/api/types";

/**
 * Generic REST adapter for a real supermarket pricing API.
 *
 * Design goals, in order:
 *   1. Never let a bad upstream take the UI down — every failure degrades to
 *      the supplied catalogue with the reason surfaced in the UI.
 *   2. Tolerate field naming, because supermarket feeds never agree. Mapping is
 *      permissive and pack sizes are inferred from titles when absent, since
 *      that is where Pakistani price feeds actually put them.
 *   3. Keep the key server-side. This module is only imported from route
 *      handlers and server components.
 */

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson<T>(
  url: string,
  config: ApiConfig,
  fetchImpl: typeof fetch,
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...config.extraHeaders,
  };
  if (config.apiKey && config.keyScheme !== "none") {
    headers[config.keyHeader] =
      config.keyScheme === "bearer" ? `Bearer ${config.apiKey}` : config.apiKey;
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        // 4xx is a contract problem, not a blip — retrying wastes the budget.
        throw new UpstreamError(
          `${url} responded ${response.status} ${response.statusText}`,
          response.status,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const fatal = error instanceof UpstreamError && (error.status ?? 0) < 500;
      if (fatal || attempt === config.retries) break;
      await sleep(120 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UpstreamError(
    `price API unreachable: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
  );
}

/* ------------------------------------------------------------------ *
 * Tolerant mapping
 * ------------------------------------------------------------------ */

type Loose = Record<string, unknown>;

function pick(source: Loose, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/[,rs.\s₨]/gi, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const t = value.toLowerCase();
    if (["true", "in", "yes", "y", "available", "1"].includes(t)) return true;
    if (["false", "out", "no", "n", "unavailable", "0"].includes(t)) return false;
  }
  return fallback;
}

/** Minutes since an ISO timestamp; falls back to a conservative default. */
function minutesSince(value: unknown, fallback: number): number {
  const raw = asString(value);
  if (raw) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round((Date.now() - parsed) / 60000));
  }
  const mins = asNumber(value);
  return mins !== null ? Math.max(0, Math.round(mins)) : fallback;
}

const UNIT_SET = new Set<Unit>(["g", "kg", "ml", "L", "piece", "dozen", "sheet"]);

function asUnit(value: unknown, fallback: Unit): Unit {
  const raw = asString(value).trim();
  const lower = raw.toLowerCase();
  if (UNIT_SET.has(raw as Unit)) return raw as Unit;
  const map: Record<string, Unit> = {
    gram: "g",
    grams: "g",
    gm: "g",
    kilo: "kg",
    kilos: "kg",
    kilogram: "kg",
    kilograms: "kg",
    l: "L",
    litre: "L",
    liter: "L",
    ml: "ml",
    millilitre: "ml",
    pc: "piece",
    pcs: "piece",
    piece: "piece",
    dozen: "dozen",
    doz: "dozen",
  };
  return map[lower] ?? fallback;
}

function asStoreId(value: unknown): StoreId | null {
  const raw = asString(value)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
  if ((STORE_IDS as readonly string[]).includes(raw)) return raw as StoreId;
  const aliases: Record<string, StoreId> = {
    "naheed-super-market": "naheed",
    "carrefour-pakistan": "carrefour",
    chaseup: "chase-up",
    "chase-up": "chase-up",
    "springs-super-market": "springs",
    "hydri-super-market": "hydri",
    binhashim: "bin-hashim",
    "bin-hashim": "bin-hashim",
  };
  return aliases[raw] ?? null;
}

function mapPromo(value: unknown): Promo | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Loose;
  const kind = asString(raw.kind ?? raw.type).toLowerCase();
  const label = asString(raw.label ?? raw.description);
  const amount = asNumber(raw.value ?? raw.amount ?? raw.percent ?? raw.discount);
  if (kind === "percent" && amount) {
    return { kind: "percent", value: amount, label: label || `${amount}% off` };
  }
  if (kind === "flat" && amount) {
    return { kind: "flat", value: amount, label: label || `Rs ${amount} off` };
  }
  if (kind === "bundle") {
    const buy = asNumber(raw.buy ?? raw.quantity) ?? 2;
    const free = asNumber(raw.free ?? raw.value) ?? 1;
    return { kind: "bundle", buy, value: free, label: label || `Buy ${buy} get ${free} free` };
  }
  return null;
}

function mapOffer(raw: unknown, canonicalId: string, fallbackFreshness: number): Offer | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Loose;
  const storeId = asStoreId(pick(item, ["storeId", "store", "store_id", "retailer", "merchant"]));
  if (!storeId) return null;

  const title = asString(pick(item, ["title", "name", "product", "description", "item"]));
  const unit = asUnit(pick(item, ["unit", "uom", "baseUnit"]), "piece");
  let quantity = asNumber(pick(item, ["quantity", "qty", "size", "weight", "volume", "netWeight"]));
  let resolvedUnit = unit;
  if (quantity === null) {
    // Feeds habitually bury the pack size in the title. Reading it is better
    // than guessing, and guessing is what breaks price-per-unit comparisons.
    const parsed = parsePackSize(title);
    if (!parsed) return null;
    quantity = parsed.quantity;
    resolvedUnit = parsed.unit;
  }
  const price = asNumber(pick(item, ["price", "sellingPrice", "salePrice", "mrp", "cost"]));
  if (price === null || price <= 0) return null;
  const listPrice = asNumber(pick(item, ["listPrice", "mrp", "strikePrice", "regularPrice", "basePrice"]));
  const promo = mapPromo(pick(item, ["promo", "offer", "discount", "promotion"]));
  const inStock = asBool(pick(item, ["inStock", "available", "availability", "stock", "in_stock"]));

  return {
    canonicalId,
    storeId,
    sku: asString(pick(item, ["sku", "code", "barcode"])) || undefined,
    title: title || "Untitled product",
    brand: asString(pick(item, ["brand", "make", "manufacturer"]), "Unbranded"),
    quantity,
    unit: resolvedUnit,
    packLabel: asString(pick(item, ["packLabel", "pack", "packSize"]) , "") || formatQuantity(quantity, resolvedUnit),
    price: Math.round(price),
    listPrice: listPrice && listPrice > price ? Math.round(listPrice) : promo ? Math.round(listPrice ?? price) : undefined,
    promo,
    inStock,
    stock: inStock ? (asBool(pick(item, ["lowStock"]), false) ? "low" : "in") : "out",
    freshnessMins: minutesSince(
      pick(item, ["updatedAt", "lastUpdated", "checkedAt", "refreshedAt", "timestamp"]),
      fallbackFreshness,
    ),
    live: true,
    imageUrl: asString(pick(item, ["imageUrl", "image", "imageURL", "thumbnail"])) || undefined,
  };
}

function mapProduct(raw: unknown): { product: CanonicalProduct; offers: Offer[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Loose;
  const id = asString(pick(item, ["id", "canonicalId", "slug", "key"]));
  const name = asString(pick(item, ["name", "title", "displayName"]));
  if (!id || !name) return null;

  const unit = asUnit(pick(item, ["unit", "uom"]), "piece");
  const defaultQuantity = asNumber(pick(item, ["defaultQuantity", "typicalQty", "quantity"])) ?? 1;
  const rawOffers = pick(item, ["offers", "prices", "stores", "listings"]);
  const offers = Array.isArray(rawOffers)
    ? (rawOffers.map((o) => mapOffer(o, id, 60)).filter(Boolean) as Offer[])
    : [];

  const aliasesRaw = pick(item, ["aliases", "keywords", "tags"]);
  const aliases = Array.isArray(aliasesRaw)
    ? aliasesRaw.map((a) => asString(a)).filter(Boolean)
    : [name.toLowerCase()];

  return {
    product: {
      id,
      name,
      category: (asString(pick(item, ["category", "department"]), "Pantry & Grains")) as Category,
      unit,
      defaultQuantity,
      aliases,
      glyph: asString(pick(item, ["glyph", "emoji", "icon"]), "🛒"),
      imageUrl: asString(pick(item, ["imageUrl", "image"])) || undefined,
      swapIds: Array.isArray(pick(item, ["swapIds"]))
        ? (pick(item, ["swapIds"]) as unknown[]).map((s) => asString(s)).filter(Boolean)
        : undefined,
      swapNote: asString(pick(item, ["swapNote"])) || undefined,
    },
    offers,
  };
}

function mapStore(raw: unknown): Store | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Loose;
  const id = asStoreId(pick(item, ["id", "storeId", "code"]));
  if (!id) return null;
  const base = STORE_MAP[id];
  const fee = asNumber(pick(item, ["deliveryFee", "delivery", "shippingFee"]));
  const freeOver = asNumber(pick(item, ["freeDeliveryOver", "freeDeliveryThreshold", "freeOver"]));
  const minOrder = asNumber(pick(item, ["minOrder", "minimumOrder"]));
  return {
    ...base,
    name: asString(pick(item, ["name", "displayName"]), base.name),
    deliveryFee: fee ?? base.deliveryFee,
    freeDeliveryOver: freeOver ?? base.freeDeliveryOver,
    minOrder: minOrder ?? base.minOrder,
  };
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

async function loadFallbackStores(provider: CatalogProvider): Promise<Store[]> {
  if (provider.stores) return provider.stores();
  const snapshot = await provider.load();
  return snapshot.stores;
}

export function createRestProvider(
  config: ApiConfig,
  fallback: CatalogProvider,
  fetchImpl: typeof fetch = fetch,
): CatalogProvider {
  const url = (path: string) =>
    /^https?:\/\//i.test(path) ? path : `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  return {
    id: "rest",
    source: "live",
    label: "Live price API",
    note: `Prices fetched from ${config.baseUrl}`,
    async load(): Promise<CatalogSnapshot> {
      let payload: Loose;
      try {
        payload = await requestJson<Loose>(url(config.productsPath), config, fetchImpl);
      } catch {
        // Degradation, not failure: the app must keep working when the
        // upstream is down, but it must say so rather than fake freshness.
        const snapshot = await fallback.load();
        return {
          ...snapshot,
          source: "supplied",
          stores: snapshot.stores,
        };
      }

      const rawProducts = (Array.isArray(payload.products)
        ? payload.products
        : Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : []) as unknown[];

      const mapped = rawProducts
        .map(mapProduct)
        .filter(Boolean) as Array<{ product: CanonicalProduct; offers: Offer[] }>;

      if (!mapped.length) {
        // An empty payload is worse than an error: it would render a blank
        // catalogue while claiming to be live.
        const snapshot = await fallback.load();
        return { ...snapshot, source: "supplied" };
      }

      const rawStores = (Array.isArray(payload.stores) ? payload.stores : []) as unknown[];
      const stores = rawStores.map(mapStore).filter(Boolean) as Store[];

      return {
        generatedAt: new Date().toISOString(),
        source: "live",
        stores: stores.length ? stores : await loadFallbackStores(fallback),
        products: mapped.map(({ product, offers }) => ({ ...product, offers })),
      };
    },
    async ping() {
      try {
        await requestJson<Loose>(url(config.storesPath), config, fetchImpl);
        return true;
      } catch {
        return false;
      }
    },
  };
}
