import type { ProductDetail, Store, StoreId } from "@/lib/types";
import {
  cheapestPack,
  deliveryFor,
  earnsFreeDelivery,
  type DeliveryStatus,
  type PackChoice,
} from "@/lib/engine/pricing";
import type { BasketItem, EngineInput, OfferIndex } from "@/lib/engine/quotes";

/**
 * Two-store split search.
 *
 * Why this is a search and not a sort: the cheapest basket is not the basket of
 * cheapest lines. Moving a line to a store where it costs *more* can still be
 * correct when it drags that order over a free-delivery threshold, and moving
 * one line can push the other order below a minimum basket. Those interactions
 * are exactly what a greedy per-line pick gets wrong, so the engine solves the
 * assignment properly and reports the answer it found.
 *
 * Cost model for a pair (A, B):
 *
 *   total = Σ_{i∈A} cost_A(i) + Σ_{i∈B} cost_B(i) + d_A(subtotal_A) + d_B(subtotal_B)
 *
 * where d() is a step function (fee, or zero above the free threshold). Lines
 * only one of the two stores stock are pinned to the store that has them.
 *
 * Above `MAX_EXACT_LINES` movable lines the exhaustive sweep is replaced by a
 * seeded hill climb, and the result is flagged `exact: false` so the UI can say
 * "best option found" instead of "the best option".
 */

export const MAX_EXACT_LINES = 20;

export interface SplitLineOption {
  item: BasketItem;
  product: ProductDetail;
  atA: PackChoice | null;
  atB: PackChoice | null;
}

export interface SplitPlan {
  primaryStoreId: StoreId;
  secondaryStoreId: StoreId;
  primary: SplitAssignment;
  secondary: SplitAssignment;
  subtotal: number;
  delivery: number;
  /** False when either shop's delivery charge is not known. */
  deliveryKnown: boolean;
  total: number;
  /** PKR saved against the best single-store total. May be ≤ 0. */
  savingsVsSingle: number;
  /** True when the answer came from exhaustive search. */
  exact: boolean;
  /** Lines that had to be pinned because only one of the pair stocks them. */
  pinned: number;
}

export interface SplitAssignment {
  storeId: StoreId;
  lines: Array<{
    lineId: string;
    canonicalId: string;
    name: string;
    glyph: string;
    choice: PackChoice;
  }>;
  subtotal: number;
  delivery: number;
  deliveryKnown: boolean;
  deliveryStatus: DeliveryStatus;
  total: number;
  freeDelivery: boolean;
  gapToFree: number;
  belowMinOrder: boolean;
}

interface PairContext {
  storeA: Store;
  storeB: Store;
  lines: SplitLineOption[];
  /** Indices of lines that can go to either store. */
  movable: number[];
  fixedCostA: number;
  fixedCostB: number;
  pinned: number;
  valid: boolean;
}

function buildPairContext(
  storeA: Store,
  storeB: Store,
  items: BasketItem[],
  input: EngineInput,
  index: OfferIndex,
): PairContext {
  const lines: SplitLineOption[] = [];
  const movable: number[] = [];
  let fixedCostA = 0;
  let fixedCostB = 0;
  let valid = true;
  let pinned = 0;

  for (const item of items) {
    const product = input.products.get(item.canonicalId);
    if (!product) {
      valid = false;
      break;
    }
    const offersA = index.get(item.canonicalId)?.get(storeA.id);
    const offersB = index.get(item.canonicalId)?.get(storeB.id);
    const atA =
      offersA && (!item.lockedStore || item.lockedStore === storeA.id) && !item.excludedStores?.includes(storeA.id)
        ? cheapestPack(offersA, item.quantity, item.unit)
        : null;
    const atB =
      offersB && (!item.lockedStore || item.lockedStore === storeB.id) && !item.excludedStores?.includes(storeB.id)
        ? cheapestPack(offersB, item.quantity, item.unit)
        : null;

    if (!atA && !atB) {
      valid = false;
      break;
    }
    const option: SplitLineOption = { item, product, atA, atB };
    const idx = lines.length;
    lines.push(option);
    if (atA && atB) movable.push(idx);
    else {
      pinned++;
      if (atA) fixedCostA += atA.cost;
      else fixedCostB += atB!.cost;
    }
  }

  return { storeA, storeB, lines, movable, fixedCostA, fixedCostB, pinned, valid };
}

