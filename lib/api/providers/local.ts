import { STORES } from "@/lib/catalog/stores";
import { CATALOG_PRODUCTS } from "@/lib/catalog/dataset";
import type { CatalogSnapshot } from "@/lib/types";
import type { CatalogProvider } from "@/lib/api/types";

/**
 * The bundled catalogue: the supplied products, prices and delivery rules.
 *
 * The label and note travel with the data all the way to the badge in the
 * header, so every screen says where its numbers came from. `generatedAt` is
 * null on purpose — no collection timestamp was supplied for these prices, and
 * inventing one would be the same fabrication as inventing a price.
 */
export const localProvider: CatalogProvider = {
  id: "local",
  source: "supplied",
  label: "Supplied price set",
  note: "Prices supplied for the six stores Kartly compares. Not live checkout prices.",
  async load(): Promise<CatalogSnapshot> {
    return {
      generatedAt: null,
      source: "supplied",
      stores: STORES,
      products: CATALOG_PRODUCTS,
    };
  },
  async ping() {
    return true;
  },
  async stores() {
    return STORES;
  },
};
