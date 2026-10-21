import type { ProductDetail, Store, StoreId } from "@/lib/types";
import {
  cheapestPack,
  deliveryFor,
  earnsFreeDelivery,
  type DeliveryStatus,
  type PackChoice,
} from "@/lib/engine/pricing";
import { findBestSplit } from "@/lib/engine/optimizer";
import type { BasketItem, EngineInput, OfferIndex } from "@/lib/engine/quotes";

/**
 * Cheapest way to buy the basket, across any number of stores.
 *
 * The pair search in `optimizer.ts` answers "what is the best two-shop split".
 * This answers the question the shopper actually asked: "what do I pay?" One
 * shop, two shops, four shops — the shopper does not pick a shop count, the
 * arithmetic does, and the answer here is the one the UI recommends.
 *
 * Cost of an assignment (every line bought at exactly one shop):
 *
 *   total = Σ_i cost_i(store_i) + Σ_s d_s(subtotal_s)      for shops s actually used
 *
 * with d() the step function from `pricing.ts` and the rule that a shop used
 * below its minimum basket is not a shop you can order from. The step function
 * is the whole difficulty: a line moved to a shop where it costs *more* can
 * still be right, because it drags that order over a free-delivery threshold.
 *
 * Search shape:
 *
 *   1. Seeds — every single shop that can fill the basket, the cherry-picked
 *      assignment (each line at its cheapest shop), the exact best pair from
 *      the exhaustive two-shop search, and for each of those a nudge that
 *      pushes one shop over its free-delivery threshold.
 *   2. Hill climb each seed: move one line, or swap two lines between shops,
 *      always taking the best improvement until nothing improves.
 *   3. Expand the best few — open a shop, close one, move a whole order onto
 *      another shop, or nudge a threshold — and climb every result, up to
 *      `MAX_PLAN_STORES` shops and until a round changes nothing.
 *      Opening a shop only ever pays as a group of moves, so a new shop is
 *      seeded with every line it undercuts, and a shop that exists only to
 *      satisfy a minimum basket gets dropped again by the closing move.
 *
 * Steps 2 and 3 are a local search, so the answer is the best found, not a
 * proof — except when the winner is a single shop or a pair, where the
 * exhaustive search behind the seed is exact. That is what `exact` reports,
 * and the UI says "best option found" when it is false. On this
 * catalogue the search matches a hand-enumerated optimum on every basket
 * small enough to enumerate, and lands within a fraction of a percent on the
 * baskets that are not.
 */

/** Beyond this, a second and third delivery slot stops being a real plan. */
export const MAX_PLAN_STORES = 4;

/** How many near-best assignments to keep expanding at each round. */
const BEAM_WIDTH = 4;

/** A shop below its minimum basket cannot be ordered from; make it unaffordable. */
const MIN_ORDER_PENALTY = 1_000_000;

/** Ceiling on climb rounds so a pathological basket still returns quickly. */
const MAX_CLIMB_ROUNDS = 40;

export interface PlanOrder {
  storeId: StoreId;
  store: Store;
  lines: Array<{
    lineId: string;
    canonicalId: string;
    name: string;
    glyph: string;
    choice: PackChoice;
  }>;
  subtotal: number;
  delivery: number;
  /** False when this shop's delivery charge is not known. */
  deliveryKnown: boolean;
  deliveryStatus: DeliveryStatus;
  total: number;
  freeDelivery: boolean;
  gapToFree: number;
  belowMinOrder: boolean;
}

export interface MultiPlan {
  /** One entry per shop the plan buys from, biggest order first. */
  orders: PlanOrder[];
  subtotal: number;
  /** Delivery charges that are actually known and counted into `total`. */
  delivery: number;
  total: number;
  /** True when every shop in the plan has a known delivery charge. */
  deliveryKnown: boolean;
  /** Shops whose delivery charge is not known, so `total` may rise. */
  deliveryUnknownStores: StoreId[];
  storeCount: number;
  /** PKR cheaper than the best single shop. 0 when a single shop already wins. */
  savingsVsSingle: number;
  /** True when the winner is a single shop or an exhaustively searched pair. */
  exact: boolean;
}

export interface PlanSearchResult {
  best: MultiPlan | null;
  /** How many distinct shop sets were climbed. */
  setsEvaluated: number;
  /** True when every line could be bought somewhere. */
  solvable: boolean;
}

/** Per line: the cheapest pack at each shop position in `input.stores`. */
interface LineOption {
  item: BasketItem;
  product: ProductDetail;
  at: (PackChoice | null)[];
}