function totalOf(
  context: PairContext,
  costA: number[],
  costB: number[],
  inB: Uint8Array,
): { total: number; subA: number; subB: number } {
  let subA = context.fixedCostA;
  let subB = context.fixedCostB;
  for (let i = 0; i < context.movable.length; i++) {
    if (inB[i]) subB += costB[i];
    else subA += costA[i];
  }
  const dA = deliveryFor(context.storeA, subA).fee;
  const dB = deliveryFor(context.storeB, subB).fee;
  return { total: subA + subB + dA + dB, subA, subB };
}

function acceptable(subA: number, subB: number, context: PairContext): boolean {
  // Both orders must exist and clear their store's stated minimum basket; a
  // store with no published minimum imposes none.
  if (subA <= 0 || subB <= 0) return false;
  if (context.storeA.minOrder !== null && subA < context.storeA.minOrder) return false;
  if (context.storeB.minOrder !== null && subB < context.storeB.minOrder) return false;
  return true;
}

/**
 * Exhaustive sweep over which movable lines go to store B.
 *
 * Masks are walked in Gray-code order so each step flips exactly one line and
 * the two subtotals update in O(1). That turns 2^n arithmetic into roughly n
 * additions per candidate and keeps a 20-line basket interactive.
 */
function exhaustive(context: PairContext): { inB: Uint8Array; total: number; subA: number; subB: number } | null {
  const m = context.movable.length;
  const costA = context.movable.map((i) => context.lines[i].atA!.cost);
  const costB = context.movable.map((i) => context.lines[i].atB!.cost);

  let subA = context.fixedCostA;
  let subB = context.fixedCostB;
  for (const i of context.movable) subA += context.lines[i].atA!.cost;

  const inB = new Uint8Array(m);
  let best: { inB: Uint8Array; total: number; subA: number; subB: number } | null = null;
  let previousGray = 0;

  const combos = 1 << m;
  for (let step = 0; step < combos; step++) {
    const gray = step ^ (step >> 1);
    if (step > 0) {
      const diff = gray ^ previousGray;
      const bit = 31 - Math.clz32(diff);
      const nowInB = (gray & diff) !== 0;
      inB[bit] = nowInB ? 1 : 0;
      subA += nowInB ? -costA[bit] : costA[bit];
      subB += nowInB ? costB[bit] : -costB[bit];
      previousGray = gray;
    }

    if (!acceptable(subA, subB, context)) continue;
    const dA = deliveryFor(context.storeA, subA).fee;
    const dB = deliveryFor(context.storeB, subB).fee;
    const total = subA + subB + dA + dB;
    if (!best || total < best.total) {
      best = { inB: Uint8Array.from(inB), total, subA, subB };
    }
  }
  return best;
}

/**
 * Seeded hill climb for baskets too large to enumerate.
 *
 * Seeds: everything at A, everything at B, the naive per-line cheapest split,
 * and the naive split with each store nudged toward its free-delivery threshold
 * by the cheapest available moves. Then single moves and 1-for-1 swaps until
 * nothing improves.
 */
