import type { Store, StoreId } from "@/lib/types";

/**
 * The nine Karachi supermarkets Kartly compares.
 *
 * Delivery fees, free-delivery thresholds and minimum orders are illustrative
 * sample figures, not published rates. They are deliberately spread apart
 * because the fee structure is what makes a two-store split worth computing:
 * a cheap basket at a store with a Rs 300 delivery charge can still lose to a
 * pricier basket that ships free.
 */
export const STORES: Store[] = [
  {
    id: "naheed",
    name: "Naheed",
    initials: "Nh",
    deliveryFee: 249,
    freeDeliveryOver: 6000,
    minOrder: 500,
    eta: "Same day, 2–4 hr slots",
    accent: "#0f766e",
    blurb: "Karachi institution. Strong fresh counters and imported shelves.",
    coverage: "City-wide",
  },
  {
    id: "imtiaz",
    name: "Imtiaz",
    initials: "Im",
    deliveryFee: 99,
    freeDeliveryOver: 4500,
    minOrder: 400,
    eta: "Next day",
    accent: "#e2571d",
    blurb: "Aggressive on staples and oil. Cheap, fast delivery.",
    coverage: "City-wide",
  },
  {
    id: "carrefour",
    name: "Carrefour",
    initials: "Cf",
    deliveryFee: 199,
    freeDeliveryOver: 5000,
    minOrder: 600,
    eta: "Same day",
    accent: "#1f5fbf",
    blurb: "Best breadth on cleaning, personal care and home.",
    coverage: "City-wide",
  },
  {
    id: "chase-up",
    name: "Chase Up",
    initials: "Cu",
    deliveryFee: 179,
    freeDeliveryOver: 3500,
    minOrder: 350,
    eta: "Same day, evening",
    accent: "#7c3aed",
    blurb: "Neighbourhood chase. Snacks, drinks and small baskets.",
    coverage: "Central + DHA",
  },
  {
    id: "springs",
    name: "Springs",
    initials: "Sp",
    deliveryFee: 149,
    freeDeliveryOver: 9000,
    minOrder: 500,
    eta: "Same day, 90 min",
    accent: "#166045",
    blurb: "Premium fresh, tight slots, high free-delivery bar.",
    coverage: "DHA + Clifton",
  },
  {
    id: "hydri",
    name: "Hydri",
    initials: "Hy",
    deliveryFee: 299,
    freeDeliveryOver: 8000,
    minOrder: 800,
    eta: "Next morning",
    accent: "#b4351f",
    blurb: "Fish and meat counter prices nobody else matches.",
    coverage: "Saddar + South",
  },
  {
    id: "bin-hashim",
    name: "Bin Hashim",
    initials: "Bh",
    deliveryFee: 149,
    freeDeliveryOver: 4000,
    minOrder: 400,
    eta: "Next day",
    accent: "#a16207",
    blurb: "Bulk pantry packs and low delivery minimums.",
    coverage: "City-wide",
  },
  {
    id: "chase-value",
    name: "Chase Value",
    initials: "Cv",
    deliveryFee: 119,
    freeDeliveryOver: 3000,
    minOrder: 300,
    eta: "Next day",
    accent: "#0369a1",
    blurb: "Value banner. Cheapest shelves, thin fresh section.",
    coverage: "Central Karachi",
  },
  {
    id: "spar",
    name: "SPAR",
    initials: "Sk",
    deliveryFee: 259,
    freeDeliveryOver: 7000,
    minOrder: 700,
    eta: "Same day",
    accent: "#c0392b",
    blurb: "Imported and specialty shelves. Priciest, widest range.",
    coverage: "DHA + Clifton + Bahria",
  },
];

export const STORE_MAP: Record<StoreId, Store> = STORES.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<StoreId, Store>,
);

export function storeName(id: StoreId): string {
  return STORE_MAP[id]?.name ?? id;
}
