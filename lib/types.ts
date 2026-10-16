/**
 * Kartly canonical domain model.
 *
 * This file is the contract between four layers that must stay independent:
 *
 *   1. Data sources  (sample catalog today, supermarket pricing API tomorrow)
 *   2. Normalisation (mapping store-native SKUs onto one canonical product)
 *   3. The comparison engine (pure arithmetic, no I/O, no React)
 *   4. The UI
 *
 * Nothing in the UI imports sample data directly, and nothing in the engine
 * imports a data source. Swapping the API in means implementing
 * `CatalogProvider` in `lib/api/types.ts` — no other file changes.
 */

/* ------------------------------------------------------------------ *
 * Stores
 * ------------------------------------------------------------------ */

export const STORE_IDS = [
  "naheed",
  "imtiaz",
  "carrefour",
  "chase-up",
  "springs",
  "hydri",
  "bin-hashim",
  "chase-value",
  "spar",
] as const;

export type StoreId = (typeof STORE_IDS)[number];

export interface Store {
  id: StoreId;
  name: string;
  /** Two-letter chip label. */
  initials: string;
  /** Flat delivery charge in PKR. */
  deliveryFee: number;
  /** Subtotal at which delivery becomes free. 0 = never free. */
  freeDeliveryOver: number;
  /** Minimum order the store will accept, PKR. */
  minOrder: number;
  /** Typical delivery window, shown for flavour. */
  eta: string;
  /** Brand colour used in chips, bars and charts. */
  accent: string;
  blurb: string;
  /** Areas of Karachi the sample data assumes it serves. */
  coverage: string;
}

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

/**
 * Base units we normalise pack sizes into. `piece` and `dozen` are their own
 * units on purpose: comparing a 12-count tray against a 30-count tray in
 * "pieces" is honest, converting one of them to grams would not be.
 */
export const UNITS = [
  "g",
  "kg",
  "ml",
  "L",
  "piece",
  "dozen",
  "sheet",
] as const;

export type Unit = (typeof UNITS)[number];

/** Multiples used to keep labels short: 1500 g -> 1.5 kg. */
const UNIT_UPGRADE: Partial<Record<Unit, { to: Unit; size: number }>> = {
  g: { to: "kg", size: 1000 },
  ml: { to: "L", size: 1000 },
};

/** Convert a quantity in `unit` into the friendliest unit of the same family. */
export function normaliseQuantity(
  quantity: number,
  unit: Unit,
): { quantity: number; unit: Unit } {
  const upgrade = UNIT_UPGRADE[unit];
  if (upgrade && quantity >= upgrade.size) {
    return {
      quantity: +(quantity / upgrade.size).toFixed(3),
      unit: upgrade.to,
    };
  }
  return { quantity, unit };
}

/** "1.5 kg" style label. */
export function formatQuantity(quantity: number, unit: Unit): string {
  const n = normaliseQuantity(quantity, unit);
  const num = Number.isInteger(n.quantity)
    ? n.quantity.toLocaleString("en-PK")
    : n.quantity.toLocaleString("en-PK", { maximumFractionDigits: 3 });
  return `${num} ${n.unit}`;
}

/**
 * Price per base unit, e.g. Rs 480/kg. Returns null when the comparison would
 * be meaningless (different unit families can never be compared per-unit).
 */
