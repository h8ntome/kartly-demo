import type { ProductDetail, Store, StoreId, Unit } from "@/lib/types";
import {
  buildOfferIndex,
  buildQuotes,
  bestSingleStore,
  type BasketItem,
  type EngineInput,
  type MissingReason,
  type OfferIndex,
  type StoreQuote,
} from "@/lib/engine/quotes";
import { cheapestPack, type PackChoice } from "@/lib/engine/pricing";
import { cherryPickFloor } from "@/lib/engine/optimizer";
import { findBestPlan, type MultiPlan, type PlanOrder } from "@/lib/engine/multi";

/**
 * Top-level comparison: basket in, everything the product story needs out.
 *
 * This is the function the UI is built on and the one the API route exposes.
 * It is pure — same basket, same catalogue, same numbers — which is what lets
 * the client recompute on every quantity change without a round trip.
 */

export interface MatrixCell {
  lineId: string;
  storeId: StoreId;
  state: "ok" | MissingReason;
  cost: number;
  packs: number;
  packLabel: string;
  brand: string;
  unitPrice: number;
  surplus: number;
  promoLabel?: string;
  freshnessMins: number;
  detail?: string;
}

export interface CheaperAlternative {
  lineId: string;
  storeId: StoreId;
  from: { canonicalId: string; name: string; glyph: string; cost: number };
  to: { canonicalId: string; name: string; glyph: string; cost: number; packLabel: string };
  saving: number;
  note?: string;
}

export interface BasketPlan {
  items: BasketItem[];
  quotes: StoreQuote[];
  /** Cheapest store that can supply everything, delivery included. */
  bestSingle: StoreQuote | null;
  /** Most expensive complete option — the "shopping badly" baseline. */
  worstSingle: StoreQuote | null;
  /**
   * The cheapest way to buy the whole basket, however many shops that takes.
   * This is the only recommendation the product makes: the shopper is never
   * asked to choose a shop count.
   */
  bestPlan: MultiPlan | null;
  /** Unreachable floor: every line at its cheapest store, no delivery. */
  cherryPick: number;
  /** Per line × per store price matrix. */
  matrix: MatrixCell[];
  savings: {
    /** Best single store vs the dearest complete store. */
    vsWorstSingle: number;
    /** What splitting the basket across shops is worth vs the best single store. */
    splitVsSingle: number;
    /** Best option overall (split if it wins, else single). */
    bestTotal: number;
    /** Best option vs the dearest complete store. */
    bestVsWorst: number;
    /** What delivery costs on the best option. */
    deliveryPaid: number;
    /** Value of promotions applied on the best option. */
    promoValue: number;
    /** Gap between the best option and the unreachable cherry-picked floor. */
    remainingGap: number;
  };
  /** Lines no store in the catalogue can supply. */
  unfulfillable: Array<{ canonicalId: string; name: string; glyph: string }>;
  alternatives: CheaperAlternative[];
  /** Minutes since the oldest price used in this plan. */
  oldestPriceMins: number;
  /** False when the winning plan came from the local search, not exhaustive search. */
  exact: boolean;
  meta: {
    setsEvaluated: number;
    storeCount: number;
  };
}