interface SearchContext {
  stores: Store[];
  lines: LineOption[];
  /** Store index each line is cheapest at, ignoring delivery. */
  cheapestStore: Int16Array;
}

function buildContext(items: BasketItem[], input: EngineInput, index: OfferIndex): SearchContext | null {
  const lines: LineOption[] = [];
  const cheapestStore = new Int16Array(items.length);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const product = input.products.get(item.canonicalId);
    if (!product) return null;

    const at = input.stores.map((store) => {
      if (item.lockedStore && item.lockedStore !== store.id) return null;
      if (item.excludedStores?.includes(store.id)) return null;
      const offers = index.get(item.canonicalId)?.get(store.id);
      return offers?.length ? cheapestPack(offers, item.quantity, item.unit) : null;
    });

    let best = -1;
    for (let s = 0; s < at.length; s++) {
      if (at[s] && (best < 0 || at[s]!.cost < at[best]!.cost)) best = s;
    }
    if (best < 0) return null; // nothing anywhere can supply this line

    lines.push({ item, product, at });
    cheapestStore[i] = best;
  }

  return { stores: input.stores, lines, cheapestStore };
}

/**
 * What one shop contributes to the total: goods, any delivery charge we know,
 * and a heavy penalty for a shop below its stated minimum basket.
 *
 * An unknown delivery charge adds nothing to the score — it is a floor, not a
 * free delivery — which is why every total built from this is reported as "at
 * least" whenever an unknown is involved.
 */
function storeCost(subtotal: number, store: Store): number {
  if (subtotal <= 0) return 0;
  let cost = subtotal + deliveryFor(store, subtotal).fee;
  if (store.minOrder !== null && subtotal < store.minOrder) {
    cost += MIN_ORDER_PENALTY + (store.minOrder - subtotal);
  }
  return cost;
}

/** Sum of goods + delivery, with a heavy penalty for shops below their minimum. */
function score(subtotals: Float64Array, stores: Store[]): number {
  let total = 0;
  for (let s = 0; s < stores.length; s++) total += storeCost(subtotals[s], stores[s]);
  return total;
}

function subtotalsOf(context: SearchContext, assign: Int16Array): Float64Array {
  const subtotals = new Float64Array(context.stores.length);
  context.lines.forEach((line, i) => {
    const choice = line.at[assign[i]];
    if (choice) subtotals[assign[i]] += choice.cost;
  });
  return subtotals;
}

interface ClimbResult {
  assign: Int16Array;
  total: number;
  subtotals: Float64Array;
}

/**
 * Local search over assignments: move one line, or swap two lines between
 * shops, take the best improvement, repeat.
 *
 * Both moves matter on their own. A single move fixes "one more item for free
 * delivery"; a swap fixes the case where two shops are each one line short of
 * a threshold and only trading lines gets both over it.
 */
function climb(context: SearchContext, seed: Int16Array): ClimbResult | null {
  const { lines, stores } = context;
  const n = lines.length;
  const assign = Int16Array.from(seed);
  const subtotals = subtotalsOf(context, assign);
  const parts = new Float64Array(stores.length);
  let current = 0;
  for (let s = 0; s < stores.length; s++) {
    parts[s] = storeCost(subtotals[s], stores[s]);
    current += parts[s];
  }

  /** Cost of the basket if line `i` moved from shop `from` to shop `to`. */
  const costIfMoved = (from: number, to: number, leaves: number, arrives: number): number => {
    const before = parts[from] + parts[to];
    subtotals[from] -= leaves;
    subtotals[to] += arrives;
    const nextFrom = storeCost(subtotals[from], stores[from]);
    const nextTo = storeCost(subtotals[to], stores[to]);
    const candidate = current - before + nextFrom + nextTo;
    subtotals[from] += leaves;
    subtotals[to] -= arrives;
    return candidate;
  };

  /** Cost of the basket if line `i` and line `j` traded shops. */
  const costIfSwapped = (
    si: number,
    sj: number,
    iLeaves: number,
    iArrives: number,
    jLeaves: number,
    jArrives: number,
  ): number => {
    const before = parts[si] + parts[sj];
    const nextSi = storeCost(subtotals[si] - iLeaves + jArrives, stores[si]);
    const nextSj = storeCost(subtotals[sj] - jLeaves + iArrives, stores[sj]);
    return current - before + nextSi + nextSj;
  };

  for (let round = 0; round < MAX_CLIMB_ROUNDS; round++) {
    let bestMove: { apply: () => void; total: number } | null = null;

    // Move one line to another shop.
    for (let i = 0; i < n; i++) {
      const from = assign[i];
      const cost = lines[i].at[from]?.cost ?? 0;
      for (let s = 0; s < stores.length; s++) {
        const choice = lines[i].at[s];
        if (!choice || s === from) continue;
        const candidate = costIfMoved(from, s, cost, choice.cost);
        if (candidate < current - 1e-9 && (!bestMove || candidate < bestMove.total)) {
          bestMove = { total: candidate, apply: () => { assign[i] = s; } };
        }
      }
    }

    // Swap the shops of two lines.
    for (let i = 0; i < n; i++) {
      const si = assign[i];
      const iHere = lines[i].at[si]!.cost;
      for (let j = i + 1; j < n; j++) {
        const sj = assign[j];
        if (si === sj) continue;
        const ci = lines[i].at[sj];
        const cj = lines[j].at[si];
        if (!ci || !cj) continue;
        const candidate = costIfSwapped(si, sj, iHere, ci.cost, lines[j].at[sj]!.cost, cj.cost);
        if (candidate < current - 1e-9 && (!bestMove || candidate < bestMove.total)) {
          bestMove = {
            total: candidate,
            apply: () => {
              assign[i] = sj;
              assign[j] = si;
            },
          };
        }
      }
    }

    if (!bestMove) break;
    bestMove.apply();
    const fresh = subtotalsOf(context, assign);
    for (let s = 0; s < stores.length; s++) {
      subtotals[s] = fresh[s];
      parts[s] = storeCost(fresh[s], stores[s]);
    }
    current = score(subtotals, stores);
  }

  if (current >= MIN_ORDER_PENALTY) return null;
  return { assign, total: Math.round(current), subtotals };
}