function hillClimb(
  context: PairContext,
): { inB: Uint8Array; total: number; subA: number; subB: number } | null {
  const m = context.movable.length;
  if (!m) return null;
  const costA = context.movable.map((i) => context.lines[i].atA!.cost);
  const costB = context.movable.map((i) => context.lines[i].atB!.cost);

  const seeds: Uint8Array[] = [];
  const allA = new Uint8Array(m);
  const allB = new Uint8Array(m).fill(1);
  const naive = new Uint8Array(m);
  for (let i = 0; i < m; i++) naive[i] = costB[i] < costA[i] ? 1 : 0;
  seeds.push(allA, allB, naive);

  // Nudge: from the naive split, move the cheapest-per-pai lines to B until B
  // clears its free threshold — the classic "one more item for free delivery".
  for (const target of [context.storeB.freeDeliveryOver, context.storeA.freeDeliveryOver]) {
    if (target === null) continue;
    const seed = Uint8Array.from(naive);
    const order = [...Array(m).keys()].sort((x, y) => costB[x] - costA[x] - (costB[y] - costA[y]));
    for (const idx of order) {
      const subB = context.fixedCostB + Array.from(seed).reduce((sum, flag, i) => sum + (flag ? costB[i] : 0), 0);
      if (earnsFreeDelivery(context.storeB, subB)) break;
      seed[idx] = 1;
    }
    seeds.push(seed);
  }

  let best: { inB: Uint8Array; total: number; subA: number; subB: number } | null = null;

  for (const seed of seeds) {
    const inB = Uint8Array.from(seed);
    let current = totalOf(context, costA, costB, inB);
    if (!acceptable(current.subA, current.subB, context)) continue;

    for (let round = 0; round < 60; round++) {
      let improved = false;
      let bestMove: { apply: () => void; total: number } | null = null;

      for (let i = 0; i < m; i++) {
        const flip = () => {
          inB[i] = inB[i] ? 0 : 1;
        };
        const before = inB[i];
        flip();
        const candidate = totalOf(context, costA, costB, inB);
        const ok = acceptable(candidate.subA, candidate.subB, context) && candidate.total < current.total - 1e-9;
        inB[i] = before;
        if (ok && (!bestMove || candidate.total < bestMove.total)) {
          bestMove = { apply: flip, total: candidate.total };
        }
      }

      // 1-for-1 swaps: needed when a move only pays off in pairs.
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          if (i === j || inB[i] === inB[j]) continue;
          const bi = inB[i];
          const bj = inB[j];
          inB[i] = bj;
          inB[j] = bi;
          const candidate = totalOf(context, costA, costB, inB);
          const ok = acceptable(candidate.subA, candidate.subB, context) && candidate.total < current.total - 1e-9;
          inB[i] = bi;
          inB[j] = bj;
          if (ok && (!bestMove || candidate.total < bestMove.total)) {
            bestMove = {
              apply: () => {
                inB[i] = bj;
                inB[j] = bi;
              },
              total: candidate.total,
            };
          }
        }
      }

      if (!bestMove) break;
      bestMove.apply();
      current = totalOf(context, costA, costB, inB);
      improved = true;
      if (!improved) break;
    }

    const final = totalOf(context, costA, costB, inB);
    if (acceptable(final.subA, final.subB, context) && (!best || final.total < best.total)) {
      best = { inB: Uint8Array.from(inB), ...final };
    }
  }

  return best;
}

