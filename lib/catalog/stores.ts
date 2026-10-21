import type { Store, StoreId } from "@/lib/types";

/**
 * The six Karachi supermarkets Kartly compares.
 *
 * Every figure here is a supplied fact, not an estimate:
 *
 *   - `deliveryFee` is the store's published flat charge. `null` means the
 *     charge is not known, and the engine never prices an unknown fee as free.
 *   - `freeDeliveryOver` is the subtotal that has to be *exceeded* for delivery
 *     to be free. Hydri's rule is "free above Rs 2,000", so exactly Rs 2,000
 *     does not qualify.
 *   - `minOrder` is null everywhere: no minimum order has been supplied for any
 *     of these stores, so none is assumed.
 */
export const STORES: Store[] = [
  {
    id: "hydri",
    name: "Hydri",
    initials: "Hy",
    deliveryFee: null,
    freeDeliveryOver: 2000,
    minOrder: null,
    accent: "#b4351f",
  },
  {
    id: "carrefour",
    name: "Carrefour",
    initials: "Cf",
    deliveryFee: null,
    freeDeliveryOver: null,
    minOrder: null,
    accent: "#1f5fbf",
  },
  {
    id: "naheed",
    name: "Naheed",
    initials: "Nh",
    deliveryFee: null,
    freeDeliveryOver: null,
    minOrder: null,
    accent: "#0f766e",
  },
  {
    id: "springs",
    name: "Springs",
    initials: "Sp",
    deliveryFee: null,
    freeDeliveryOver: null,
    minOrder: null,
    accent: "#166045",
  },
  {
    id: "bin-hashim",
    name: "Bin Hashim",
    initials: "Bh",
    deliveryFee: 99,
    freeDeliveryOver: null,
    minOrder: null,
    accent: "#a16207",
  },
  {
    id: "chase-up",
    name: "Chase Up",
    initials: "Cu",
    deliveryFee: null,
    freeDeliveryOver: null,
    minOrder: null,
    accent: "#7c3aed",
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
