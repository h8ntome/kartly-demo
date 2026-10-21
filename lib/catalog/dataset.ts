import { STORES } from "@/lib/catalog/stores";
import type {
  CanonicalProduct,
  Category,
  Offer,
  StoreId,
  Unit,
} from "@/lib/types";
import { formatQuantity } from "@/lib/types";

/**
 * The single supplied data source: five products, six stores, and the price
 * (or the absence of one) for every product/store pair.
 *
 * Nothing in this file is generated, seeded, rounded or estimated. Prices are
 * the figures supplied for the stores named in `lib/catalog/stores.ts`, in
 * PKR, and a `null` price means the store does not have that product — it is
 * never treated as a price of zero anywhere in the app.
 *
 * Every screen reads this through the catalogue snapshot (`lib/api/index.ts`),
 * so the homepage, search, product pages, basket and optimiser can never
 * disagree about a number.
 */

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export interface ProductFacts extends CanonicalProduct {
  /** The brand the supplied product name carries. */
  brand: string;
}

export const PRODUCTS: ProductFacts[] = [
  {
    id: "nesvita",
    name: "Nestlé Nesvita",
    brand: "Nestlé",
    category: "Beverages",
    unit: "piece",
    defaultQuantity: 1,
    glyph: "🍵",
    aliases: ["nestle nesvita", "nesvita", "nestle tea", "tea"],
  },
  {
    id: "falak-basmati-rice",
    name: "Falak Select Basmati Rice (5kg)",
    brand: "Falak",
    category: "Pantry & Grains",
    unit: "kg",
    defaultQuantity: 5,
    glyph: "🍚",
    aliases: [
      "falak select basmati rice",
      "falak basmati rice",
      "basmati rice",
      "rice",
      "falak select",
      "falak",
    ],
  },
  {
    id: "nurpur-butter",
    name: "Nurpur Butter",
    brand: "Nurpur",
    category: "Dairy & Eggs",
    unit: "piece",
    defaultQuantity: 1,
    glyph: "🧈",
    aliases: ["nurpur butter", "butter"],
  },
  {
    id: "eva-canola-oil",
    name: "Eva Canola Oil (5 Litres)",
    brand: "Eva",
    category: "Oil & Ghee",
    unit: "L",
    defaultQuantity: 5,
    glyph: "🫒",
    aliases: ["eva canola oil", "canola oil", "eva oil", "cooking oil", "oil"],
  },
  {
    id: "cocomo-cereal",
    name: "Cocomo Cereal",
    brand: "Cocomo",
    category: "Breakfast & Snacks",
    unit: "piece",
    defaultQuantity: 1,
    glyph: "🥣",
    aliases: ["cocomo cereal", "cocomo", "cereal", "breakfast cereal"],
  },
];

export const PRODUCT_MAP: Record<string, ProductFacts> = PRODUCTS.reduce(
  (acc, product) => {
    acc[product.id] = product;
    return acc;
  },
  {} as Record<string, ProductFacts>,
);

/* ------------------------------------------------------------------ *
 * Prices
 * ------------------------------------------------------------------ */

/**
 * Price in PKR per store, or `null` where the store does not have the product.
 * Keys are product ids, then store ids; every product/store pair is listed.
 */
export const PRICES: Record<string, Record<StoreId, number | null>> = {
  nesvita: {
    hydri: 405,
    carrefour: 405,
    naheed: 410,
    springs: 410,
    "bin-hashim": 399,
    "chase-up": 405,
  },
  "falak-basmati-rice": {
    hydri: 2124,
    carrefour: 2130,
    naheed: null,
    springs: 2245,
    "bin-hashim": 2154,
    "chase-up": 2145,
  },
  "nurpur-butter": {
    hydri: 410,
    carrefour: 420,
    naheed: 420,
    springs: 420,
    "bin-hashim": null,
    "chase-up": 415,
  },
  "eva-canola-oil": {
    hydri: 3190,
    carrefour: null,
    naheed: 3200,
    springs: 3300,
    "bin-hashim": 3113,
    "chase-up": 3015,
  },
  "cocomo-cereal": {
    hydri: null,
    carrefour: null,
    naheed: null,
    springs: 699,
    "bin-hashim": 665,
    "chase-up": 699,
  },
};