function materialise(
  context: PairContext,
  solution: { inB: Uint8Array; total: number; subA: number; subB: number },
): SplitPlan {
  // A line only one of the pair stocks is pinned there; the rest follow the
  // solution mask. Getting this wrong silently drops pinned lines, which is
  // the one failure mode a split search must never have.
  const movableSlot = new Map<number, number>();
  context.movable.forEach((lineIndex, slot) => movableSlot.set(lineIndex, slot));
  const goesToB = context.lines.map((line, index) => {
    const slot = movableSlot.get(index);
    if (slot !== undefined) return solution.inB[slot] === 1;
    return !line.atA;
  });

  const build = (store: Store, side: "A" | "B"): SplitAssignment => {
    const lines: SplitAssignment["lines"] = [];
    let subtotal = 0;
    context.lines.forEach((line, index) => {
      if ((side === "B") !== goesToB[index]) return;
      const choice = side === "B" ? line.atB : line.atA;
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
    subtotal = Math.round(subtotal);
    const { fee, free, gapToFree, known, status } = deliveryFor(store, subtotal);
    return {
      storeId: store.id,
      lines,
      subtotal,
      delivery: fee,
      deliveryKnown: known,
      deliveryStatus: status,
      total: Math.round(subtotal + fee),
      freeDelivery: free,
      gapToFree,
      belowMinOrder: store.minOrder !== null && subtotal > 0 && subtotal < store.minOrder,
    };
  };

  const assignmentA = build(context.storeA, "A");
  const assignmentB = build(context.storeB, "B");

  // The bigger order reads as the primary shop; ties go to the cheaper one.
  const aFirst =
    assignmentA.subtotal > assignmentB.subtotal ||
    (assignmentA.subtotal === assignmentB.subtotal && assignmentA.total <= assignmentB.total);
  const [primary, secondary] = aFirst ? [assignmentA, assignmentB] : [assignmentB, assignmentA];

  const subtotal = primary.subtotal + secondary.subtotal;
  const delivery = primary.delivery + secondary.delivery;

  return {
    primaryStoreId: primary.storeId,
    secondaryStoreId: secondary.storeId,
    primary,
    secondary,
    subtotal,
    delivery,
    deliveryKnown: primary.deliveryKnown && secondary.deliveryKnown,
    total: Math.round(subtotal + delivery),
    savingsVsSingle: 0,
    exact: context.movable.length <= MAX_EXACT_LINES,
    pinned: context.pinned,
  };
}

/** Lower bound used to discard hopeless pairs before searching them. */
function pairLowerBound(context: PairContext): number {
  let sum = context.fixedCostA + context.fixedCostB;
  for (const i of context.movable) {
    const line = context.lines[i];
    sum += Math.min(line.atA!.cost, line.atB!.cost);
  }
  return sum;
}

export interface SplitSearchResult {
  best: SplitPlan | null;
  /** Every pair's best total, for the "compare splits" view. */
  alternatives: Array<{ primary: StoreId; secondary: StoreId; total: number; exact: boolean }>;
  pairsEvaluated: number;
  pairsSkipped: number;
}

export function findBestSplit(
  items: BasketItem[],
  input: EngineInput,
  index: OfferIndex,
  options: { prune?: boolean } = {},
): SplitSearchResult {
  const prune = options.prune !== false;
  const empty: SplitSearchResult = { best: null, alternatives: [], pairsEvaluated: 0, pairsSkipped: 0 };
  if (items.length < 2) return empty;

  let best: SplitPlan | null = null;
  const alternatives: SplitSearchResult["alternatives"] = [];
  let pairsEvaluated = 0;
  let pairsSkipped = 0;

  // Build every feasible pair first, then search them cheapest-floor-first.
  // Ordering by lower bound makes the pruning bite early, which is what keeps
  // 36 pair searches down to a handful of real searches.
  const contexts: Array<{ context: PairContext; lowerBound: number }> = [];
  for (let i = 0; i < input.stores.length; i++) {
    for (let j = i + 1; j < input.stores.length; j++) {
      const context = buildPairContext(input.stores[i], input.stores[j], items, input, index);
      if (!context.valid) {
        pairsSkipped++;
        continue;
      }
      contexts.push({ context, lowerBound: pairLowerBound(context) });
    }
  }
  contexts.sort((a, b) => a.lowerBound - b.lowerBound);

  for (const { context, lowerBound } of contexts) {
    // A pair whose optimistic floor already loses to the incumbent cannot
    // win once delivery is added, so skip the search entirely.
    if (prune && best && lowerBound >= best.total) {
      pairsSkipped++;
      continue;
    }
    pairsEvaluated++;

    const solution =
      context.movable.length <= MAX_EXACT_LINES
        ? exhaustive(context)
        : hillClimb(context);
    if (!solution) {
      pairsSkipped++;
      continue;
    }

    const plan = materialise(context, solution);
    alternatives.push({
      primary: plan.primaryStoreId,
      secondary: plan.secondaryStoreId,
      total: plan.total,
      exact: plan.exact,
    });
    if (!best || plan.total < best.total) best = plan;
  }

  alternatives.sort((a, b) => a.total - b.total);
  return { best, alternatives: alternatives.slice(0, 6), pairsEvaluated, pairsSkipped };
}

/**
 * Sum of every line at its cheapest store, ignoring delivery and pack rounding
 * side effects. Not achievable in practice — it is the honest floor the UI
 * shows so "you save Rs X" never quietly becomes "you save everything".
 */
export function cherryPickFloor(
  items: BasketItem[],
  input: EngineInput,
  index: OfferIndex,
): { total: number; perLine: Array<{ lineId: string; storeId: StoreId | null; cost: number }> } {
  let total = 0;
  const perLine: Array<{ lineId: string; storeId: StoreId | null; cost: number }> = [];

  for (const item of items) {
    let bestCost = Infinity;
    let bestStore: StoreId | null = null;
    for (const store of input.stores) {
      const offers = index.get(item.canonicalId)?.get(store.id);
      if (!offers) continue;
      const choice = cheapestPack(offers, item.quantity, item.unit);
      if (choice && choice.cost < bestCost) {
        bestCost = choice.cost;
        bestStore = store.id;
      }
    }
    if (bestStore) {
      total += bestCost;
      perLine.push({ lineId: item.id, storeId: bestStore, cost: bestCost });
    } else {
      perLine.push({ lineId: item.id, storeId: null, cost: 0 });
    }
  }

  return { total: Math.round(total), perLine };
}