/** Every line at its cheapest shop, delivery ignored. */
function cherrySeed(context: SearchContext): Int16Array {
  const assign = new Int16Array(context.lines.length);
  for (let i = 0; i < context.lines.length; i++) assign[i] = context.cheapestStore[i];
  return assign;
}

/** Everything at one shop, when that shop can supply the whole basket. */
function singleStoreSeed(context: SearchContext, storeIndex: number): Int16Array | null {
  const assign = new Int16Array(context.lines.length).fill(storeIndex);
  for (let i = 0; i < context.lines.length; i++) {
    if (!context.lines[i].at[storeIndex]) return null;
  }
  return assign;
}

/**
 * Open one more shop: every line the new shop undercuts moves to it at once.
 *
 * A new shop almost never pays for itself on a single line — it pays once a
 * whole group of lines has moved and the delivery fee is covered. Seeding the
 * climb with the whole group is what lets the local search see it.
 */
function growSeed(context: SearchContext, assign: Int16Array, storeIndex: number): Int16Array {
  const next = Int16Array.from(assign);
  for (let i = 0; i < context.lines.length; i++) {
    const here = context.lines[i].at[next[i]];
    const there = context.lines[i].at[storeIndex];
    if (there && (!here || there.cost < here.cost)) next[i] = storeIndex;
  }
  return next;
}

/** Close one shop: its lines go to whatever is next cheapest for each of them. */
function shrinkSeed(context: SearchContext, assign: Int16Array, storeIndex: number): Int16Array | null {
  const next = Int16Array.from(assign);
  for (let i = 0; i < context.lines.length; i++) {
    if (next[i] !== storeIndex) continue;
    let best = -1;
    for (let s = 0; s < context.stores.length; s++) {
      if (s === storeIndex) continue;
      const choice = context.lines[i].at[s];
      if (choice && (best < 0 || choice.cost < context.lines[i].at[best]!.cost)) best = s;
    }
    if (best < 0) return null;
    next[i] = best;
  }
  return next;
}

/**
 * Move a whole shop's order onto another shop.
 *
 * "Those two items are only at Chase Up because Chase Up is cheapest for them"
 * is a decision two lines deep, and a one-line-at-a-time climb cannot see it:
 * moving the first line on its own always looks worse. Relocating the lot is
 * the move that finds it.
 */
function relocateSeed(
  context: SearchContext,
  assign: Int16Array,
  from: number,
  to: number,
): Int16Array | null {
  const next = Int16Array.from(assign);
  let moved = false;
  for (let i = 0; i < context.lines.length; i++) {
    if (next[i] !== from) continue;
    if (!context.lines[i].at[to]) return null;
    next[i] = to;
    moved = true;
  }
  return moved ? next : null;
}

