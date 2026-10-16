import type { Offer, Store, Unit } from "@/lib/types";

/**
 * Line-level pricing arithmetic.
 *
 * Two rules drive everything here, and both exist because Pakistani grocery
 * packaging is inconsistent:
 *
 *   1. Never compare shelf prices across different pack sizes. Everything is
 *      reduced to a common base quantity before anything is called "cheaper".
 *   2. A shopper asking for 2 kg of potatoes at a shop that only sells 2.5 kg
 *      bags pays for 2.5 kg. The engine charges what the shop actually charges
 *      and reports the surplus, rather than pretending fractional packs exist.
 */

/* ------------------------------------------------------------------ *
 * Quantity base
 * ------------------------------------------------------------------ */

type Family = "mass" | "volume" | "count";

const FAMILY: Record<Unit, Family> = {
  g: "mass",
  kg: "mass",
  ml: "volume",
  L: "volume",
  piece: "count",
  dozen: "count",
  sheet: "count",
};

/** Grams, millilitres, or individual pieces — one number per family. */
export function toBase(quantity: number, unit: Unit): number {
  switch (unit) {
    case "kg":
      return quantity * 1000;
    case "L":
      return quantity * 1000;
    case "dozen":
      return quantity * 12;
    default:
      return quantity;
  }
}

export function familyOf(unit: Unit): Family {
  return FAMILY[unit];
}

/** Inverse of `toBase`: turn a base quantity back into the caller's unit. */
export function fromBase(base: number, unit: Unit): number {
  switch (unit) {
    case "kg":
      return base / 1000;
    case "L":
      return base / 1000;
    case "dozen":
      return base / 12;
    default:
      return base;
  }
}

/** Can an offer of `offerUnit` satisfy a request in `requestUnit`? */
export function comparable(offerUnit: Unit, requestUnit: Unit): boolean {
  return FAMILY[offerUnit] === FAMILY[requestUnit];
}

/* ------------------------------------------------------------------ *
 * Promotions
 * ------------------------------------------------------------------ */

/**
 * Free packs earned by a bundle promo at a given pack count.
 *
 * "Buy 2 get 1 free" is charged as groups of three: 4 packs cost 3, 6 cost 4.
 * Percent and flat-off promos are already folded into `offer.price` by the
 * source, so applying them again here would double-count the discount.
 */
export function freePacks(offer: Offer, packs: number): number {
  const promo = offer.promo;
  if (!promo || promo.kind !== "bundle" || packs <= 0) return 0;
  const buy = Math.max(1, Math.round(promo.buy ?? 2));
  const free = Math.max(1, Math.round(promo.value ?? 1));
  const group = buy + free;
  return Math.floor(packs / group) * free;
}

/** What the shop actually charges for `packs` of this offer, in PKR. */
export function lineCost(offer: Offer, packs: number): number {
  if (packs <= 0) return 0;
  const paid = packs - freePacks(offer, packs);
  return Math.max(0, Math.round(paid * offer.price));
}

/** Shelf price for the same packs with promotions ignored, for strike-throughs. */
export function listLineCost(offer: Offer, packs: number): number {
  if (packs <= 0) return 0;
  const base = offer.listPrice ?? offer.price;
  const paid = packs - freePacks(offer, packs);
  return Math.max(0, Math.round(paid * base));
}

/** Convenience alias used by catalogue summaries. */
export function effectivePackPrice(offer: Offer, packs = 1): number {
  return lineCost(offer, packs);
}

/* ------------------------------------------------------------------ *
 * Pack selection
 * ------------------------------------------------------------------ */

export interface PackChoice {
  offer: Offer;
  /** Whole packs bought. */
  packs: number;
  /** Quantity actually purchased, in the request's unit. */
  paidQuantity: number;
  /** Quantity actually purchased, in the offer's own unit. */
  paidInOfferUnit: number;
  /** PKR actually charged. */
  cost: number;
  /** PKR the shelf price would have been, before promos. */
  listCost: number;
  /** PKR per base unit of what was purchased. */
  unitPrice: number;
  /** Surplus bought to satisfy whole packs, in the request's unit. 0 = exact. */
  surplus: number;
}

/**
 * Cheapest way to obtain `requested` of `unit` from one store's offers.
 *
 * Candidates are ranked by total cost, then by surplus (buying 5 kg when you
 * needed 2 kg is not "cheap" even when the bag is cheap), then by price
 * freshness. That ordering is what stops the engine recommending a 10 kg sack
 * of onions for a 500 g request.
 */
export function cheapestPack(
  offers: Offer[],
  requested: number,
  unit: Unit,
): PackChoice | null {
  const needBase = toBase(requested, unit);
  let best: PackChoice | null = null;

  for (const offer of offers) {
    if (!offer.inStock) continue;
    if (!comparable(offer.unit, unit)) continue;
    const offerBase = toBase(offer.quantity, offer.unit);
    if (offerBase <= 0) continue;

    const packs = Math.max(1, Math.ceil(needBase / offerBase - 1e-9));
    const cost = lineCost(offer, packs);
    const paidBase = packs * offerBase;
    const choice: PackChoice = {
      offer,
      packs,
      paidInOfferUnit: packs * offer.quantity,
      paidQuantity: fromBase(paidBase, unit),
      cost,
      listCost: listLineCost(offer, packs),
      unitPrice: cost / fromBase(paidBase, unit),
      surplus: fromBase(Math.max(0, paidBase - needBase), unit),
    };

    if (
      !best ||
      choice.cost < best.cost - 1e-9 ||
      (Math.abs(choice.cost - best.cost) < 1e-9 &&
        (choice.surplus < best.surplus - 1e-9 ||
          (Math.abs(choice.surplus - best.surplus) < 1e-9 &&
            offer.freshnessMins < best.offer.freshnessMins)))
    ) {
      best = choice;
    }
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * Delivery
 * ------------------------------------------------------------------ */

export interface DeliveryResult {
  fee: number;
  /** True when the order qualified for free delivery. */
  free: boolean;
  /** PKR still needed to reach the free-delivery threshold, 0 when done. */
  gapToFree: number;
}

export function deliveryFor(store: Store, subtotal: number): DeliveryResult {
  if (subtotal <= 0) return { fee: 0, free: false, gapToFree: 0 };
  if (store.freeDeliveryOver > 0 && subtotal >= store.freeDeliveryOver) {
    return { fee: 0, free: true, gapToFree: 0 };
  }
  return {
    fee: store.deliveryFee,
    free: false,
    gapToFree: store.freeDeliveryOver > 0 ? Math.max(0, store.freeDeliveryOver - subtotal) : 0,
  };
}

/** Does the order clear the store's minimum basket? */
export function meetsMinimum(store: Store, subtotal: number): boolean {
  if (subtotal <= 0) return false;
  return subtotal >= store.minOrder;
}