function buildMatrix(
  items: BasketItem[],
  input: EngineInput,
  index: OfferIndex,
): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const item of items) {
    const product = input.products.get(item.canonicalId);
    for (const store of input.stores) {
      if (!product) {
        cells.push({
          lineId: item.id,
          storeId: store.id,
          state: "not-stocked",
          cost: 0,
          packs: 0,
          packLabel: "—",
          brand: "—",
          unitPrice: 0,
          surplus: 0,
          freshnessMins: 0,
        });
        continue;
      }
      const offers = index.get(item.canonicalId)?.get(store.id);
      if (!offers?.length) {
        cells.push({
          lineId: item.id,
          storeId: store.id,
          state: "not-stocked",
          cost: 0,
          packs: 0,
          packLabel: "—",
          brand: "—",
          unitPrice: 0,
          surplus: 0,
          freshnessMins: 0,
        });
        continue;
      }
      if (!offers.some((o) => o.unit === item.unit || sameFamily(o.unit, item.unit))) {
        const units = [...new Set(offers.map((o) => o.unit))].join("/");
        cells.push({
          lineId: item.id,
          storeId: store.id,
          state: "unit-mismatch",
          cost: 0,
          packs: 0,
          packLabel: units,
          brand: offers[0].brand,
          unitPrice: 0,
          surplus: 0,
          freshnessMins: offers[0].freshnessMins,
          detail: `sold in ${units}`,
        });
        continue;
      }
      const choice = cheapestPack(offers, item.quantity, item.unit);
      if (!choice) {
        const stocked = offers.find((o) => o.inStock);
        cells.push({
          lineId: item.id,
          storeId: store.id,
          state: "out-of-stock",
          cost: 0,
          packs: 0,
          packLabel: stocked?.packLabel ?? "—",
          brand: offers[0].brand,
          unitPrice: 0,
          surplus: 0,
          freshnessMins: offers[0].freshnessMins,
        });
        continue;
      }
      cells.push({
        lineId: item.id,
        storeId: store.id,
        state: "ok",
        cost: choice.cost,
        packs: choice.packs,
        packLabel: `${choice.packs > 1 ? `${choice.packs} × ` : ""}${choice.offer.packLabel}`,
        brand: choice.offer.brand,
        unitPrice: choice.unitPrice,
        surplus: choice.surplus,
        promoLabel: choice.offer.promo?.label,
        freshnessMins: choice.offer.freshnessMins,
      });
    }
  }
  return cells;
}

function sameFamily(a: Unit, b: Unit): boolean {
  const fam = (u: Unit) => (u === "kg" || u === "g" ? "m" : u === "L" || u === "ml" ? "v" : "c");
  return fam(a) === fam(b);
}

/**
 * Cheaper same-category swaps for the lines that dominate the basket.
 *
 * Only lines worth at least 6% of the order are considered: suggesting a
 * cheaper daal on a Rs 12,000 basket is useful, suggesting a cheaper sponge on
 * a Rs 240 line is noise.
 */
interface AlternativeSourceLine {
  lineId: string;
  canonicalId: string;
  name: string;
  glyph: string;
  cost: number;
  listCost: number;
  storeId: StoreId;
  freshnessMins: number;
}

function findAlternatives(
  lines: AlternativeSourceLine[],
  items: BasketItem[],
  input: EngineInput,
  index: OfferIndex,
): CheaperAlternative[] {
  const out: CheaperAlternative[] = [];
  const total = lines.reduce((sum, line) => sum + line.cost, 0) || 1;

  for (const line of lines) {
    if (line.cost / total < 0.06) continue;
    const product = input.products.get(line.canonicalId);
    if (!product?.swapIds?.length) continue;
    const storeId = line.storeId;
    const item = items.find((i) => i.id === line.lineId);
    if (!item) continue;

    for (const swapId of product.swapIds) {
      const swap = input.products.get(swapId);
      if (!swap) continue;
      const offers = index.get(swapId)?.get(storeId);
      if (!offers?.length) continue;
      const choice = cheapestPack(offers, item.quantity, item.unit);
      if (!choice) continue;
      const saving = line.cost - choice.cost;
      if (saving <= 0) continue;
      out.push({
        lineId: line.lineId,
        storeId,
        from: { canonicalId: product.id, name: product.name, glyph: product.glyph, cost: line.cost },
        to: {
          canonicalId: swap.id,
          name: swap.name,
          glyph: swap.glyph,
          cost: choice.cost,
          packLabel: `${choice.packs > 1 ? `${choice.packs} × ` : ""}${choice.offer.packLabel}`,
        },
        saving,
        note: product.swapNote,
      });
      break;
    }
  }

  return out.sort((a, b) => b.saving - a.saving).slice(0, 4);
}

