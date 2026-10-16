import { STORES } from "@/lib/catalog/stores";
import {
  SAMPLE_OFFERS,
  SAMPLE_PRODUCTS,
} from "@/lib/catalog/sample/generate";
import type { CatalogSnapshot, ProductDetail } from "@/lib/types";
import type { CatalogProvider } from "@/lib/api/types";

/**
 * The bundled sample catalogue.
 *
 * Clearly a sample, everywhere it is used: `source: "sample"` and the note
 * below travel with the data all the way to the badge in the header, so no
 * screen in this app can accidentally present these prices as real.
 */
export const sampleProvider: CatalogProvider = {
  id: "sample",
  source: "sample",
  label: "Sample catalogue",
  note: "Illustrative Karachi prices for demonstration. Not live store data.",
  async load(): Promise<CatalogSnapshot> {
    const byProduct = new Map<string, ProductDetail>();
    for (const product of SAMPLE_PRODUCTS) {
      byProduct.set(product.id, { ...product, offers: [] });
    }
    for (const offer of SAMPLE_OFFERS) {
      const product = byProduct.get(offer.canonicalId);
      if (product) product.offers.push(offer);
    }
    return {
      // Fixed epoch for the sample set: the figures are generated, not fetched,
      // so claiming "updated 2 seconds ago" would be a lie.
      generatedAt: "2026-10-16T06:00:00.000Z",
      source: "sample",
      stores: STORES,
      products: [...byProduct.values()].filter((p) => p.offers.length > 0),
    };
  },
  async ping() {
    return true;
  },
  async stores() {
    return STORES;
  },
};