/** Would this shop ever be worth opening? Only if it undercuts something. */
function undercutsSomewhere(context: SearchContext, assign: Int16Array, storeIndex: number): boolean {
  for (let i = 0; i < context.lines.length; i++) {
    const here = context.lines[i].at[assign[i]];
    const there = context.lines[i].at[storeIndex];
    if (there && (!here || there.cost < here.cost)) return true;
  }
  return false;
}

function keyOf(assign: Int16Array): string {
  return Array.from(assign).join(",");
}

function usedStores(assign: Int16Array): number[] {
  const used = new Set<number>();
  for (const s of assign) used.add(s);
  return [...used].sort((a, b) => a - b);
}

function materialise(
  context: SearchContext,
  result: ClimbResult,
  bestSingleTotal: number,
): MultiPlan {
  const orders: PlanOrder[] = [];

  for (const storeIndex of usedStores(result.assign)) {
    const store = context.stores[storeIndex];
    const lines: PlanOrder["lines"] = [];
    let subtotal = 0;
    context.lines.forEach((line, i) => {
      if (result.assign[i] !== storeIndex) return;
      const choice = line.at[storeIndex];
      if (!choice) return;
      lines.push({
        lineId: line.item.id,
        canonicalId: line.product.id,
        name: line.product.name,
        glyph: line.product.glyph,
        choice,
      });
      subtotal += choice.cost;
    });
    if (!lines.length) continue;

    subtotal = Math.round(subtotal);
    const { fee, free, gapToFree, known, status } = deliveryFor(store, subtotal);
    orders.push({
      storeId: store.id,
      store,
      lines,
      subtotal,
      delivery: fee,
      deliveryKnown: known,
      deliveryStatus: status,
      total: Math.round(subtotal + fee),
      freeDelivery: free,
      gapToFree,
      belowMinOrder: store.minOrder !== null && subtotal < store.minOrder,
    });
  }

  orders.sort((a, b) => b.subtotal - a.subtotal || a.store.name.localeCompare(b.store.name));

  const subtotal = orders.reduce((sum, order) => sum + order.subtotal, 0);
  const delivery = orders.reduce((sum, order) => sum + order.delivery, 0);
  const storeCount = orders.length;
  const deliveryUnknownStores = orders
    .filter((order) => !order.deliveryKnown)
    .map((order) => order.storeId);

  return {
    orders,
    subtotal,
    delivery,
    total: Math.round(subtotal + delivery),
    deliveryKnown: deliveryUnknownStores.length === 0,
    deliveryUnknownStores,
    storeCount,
    savingsVsSingle: Math.max(0, Math.round(bestSingleTotal - (subtotal + delivery))),
    exact: storeCount <= 2,
  };
}

/**
 * Nudge a shop over its free-delivery threshold.
 *
 * The most common non-obvious saving in this catalogue: a shop that is not
 * cheapest for much, but whose delivery fee disappears above some subtotal.
 * A line-by-line climb cannot find it because no single line gets it over the
 * line, so the seed moves the cheapest-to-move lines in one go until the
 * threshold is crossed, and lets the climb tidy up afterwards.
 */
function thresholdSeed(
  context: SearchContext,
  assign: Int16Array,
  storeIndex: number,
): Int16Array | null {
  const store = context.stores[storeIndex];
  if (store.freeDeliveryOver === null) return null;

  const next = Int16Array.from(assign);
  let subtotal = 0;
  for (let i = 0; i < context.lines.length; i++) {
    if (next[i] === storeIndex) subtotal += context.lines[i].at[storeIndex]!.cost;
  }
  if (earnsFreeDelivery(store, subtotal)) return null;

  const movable: Array<{ line: number; delta: number }> = [];
  for (let i = 0; i < context.lines.length; i++) {
    if (next[i] === storeIndex) continue;
    const there = context.lines[i].at[storeIndex];
    const here = context.lines[i].at[next[i]];
    if (!there || !here) continue;
    movable.push({ line: i, delta: there.cost - here.cost });
  }
  movable.sort((a, b) => a.delta - b.delta);

  let moved = false;
  for (const entry of movable) {
    if (earnsFreeDelivery(store, subtotal)) break;
    const choice = context.lines[entry.line].at[storeIndex];
    if (!choice) continue;
    next[entry.line] = storeIndex;
    subtotal += choice.cost;
    moved = true;
  }
  return moved ? next : null;
}

/**
 * Best two-shop split as an assignment, so the exhaustive pair search in
 * `optimizer.ts` seeds this one instead of being reinvented worse.
 */
