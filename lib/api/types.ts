import type { CatalogSnapshot, Store } from "@/lib/types";

/**
 * The one interface every price source must satisfy.
 *
 * Today there is exactly one implementation that talks to anything real
 * (`rest.ts`, waiting on the pricing API you will provide) and one that serves
 * the bundled sample catalogue. The rest of the application only ever sees
 * this shape, which is what makes the swap a config change instead of a
 * rewrite.
 */
export interface CatalogProvider {
  /** Stable identifier, surfaced in /api/health and the UI's data badge. */
  readonly id: string;
  /** Whether figures came from a live feed or the bundled sample set. */
  readonly source: "sample" | "live";
  /** Human label for the UI, e.g. "Sample catalogue" or "Partner API". */
  readonly label: string;
  /** Why the UI is showing what it is showing — used verbatim in the badge. */
  readonly note: string;
  /** Full catalogue. Expected to be cached by the caller. */
  load(): Promise<CatalogSnapshot>;
  /** Optional cheap call used by the health endpoint. */
  ping?(): Promise<boolean>;
  /** Optional store list; falls back to `load().stores`. */
  stores?(): Promise<Store[]>;
}

/**
 * Shape the REST provider accepts. Deliberately tolerant: field names are
 * remappable through environment variables because no two supermarket feeds
 * agree on anything, and rewriting the adapter per vendor is how these projects
 * die.
 *
 * The default expectation is one record per store-offer:
 *
 * ```json
 * {
 *   "products": [{
 *     "id": "basmati-rice",
 *     "name": "Basmati rice",
 *     "category": "Pantry & Grains",
 *     "unit": "kg",
 *     "defaultQuantity": 5,
 *     "aliases": ["rice"],
 *     "offers": [{
 *       "storeId": "imtiaz",
 *       "sku": "IMT-1123",
 *       "title": "Guard Basmati Rice 5kg",
 *       "brand": "Guard",
 *       "quantity": 5, "unit": "kg",
 *       "price": 2745,
 *       "listPrice": 2990,
 *       "promo": { "kind": "percent", "value": 10, "label": "10% off" },
 *       "inStock": true,
 *       "updatedAt": "2026-10-16T09:12:00Z"
 *     }]
 *   }],
 *   "stores": [{ "id": "imtiaz", "name": "Imtiaz", "deliveryFee": 99,
 *                "freeDeliveryOver": 4500 }]
 * }
 * ```
 */
export interface RawCatalog {
  products?: unknown[];
  offers?: unknown[];
  stores?: unknown[];
}
