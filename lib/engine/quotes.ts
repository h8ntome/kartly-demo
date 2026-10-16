import type { Offer, ProductDetail, Store, StoreId, Unit } from "@/lib/types";
import {
  cheapestPack,
  comparable,
  deliveryFor,
  meetsMinimum,
  type PackChoice,
} from "@/lib/engine/pricing";

/**
 * Basket → per-store quotes.
 *
 * A quote answers one question for one store: "if the whole basket went here,
 * what would the receipt look like?" Everything downstream — best single store,
 * two-store splits, savings claims — is derived from these quotes, so the
 * receipt arithmetic is written exactly once.
 */

export interface BasketItem {
  /** Stable id for the line in the UI. */
  id: string;
  canonicalId: string;
  /** Quantity wanted, expressed in `unit`. */
  quantity: number;
  unit: Unit;
  /** Optional: insist this line is bought here or not at all. */
  lockedStore?: StoreId | null;
  /** Optional: shopper does not want this line from these stores. */
  excludedStores?: StoreId[];
}

export type MissingReason =
  | "not-stocked"
  | "out-of-stock"
  | "unit-mismatch"
  | "locked-elsewhere"
  | "excluded";

export interface MissingLine {
  canonicalId: string;
  name: string;
  glyph: string;
  reason: MissingReason;
  /** Extra context, e.g. "sold here in 5 kg only". */
  detail?: string;
}

export interface ResolvedLine {
  lineId: string;
  canonicalId: string;
  name: string;
  glyph: string;
  requested: number;
  unit: Unit;
  offer: Offer;
  packs: number;
  paidQuantity: number;
  /** PKR charged for this line. */
  cost: number;
  /** PKR before promotions, for strike-throughs. 0 when there is no promo. */
  listCost: number;
  unitPrice: number;
  surplus: number;
}

export interface StoreQuote {
  storeId: StoreId;
  store: Store;
  lines: ResolvedLine[];
  missing: MissingLine[];
  subtotal: number;
  /** PKR saved against shelf prices by promos on this order. */
  discount: number;
  delivery: number;
  freeDelivery: boolean;
  /** PKR more needed for free delivery. */
  gapToFree: number;
  total: number;
  /** Share of requested lines this store can actually supply, 0..1. */
  coverage: number;
  belowMinOrder: boolean;
  /** True when the store can supply every line in the basket. */
  complete: boolean;
  /** True when this quote is a candidate for "cheapest way to buy everything". */
  eligible: boolean;
}

export interface EngineInput {
  items: BasketItem[];
  products: Map<string, ProductDetail>;
  stores: Store[];
}

/** Offers for a canonical product, grouped by store once per engine run. */
export type OfferIndex = Map<string, Map<StoreId, Offer[]>>;

export function buildOfferIndex(products: Iterable<ProductDetail>): OfferIndex {
  const index: OfferIndex = new Map();
  for (const product of products) {
    const byStore = new Map<StoreId, Offer[]>();
    for (const offer of product.offers) {
      const list = byStore.get(offer.storeId);
      if (list) list.push(offer);
      else byStore.set(offer.storeId, [offer]);
    }
    index.set(product.id, byStore);
  }
  return index;
}

function chooseFor(
  item: BasketItem,
  product: ProductDetail,
  offers: Offer[] | undefined,
): { choice: PackChoice } | { missing: MissingReason; detail?: string } {
  if (!offers || offers.length === 0) return { missing: "not-stocked" };

  const usable = offers.filter((offer) => comparable(offer.unit, item.unit));
  if (!usable.length) {
    const units = [...new Set(offers.map((o) => o.unit))].join("/");
    return { missing: "unit-mismatch", detail: `sold here in ${units} only` };
  }
  if (!usable.some((offer) => offer.inStock)) {
    return { missing: "out-of-stock", detail: usable[0]?.packLabel };
  }
  const choice = cheapestPack(usable, item.quantity, item.unit);
  if (!choice) return { missing: "out-of-stock" };
  return { choice };
}

export function quoteStore(
  store: Store,
  input: EngineInput,
  index: OfferIndex,
): StoreQuote {
  const lines: ResolvedLine[] = [];
  const missing: MissingLine[] = [];
  let subtotal = 0;
  let listTotal = 0;

  for (const item of input.items) {
    const product = input.products.get(item.canonicalId);
    if (!product) {
      missing.push({
        canonicalId: item.canonicalId,
        name: item.canonicalId,
        glyph: "❓",
        reason: "not-stocked",
      });
      continue;
    }
    if (item.lockedStore && item.lockedStore !== store.id) {
      missing.push({
        canonicalId: item.canonicalId,
        name: product.name,
        glyph: product.glyph,
        reason: "locked-elsewhere",
      });
      continue;
    }
    if (item.excludedStores?.includes(store.id)) {
      missing.push({
        canonicalId: item.canonicalId,
        name: product.name,
        glyph: product.glyph,
        reason: "excluded",
      });
      continue;
    }

    const result = chooseFor(item, product, index.get(item.canonicalId)?.get(store.id));
    if ("missing" in result) {
      missing.push({
        canonicalId: item.canonicalId,
        name: product.name,
        glyph: product.glyph,
        reason: result.missing,
        detail: result.detail,
      });
      continue;
    }

    const { offer, packs, cost, listCost, paidQuantity, unitPrice, surplus } = result.choice;
    lines.push({
      lineId: item.id,
      canonicalId: item.canonicalId,
      name: product.name,
      glyph: product.glyph,
      requested: item.quantity,
      unit: item.unit,
      offer,
      packs,
      paidQuantity,
      cost,
      listCost,
      unitPrice,
      surplus,
    });
    subtotal += cost;
    listTotal += listCost;
  }

  subtotal = Math.round(subtotal);
  const { fee, free, gapToFree } = deliveryFor(store, subtotal);
  const belowMinOrder = input.items.length > 0 && subtotal > 0 && !meetsMinimum(store, subtotal);

  return {
    storeId: store.id,
    store,
    lines,
    missing,
    subtotal,
    discount: Math.max(0, Math.round(listTotal) - subtotal),
    delivery: fee,
    freeDelivery: free,
    gapToFree,
    total: Math.round(subtotal + fee),
    coverage: input.items.length ? lines.length / input.items.length : 0,
    belowMinOrder,
    complete: missing.length === 0 && lines.length > 0,
    eligible: missing.length === 0 && lines.length > 0 && !belowMinOrder,
  };
}

export function buildQuotes(input: EngineInput): StoreQuote[] {
  const index = buildOfferIndex(input.products.values());
  return input.stores.map((store) => quoteStore(store, input, index));
}

/** Cheapest single store that can supply the entire basket. */
export function bestSingleStore(quotes: StoreQuote[]): StoreQuote | null {
  const eligible = quotes.filter((q) => q.eligible);
  if (!eligible.length) return null;
  return eligible.reduce((best, q) => (q.total < best.total ? q : best));
}