export function unitPrice(price: number, quantity: number, unit: Unit): number | null {
  if (!quantity || quantity <= 0) return null;
  const n = normaliseQuantity(quantity, unit);
  return price / n.quantity;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export const CATEGORIES = [
  "Pantry & Grains",
  "Oil & Ghee",
  "Dairy & Eggs",
  "Meat & Fish",
  "Fruit & Veg",
  "Beverages",
  "Breakfast & Snacks",
  "Spices & Masala",
  "Cleaning",
  "Personal Care",
  "Household",
  "Baby Care",
] as const;

export type Category = (typeof CATEGORIES)[number];

/* ------------------------------------------------------------------ *
 * Offers — one store's version of a product
 * ------------------------------------------------------------------ */

export type PromoKind = "percent" | "flat" | "bundle";

export interface Promo {
  kind: PromoKind;
  /** percent: percent off. flat: PKR off per pack. bundle: free packs. */
  value: number;
  /** bundle only: packs you must buy to earn `value` free. */
  buy?: number;
  /** Short label as the store would print it, e.g. "20% off". */
  label: string;
}

export interface Offer {
  /** Canonical product this offer has been matched to. */
  canonicalId: string;
  storeId: StoreId;
  /** The store's own SKU/code. */
  sku: string;
  /** The store's own title, verbatim — this is what a receipt would say. */
  title: string;
  brand: string;
  /** Pack contents expressed in the canonical product's base unit. */
  quantity: number;
  unit: Unit;
  /** Ready-made pack label, e.g. "5 kg". */
  packLabel: string;
  /** Pack price in PKR before any promo. */
  price: number;
  /** Shelf/list price before promo, so the UI can strike it through. */
  listPrice?: number;
  promo?: Promo | null;
  inStock: boolean;
  /** Loose stock band; APIs rarely give an exact count. */
  stock?: "in" | "low" | "out";
  /**
   * Minutes since this price was last refreshed. Carried as an integer rather
   * than a timestamp so server prerender and client hydration always agree.
   */
  freshnessMins: number;
  /** True when the figure came from a live API rather than the sample set. */
  live: boolean;
  imageUrl?: string;
}

/* ------------------------------------------------------------------ *
 * Canonical products
 * ------------------------------------------------------------------ */

export interface CanonicalProduct {
  id: string;
  /** Neutral display name, independent of any store's branding. */
  name: string;
  category: Category;
  unit: Unit;
  /**
   * The quantity a shopper means when they add "1" of this to a list, e.g.
   * 1 kg of tomatoes or 1 dozen eggs.
   */
  defaultQuantity: number;
  /** Words that identify this product on a receipt or in a search box. */
  aliases: string[];
  /** Emoji glyph used as the offline-safe thumbnail. */
  glyph: string;
  /** Optional real image (only ever from the API, never invented locally). */
  imageUrl?: string;
  /** Cheaper same-category swaps worth suggesting, by canonical id. */
  swapIds?: string[];
  /** Free-text note attached to a swap suggestion, e.g. "bone-in". */
  swapNote?: string;
}

/** Canonical products with every matched offer attached. */
export interface ProductDetail extends CanonicalProduct {
  offers: Offer[];
}

/* ------------------------------------------------------------------ *
 * Catalog queries
 * ------------------------------------------------------------------ */

export interface CatalogFilters {
  query?: string;
  category?: Category | "all";
  stores?: StoreId[];
  brands?: string[];
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: SortKey;
}

export type SortKey =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "savings-desc"
  | "name-asc";

export interface CatalogSummary {
  /**
   * The full product with offers attached. `summarise()` is only ever given a
   * `ProductDetail`, and cards need the offer list to draw the store spread,
   * so the summary carries the detail rather than a narrower slice of it.
   */
  product: ProductDetail;
  /** Cheapest pack price across stores that stock it, after promos. */
  bestPrice: number;
  bestStoreId: StoreId;
  /** Price of the same pack at the dearest store that stocks it. */
  worstPrice: number;
  /** Stores that stock it at all. */
  stockedAt: StoreId[];
  /** Stores with it in stock right now. */
  availableAt: StoreId[];
  /** bestPrice as a fraction of worstPrice, 0..1. Lower is a better deal. */
  valueRatio: number;
  /** Spread between cheapest and dearest, PKR. */
  spread: number;
  freshestMins: number;
  brands: string[];
  /** Cheapest unit price across stores, plus the unit it is quoted in. */
  bestUnitPrice: number | null;
  bestUnit: Unit | null;
  offerCount: number;
}

export interface CatalogSnapshot {
  /** ISO timestamp of when this snapshot was assembled. */
  generatedAt: string;
  /** "sample" or "live" — surfaced verbatim in the UI. */
  source: "sample" | "live";
  stores: Store[];
  products: ProductDetail[];
}

/** What the UI may claim about where the numbers came from. */
export interface DataStatusLike {
  source: "sample" | "live";
  providerId: string;
  label: string;
  note: string;
  configured: boolean;
  cacheTtlSecs: number;
}