function pairSeed(context: SearchContext, input: EngineInput, index: OfferIndex): Int16Array | null {
  const split = findBestSplit(input.items, input, index).best;
  if (!split) return null;

  const byLine = new Map<string, number>();
  for (const line of split.primary.lines) byLine.set(line.lineId, context.stores.findIndex((s) => s.id === split.primaryStoreId));
  for (const line of split.secondary.lines) byLine.set(line.lineId, context.stores.findIndex((s) => s.id === split.secondaryStoreId));

  const assign = new Int16Array(context.lines.length).fill(-1);
  context.lines.forEach((line, i) => {
    const storeIndex = byLine.get(line.item.id);
    if (storeIndex === undefined || storeIndex < 0) return;
    if (line.at[storeIndex]) assign[i] = storeIndex;
  });
  return assign.some((s) => s < 0) ? null : assign;
}


export function findBestPlan(
  items: BasketItem[],
  input: EngineInput,
  index: OfferIndex,
  options: { bestSingleTotal?: number } = {},
): PlanSearchResult {
  const context = buildContext(items, input, index);
  if (!context) return { best: null, setsEvaluated: 0, solvable: false };
  if (!items.length) return { best: null, setsEvaluated: 0, solvable: true };

  const bestSingleTotal = options.bestSingleTotal ?? Infinity;
  const seeds: Int16Array[] = [];

  for (let s = 0; s < context.stores.length; s++) {
    const seed = singleStoreSeed(context, s);
    if (seed) seeds.push(seed);
  }
  seeds.push(cherrySeed(context));
  const pair = pairSeed(context, input, index);
  if (pair) seeds.push(pair);

  let setsEvaluated = 0;
  const beam = new Map<string, ClimbResult>();

  const push = (result: ClimbResult | null) => {
    if (!result) return;
    const key = keyOf(result.assign);
    const existing = beam.get(key);
    if (!existing || result.total < existing.total) beam.set(key, result);
  };

  for (const seed of seeds) {
    setsEvaluated++;
    push(climb(context, seed));
  }

  // A nudge towards every shop, from every seed: the threshold that only pays
  // once several lines have moved is invisible to a single greedy step.
  for (const seed of seeds) {
    for (let s = 0; s < context.stores.length; s++) {
      const nudge = thresholdSeed(context, seed, s);
      if (!nudge) continue;
      setsEvaluated++;
      push(climb(context, nudge));
    }
  }

  const ranked = () =>
    [...beam.values()].sort(
      (a, b) =>
        a.total - b.total || usedStores(a.assign).length - usedStores(b.assign).length,
    );

  let frontier = ranked().slice(0, BEAM_WIDTH);
  let bestTotal = frontier[0]?.total ?? Infinity;

  // Expand the frontier: open a shop, close one, move one whole order onto
  // another shop, or nudge one over its threshold — then climb every result.
  // Repeat until a round changes nothing.
  for (let round = 0; round < MAX_PLAN_STORES + 1; round++) {
    const next: ClimbResult[] = [];

    for (const current of frontier) {
      const used = usedStores(current.assign);

      for (let s = 0; s < context.stores.length; s++) {
        if (used.includes(s) || used.length >= MAX_PLAN_STORES) continue;
        if (!undercutsSomewhere(context, current.assign, s)) continue;
        setsEvaluated++;
        const grown = climb(context, growSeed(context, current.assign, s));
        if (grown) next.push(grown);
      }

      for (const from of used) {
        const closed = shrinkSeed(context, current.assign, from);
        if (closed) {
          setsEvaluated++;
          push(climb(context, closed));
        }

        for (let to = 0; to < context.stores.length; to++) {
          if (used.includes(to)) continue;
          const seed = relocateSeed(context, current.assign, from, to);
          if (!seed) continue;
          setsEvaluated++;
          const moved = climb(context, seed);
          if (moved) next.push(moved);
        }
      }

      for (let s = 0; s < context.stores.length; s++) {
        const nudge = thresholdSeed(context, current.assign, s);
        if (!nudge) continue;
        setsEvaluated++;
        const nudged = climb(context, nudge);
        if (nudged) next.push(nudged);
      }
    }

    for (const candidate of next) push(candidate);

    frontier = ranked().slice(0, BEAM_WIDTH);
    const top = frontier[0]?.total ?? Infinity;
    if (!(top < bestTotal - 1e-9)) break;
    bestTotal = top;
  }

  const best = frontier[0];
  if (!best) return { best: null, setsEvaluated, solvable: true };

  return {
    best: materialise(context, best, bestSingleTotal),
    setsEvaluated,
    solvable: true,
  };
}