export function compareBasket(
  items: BasketItem[],
  products: Map<string, ProductDetail>,
  stores: Store[],
): BasketPlan {
  const input: EngineInput = { items, products, stores };
  const index = buildOfferIndex(products.values());

  const quotes = buildQuotes(input);
  const eligible = quotes.filter((q) => q.eligible);
  const bestSingle = bestSingleStore(quotes);
  const worstSingle = eligible.length
    ? eligible.reduce((worst, q) => (q.total > worst.total ? q : worst))
    : null;

  const planSearch = findBestPlan(items, input, index, {
    bestSingleTotal: bestSingle?.total ?? Infinity,
  });
  const bestPlan = planSearch.best;

  const cherry = cherryPickFloor(items, input, index);
  const bestTotal = bestPlan?.total ?? (bestSingle?.total ?? 0);
  const deliveryPaid = bestPlan?.delivery ?? (bestSingle?.delivery ?? 0);
  // One flat line list for the winning plan, so promo totals, freshness and
  // swap suggestions all read from a single shape however many shops it uses.
  const usable: AlternativeSourceLine[] = bestPlan
    ? bestPlan.orders.flatMap((order: PlanOrder) =>
        order.lines.map((line) => ({
          lineId: line.lineId,
          canonicalId: line.canonicalId,
          name: line.name,
          glyph: line.glyph,
          cost: line.choice.cost,
          listCost: line.choice.listCost,
          storeId: order.storeId,
          freshnessMins: line.choice.offer.freshnessMins,
        })),
      )
    : (bestSingle?.lines ?? []).map((line) => ({
        lineId: line.lineId,
        canonicalId: line.canonicalId,
        name: line.name,
        glyph: line.glyph,
        cost: line.cost,
        listCost: line.listCost,
        storeId: line.offer.storeId,
        freshnessMins: line.offer.freshnessMins,
      }));

  const promoValue = Math.round(
    usable.reduce((sum, line) => sum + Math.max(0, line.listCost - line.cost), 0),
  );

  const matrix = buildMatrix(items, input, index);

  const unfulfillable = items
    .filter((item) => !stores.some((store) => index.get(item.canonicalId)?.get(store.id)?.some((o) => o.inStock)))
    .map((item) => {
      const product = input.products.get(item.canonicalId);
      return {
        canonicalId: item.canonicalId,
        name: product?.name ?? item.canonicalId,
        glyph: product?.glyph ?? "❓",
      };
    });

  const oldestPriceMins = usable.length
    ? Math.max(...usable.map((line) => line.freshnessMins))
    : 0;

  return {
    items,
    quotes,
    bestSingle,
    worstSingle,
    bestPlan,
    cherryPick: cherry.total,
    matrix,
    savings: {
      vsWorstSingle: bestSingle && worstSingle ? Math.round(worstSingle.total - bestSingle.total) : 0,
      splitVsSingle: bestPlan ? Math.max(0, Math.round((bestSingle?.total ?? 0) - bestPlan.total)) : 0,
      bestTotal,
      bestVsWorst: worstSingle ? Math.round(worstSingle.total - bestTotal) : 0,
      deliveryPaid,
      promoValue,
      remainingGap: Math.max(0, Math.round(bestTotal - cherry.total)),
    },
    unfulfillable,
    alternatives: findAlternatives(usable, items, input, index),
    oldestPriceMins,
    exact: bestPlan?.exact ?? true,
    meta: {
      setsEvaluated: planSearch.setsEvaluated,
      storeCount: stores.length,
    },
  };
}

/** Build the engine's basket model from stored basket rows. */
export function toBasketItems(
  rows: Array<{ id: string; canonicalId: string; quantity: number }>,
  products: Map<string, ProductDetail>,
): BasketItem[] {
  const items: BasketItem[] = [];
  for (const row of rows) {
    const product = products.get(row.canonicalId);
    if (!product) continue;
    items.push({
      id: row.id,
      canonicalId: row.canonicalId,
      quantity: row.quantity,
      unit: product.unit,
    });
  }
  return items;
}

export type { BasketItem, StoreQuote, PackChoice };
export type { MultiPlan, PlanOrder };