/** Every price as a flat list, for verification and reporting. */
export interface PriceRecord {
  productId: string;
  storeId: StoreId;
  price: number | null;
}

export const PRICE_RECORDS: PriceRecord[] = PRODUCTS.flatMap((product) =>
  STORES.map((store) => ({
    productId: product.id,
    storeId: store.id,
    price: PRICES[product.id][store.id],
  })),
);

/** How the pack is described. Derived from the product name, never invented. */
function packLabelFor(product: ProductFacts): string {
  return formatQuantity(product.defaultQuantity, product.unit);
}

/**
 * One offer per available product/store pair. A pair with no price produces no
 * offer at all, which is how "not available" reaches the engine: an absent
 * offer is a store that cannot fulfil the line, never a free line.
 */
export const OFFERS: Offer[] = PRICE_RECORDS.filter(
  (record): record is PriceRecord & { price: number } => record.price !== null,
).map((record) => {
  const product = PRODUCT_MAP[record.productId];
  return {
    canonicalId: product.id,
    storeId: record.storeId,
    title: product.name,
    brand: product.brand,
    quantity: product.defaultQuantity,
    unit: product.unit as Unit,
    packLabel: packLabelFor(product),
    price: record.price,
    promo: null,
    inStock: true,
  };
});

/** Products with their offers attached, ready for a catalogue snapshot. */
export const CATALOG_PRODUCTS = PRODUCTS.map((product) => {
  const { brand: _brand, ...canonical } = product;
  void _brand;
  return { ...canonical, offers: OFFERS.filter((offer) => offer.canonicalId === product.id) };
});

/** Categories actually present in the catalogue, alphabetical. */
export const ACTIVE_CATEGORIES = [...new Set(PRODUCTS.map((p) => p.category as Category))].sort();

/* ------------------------------------------------------------------ *
 * Example basket
 * ------------------------------------------------------------------ */

/**
 * One of each product at its listed pack size. It is a basket made entirely of
 * supplied lines, used as the worked example on the homepage and the basket
 * page — nothing about it is invented beyond the shopper's choice of quantity.
 */
export const EXAMPLE_BASKET: Array<{ canonicalId: string; quantity: number }> = PRODUCTS.map(
  (product) => ({ canonicalId: product.id, quantity: product.defaultQuantity }),
);

/* ------------------------------------------------------------------ *
 * Example receipts
 * ------------------------------------------------------------------ */

/**
 * Printed bills for the receipt scanner, rendered from the same price table
 * the engine prices, so a receipt can never claim a figure the catalogue
 * contradicts. Only products the store actually has appear on its bill.
 */
function renderReceipt(storeId: StoreId, label: string, header: string[]): { store: string; text: string } | null {
  const rows: string[] = [];
  let subtotal = 0;
  for (const product of PRODUCTS) {
    const price = PRICES[product.id][storeId];
    if (price === null) continue;
    subtotal += price;
    const name = `${product.name.toUpperCase()}${product.unit === "piece" ? "" : ` (${packLabelFor(product).toUpperCase()})`}`;
    const line = `1  ${name}`;
    rows.push(`${line}${" ".repeat(Math.max(2, 40 - line.length))}${price.toLocaleString("en-PK")}`);
  }
  if (!rows.length) return null;
  const footer = (text: string, value: string) =>
    `${text}${" ".repeat(Math.max(2, 40 - text.length))}${value}`;
  return {
    store: label,
    text: [
      ...header,
      "",
      ...rows,
      "",
      footer("SUBTOTAL", subtotal.toLocaleString("en-PK")),
      footer("TOTAL", subtotal.toLocaleString("en-PK")),
    ].join("\n"),
  };
}

export const EXAMPLE_RECEIPTS: Array<{ store: string; text: string }> = [
  renderReceipt("hydri", "Hydri", ["HYDRI SUPER MARKET", "KARACHI"]),
  renderReceipt("bin-hashim", "Bin Hashim", ["BIN HASHIM", "KARACHI"]),
].filter((receipt): receipt is { store: string; text: string } => receipt !== null);
