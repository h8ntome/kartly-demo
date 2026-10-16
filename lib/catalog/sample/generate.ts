import { STORES } from "@/lib/catalog/stores";
import { PRODUCT_SEEDS, type ProductSeed } from "@/lib/catalog/sample/products";
import {
  formatQuantity,
  normaliseQuantity,
  unitPrice,
  type Category,
  type Offer,
  type Promo,
  type StoreId,
  type Unit,
} from "@/lib/types";

/**
 * Deterministic sample-price generator.
 *
 * Determinism matters more here than it usually does: the same basket has to
 * produce the same numbers during server prerender and on the client, or React
 * hydration disagrees with itself. So there is no `Math.random()` and no
 * `new Date()` anywhere in this file — every figure is a pure function of the
 * product id and the store id.
 */

/* ------------------------------------------------------------------ *
 * Seeded randomness
 * ------------------------------------------------------------------ */

function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — tiny, fast, stable across engines. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable random in [0,1) for a (product, store) pair. */
function jitter(canonicalId: string, storeId: StoreId, salt = ""): number {
  return prng(hash32(`${canonicalId}|${storeId}|${salt}`))();
}

/* ------------------------------------------------------------------ *
 * Store positioning
 * ------------------------------------------------------------------ */

/**
 * Relative price index per store per category. 1.00 is the reference price in
 * `ProductSeed.base`. These are what give each store a genuine speciality,
 * which is the only reason a two-store split ever beats a single store.
 */
const PRICE_INDEX: Record<StoreId, Partial<Record<Category, number>>> = {
  naheed: {
    "Meat & Fish": 0.94,
    "Fruit & Veg": 0.96,
    "Dairy & Eggs": 0.99,
    "Pantry & Grains": 1.02,
    "Oil & Ghee": 1.01,
    Cleaning: 1.03,
    "Personal Care": 1.01,
    "Baby Care": 1.0,
  },
  imtiaz: {
    "Pantry & Grains": 0.9,
    "Oil & Ghee": 0.88,
    "Spices & Masala": 0.93,
    Cleaning: 0.95,
    Household: 0.96,
    "Breakfast & Snacks": 0.97,
    "Meat & Fish": 1.06,
    "Fruit & Veg": 1.04,
  },
  carrefour: {
    Cleaning: 0.9,
    "Personal Care": 0.88,
    Household: 0.9,
    "Baby Care": 0.9,
    "Pantry & Grains": 1.03,
    "Oil & Ghee": 1.04,
    "Meat & Fish": 1.05,
    "Fruit & Veg": 1.05,
  },
  "chase-up": {
    "Breakfast & Snacks": 0.92,
    Beverages: 0.9,
    "Fruit & Veg": 1.06,
    "Meat & Fish": 1.08,
    "Pantry & Grains": 1.02,
    "Oil & Ghee": 1.03,
  },
  springs: {
    "Fruit & Veg": 0.94,
    "Dairy & Eggs": 0.95,
    "Meat & Fish": 0.98,
    "Pantry & Grains": 1.05,
    "Oil & Ghee": 1.06,
    "Spices & Masala": 1.06,
    Cleaning: 1.05,
    Household: 1.05,
  },
  hydri: {
    "Meat & Fish": 0.84,
    "Fruit & Veg": 0.9,
    "Spices & Masala": 0.96,
    "Pantry & Grains": 1.04,
    "Oil & Ghee": 1.05,
    Cleaning: 1.06,
    "Personal Care": 1.06,
  },
  "bin-hashim": {
    "Pantry & Grains": 0.94,
    "Oil & Ghee": 0.95,
    "Spices & Masala": 0.96,
    "Meat & Fish": 1.03,
    "Personal Care": 1.02,
  },
  "chase-value": {
    "Pantry & Grains": 0.92,
    "Oil & Ghee": 0.93,
    Cleaning: 0.92,
    Household: 0.93,
    "Breakfast & Snacks": 0.94,
    "Spices & Masala": 0.94,
    Beverages: 0.95,
    "Personal Care": 0.95,
    "Fruit & Veg": 1.08,
    "Meat & Fish": 1.1,
  },
  spar: {
    "Pantry & Grains": 1.08,
    "Spices & Masala": 1.08,
    "Oil & Ghee": 1.06,
    Beverages: 1.06,
    "Dairy & Eggs": 1.05,
    "Meat & Fish": 1.04,
    Cleaning: 1.04,
    "Baby Care": 1.02,
  },
};

/** How willing a store is to list large pack sizes. */
const BULK_BIAS: Record<StoreId, number> = {
  naheed: 0.45,
  imtiaz: 0.72,
  carrefour: 0.5,
  "chase-up": 0.3,
  springs: 0.34,
  hydri: 0.4,
  "bin-hashim": 0.78,
  "chase-value": 0.62,
  spar: 0.26,
};

/** Typical minutes since a price was last checked, per store. */
const CADENCE: Record<StoreId, number> = {
  naheed: 22,
  imtiaz: 38,
  carrefour: 26,
  "chase-up": 14,
  springs: 9,
  hydri: 11,
  "bin-hashim": 47,
  "chase-value": 63,
  spar: 31,
};

/** Brand price premium — a premium brand on the same shelf costs more. */
const BRAND_PREMIUM: Record<string, number> = {
  Guard: 1.0,
  Chipolite: 1.06,
  Kainat: 0.96,
  "Taj Mehmood": 1.09,
  Meerak: 0.94,
  Shan: 1.02,
  National: 1.0,
  Kakarwal: 1.04,
  "Pak Pak": 0.95,
  Baba: 0.92,
  "Al-Abbas": 0.97,
  Hassoo: 0.94,
  Seat: 0.98,
  Pakola: 0.96,
  Olpers: 1.03,
  Hafsoor: 0.93,
  Bullets: 1.02,
  Sufi: 0.97,
  Rainbow: 0.94,
  Home: 0.88,
  Dalda: 1.05,
  Khan: 1.02,
  Sooper: 0.96,
  Borges: 1.12,
  Carbonell: 1.08,
  Olivella: 0.99,
  Olperd: 1.04,
  Nurpur: 1.0,
  Haleeb: 0.97,
  Chaudhry: 0.93,
  Fresh: 1.0,
  Anchor: 1.1,
  "Big Bite": 0.94,
  Hydri: 0.9,
  "Al-Shakeel": 1.06,
  Tapal: 1.03,
  Lipton: 1.05,
  Baloch: 0.95,
  Nescafé: 1.08,
  Tang: 0.96,
  "Seven Up": 0.9,
  Pepsi: 1.0,
  "Coca-Cola": 1.02,
  Peak: 0.93,
  Aquafina: 1.0,
  Dasani: 0.98,
  Kinley: 0.95,
  Hilal: 0.94,
  Talal: 0.97,
  Baker: 1.0,
  "Baker's": 1.0,
  Nestlé: 1.07,
  Simms: 1.0,
  Lays: 1.04,
  Kurkure: 1.02,
  Mitchells: 0.95,
  Hunza: 1.08,
  Pitstop: 0.98,
  Safi: 1.06,
  "Al-Madina": 1.0,
  Mehran: 0.96,
  "Surf Excel": 1.05,
  Charge: 0.94,
  Aloza: 0.88,
  Tide: 1.03,
  Finish: 1.06,
  Vim: 1.0,
  Hite: 1.02,
  Lizol: 1.04,
  Dettol: 1.06,
  Lifebuoy: 0.97,
  Lux: 0.99,
  Safeguard: 1.0,
  Sunsilk: 1.0,
  "Head & Shoulders": 1.1,
  Pantene: 1.07,
  Clinic: 1.02,
  Colgate: 1.05,
  Senseo: 0.94,
  Signal: 0.98,
  Gladstone: 1.02,
  Melody: 0.95,
  "Scotch-Brite": 1.06,
  Pampers: 1.06,
  MamyPoko: 0.98,
  Huggies: 1.03,
  Loose: 0.92,
  "Naheed": 1.05,
};

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

function brandFor(seed: ProductSeed, storeId: StoreId): string {
  const pool = seed.brands;
  if (pool.length === 1) return pool[0];
  const idx = Math.floor(jitter(seed.id, storeId, "brand") * pool.length);
  return pool[Math.min(idx, pool.length - 1)];
}

function packsFor(seed: ProductSeed, storeId: StoreId): number[] {
  const bias = BULK_BIAS[storeId];
  const sorted = [...seed.packs].sort((a, b) => a.quantity - b.quantity);
  const median = sorted[Math.floor(sorted.length / 2)].quantity;
  const smallest = sorted[0].quantity;
  const keep = new Set<number>();
  // The smallest pack and the canonical size always stay listed. Dropping them
  // is what makes "1 L of oil" cost a 5 L bottle, which is a data artefact,
  // not a price signal. Bias only decides whether the bulk sizes show up.
  keep.add(smallest);
  for (const pack of sorted) {
    if (pack.quantity === seed.defaultQuantity) keep.add(pack.quantity);
    const isBulk = pack.quantity > median;
    const roll = jitter(seed.id, storeId, `pack:${pack.quantity}`);
    const threshold = isBulk ? 1 - bias : bias;
    if (roll < threshold) keep.add(pack.quantity);
  }
  return [...keep].sort((a, b) => a - b);
}

function promoFor(
  seed: ProductSeed,
  storeId: StoreId,
  price: number,
): Promo | null {
  const roll = jitter(seed.id, storeId, "promo");
  // Pantry and cleaning stores run the most promotions; fresh rarely does.
  const fresh = seed.category === "Fruit & Veg" || seed.category === "Meat & Fish";
  const limit = fresh ? 0.09 : 0.2;
  if (roll > limit) return null;

  const kindRoll = jitter(seed.id, storeId, "promo-kind");
  if (kindRoll < 0.62) {
    const pct = [5, 10, 12, 15, 20, 25][Math.floor(jitter(seed.id, storeId, "pct") * 6)];
    return { kind: "percent", value: pct, label: `${pct}% off` };
  }
  if (kindRoll < 0.85) {
    const flat = Math.max(10, Math.round((price * (0.06 + jitter(seed.id, storeId, "flat") * 0.1)) / 5) * 5);
    return { kind: "flat", value: flat, label: `Rs ${flat} off` };
  }
  const buy = jitter(seed.id, storeId, "buy") < 0.5 ? 2 : 3;
  return { kind: "bundle", buy, value: 1, label: `Buy ${buy} get 1 free` };
}

function buildOffer(seed: ProductSeed, storeId: StoreId, packQty: number): Offer {
  const pack = seed.packs.find((p) => p.quantity === packQty) ?? { quantity: packQty };
  const brand = brandFor(seed, storeId);
  const index = PRICE_INDEX[storeId][seed.category] ?? 1;
  const brandIndex = BRAND_PREMIUM[brand] ?? 1;
  const packIndex = pack.index ?? 1;
  const noise = 0.96 + jitter(seed.id, storeId, `price:${packQty}`) * 0.08;

  const perUnitBase = seed.base / seed.defaultQuantity;
  const gross = Math.round(perUnitBase * packIndex * index * brandIndex * noise * packQty);

  const promo = promoFor(seed, storeId, gross);
  let price = gross;
  if (promo?.kind === "percent") price = Math.round(gross * (1 - promo.value / 100));
  if (promo?.kind === "flat") price = Math.max(1, gross - promo.value);

  const stockRoll = jitter(seed.id, storeId, `stock:${packQty}`);
  const stock: Offer["stock"] = stockRoll < 0.05 ? "out" : stockRoll < 0.16 ? "low" : "in";
  const cadence = CADENCE[storeId];
  const freshnessMins = Math.max(
    2,
    Math.round(cadence * (0.4 + jitter(seed.id, storeId, `fresh:${packQty}`) * 1.6)),
  );

  const q = normaliseQuantity(packQty, seed.unit);
  const label = formatQuantity(q.quantity, q.unit);
  const title =
    seed.brands.length === 1 && seed.brands[0] === "Loose"
      ? `${seed.name} — ${label}`
      : `${brand} ${seed.name} ${label}`;

  return {
    canonicalId: seed.id,
    storeId,
    sku: `${storeId}-${seed.id}-${packQty}`.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
    title: title.replace(/\s+/g, " ").trim(),
    brand,
    quantity: packQty,
    unit: seed.unit,
    packLabel: label,
    price,
    listPrice: promo ? gross : undefined,
    promo,
    inStock: stock !== "out",
    stock,
    freshnessMins,
    live: false,
  };
}

function stocked(seed: ProductSeed, storeId: StoreId): boolean {
  if (seed.only && !seed.only.includes(storeId)) return false;
  if (seed.skip && seed.skip.includes(storeId)) return false;
  // A small deterministic gap so "not stocked" is a real state in the demo.
  return jitter(seed.id, storeId, "carry") > 0.03;
}

export const SAMPLE_PRODUCTS = PRODUCT_SEEDS.map((seed) => ({
  id: seed.id,
  name: seed.name,
  category: seed.category,
  unit: seed.unit,
  defaultQuantity: seed.defaultQuantity,
  aliases: seed.aliases,
  glyph: seed.glyph,
  swapIds: seed.swapIds,
  swapNote: seed.swapNote,
}));

export const SAMPLE_OFFERS: Offer[] = STORES.flatMap((store) =>
  PRODUCT_SEEDS.flatMap((seed) => {
    if (!stocked(seed, store.id)) return [];
    return packsFor(seed, store.id).map((packQty) => buildOffer(seed, store.id, packQty));
  }),
);

/**
 * A believable monthly Karachi basket. Sized so that most stores sit *just*
 * under their free-delivery threshold — if every basket cleared it, delivery
 * would drop out of the maths and the whole point of basket-level comparison
 * would disappear.
 */
export const STARTER_BASKET: { canonicalId: string; quantity: number }[] = [
  { canonicalId: "chakki-atta", quantity: 10 },
  { canonicalId: "sunflower-oil", quantity: 5 },
  { canonicalId: "basmati-rice", quantity: 5 },
  { canonicalId: "chicken", quantity: 2 },
  { canonicalId: "eggs", quantity: 1 },
  { canonicalId: "long-life-milk", quantity: 3 },
  { canonicalId: "yogurt", quantity: 1 },
  { canonicalId: "sugar", quantity: 2 },
  { canonicalId: "black-tea", quantity: 200 },
  { canonicalId: "onion", quantity: 2 },
  { canonicalId: "tomato", quantity: 1 },
  { canonicalId: "washing-powder", quantity: 1 },
];

/**
 * A second, smaller basket used by the homepage teaser. Deliberately built so
 * that no single store wins: the produce belongs at one shop, the pantry at
 * another, and the split only pays once delivery is counted.
 */
export const TEASER_BASKET: { canonicalId: string; quantity: number }[] = [
  { canonicalId: "chana-daal", quantity: 1 },
  { canonicalId: "potato", quantity: 2 },
  { canonicalId: "onion", quantity: 2 },
  { canonicalId: "tomato", quantity: 1 },
  { canonicalId: "banana", quantity: 1 },
  { canonicalId: "sunflower-oil", quantity: 1 },
  { canonicalId: "bath-soap", quantity: 2 },
  { canonicalId: "black-tea", quantity: 200 },
];

/* ------------------------------------------------------------------ *
 * Sample receipts
 * ------------------------------------------------------------------ */

/**
 * Plain-text receipts for the scan demo, **generated from the same offers the
 * engine prices**. Hand-typed receipt prices would drift the moment the price
 * generator changed, and the receipt page would end up claiming a saving that
 * its own catalogue contradicts. Printing them from the catalogue means "you
 * paid X here, the same list costs Y the cheapest way" is arithmetic, not a
 * caption.
 *
 * Real Karachi receipts are terse — quantity, name, pack, price — and the
 * parser expects exactly that shape.
 */
interface ReceiptSpec {
  storeId: StoreId;
  /** Label shown in the UI; the printed header is the first header row. */
  label: string;
  /** Printed above the items; the first row becomes the store guess. */
  header: string[];
  lines: Array<{ canonicalId: string; packs: number }>;
  /**
   * Lines meant to defeat the matcher, so the review step is not hypothetical.
   * Their price still counts toward the printed total, exactly as it would on a
   * real bill — which is why the UI refuses to claim a saving until they are
   * resolved.
   */
  noise?: Array<{ text: string; price: number }>;
}

const RECEIPT_SPECS: ReceiptSpec[] = [
  {
    storeId: "imtiaz",
    label: "Imtiaz Super Market — Shahrah-e-Faisal",
    header: ["IMTIAZ SUPER MARKET", "SHAHRAH-E-FAISAL KARACHI", "INV# 88214  14-10-2026  19:42"],
    lines: [
      { canonicalId: "basmati-rice", packs: 1 },
      { canonicalId: "sunflower-oil", packs: 2 },
      { canonicalId: "chakki-atta", packs: 1 },
      { canonicalId: "sugar", packs: 1 },
      { canonicalId: "chana-daal", packs: 2 },
      { canonicalId: "black-tea", packs: 1 },
      { canonicalId: "washing-powder", packs: 1 },
      { canonicalId: "long-life-milk", packs: 3 },
      { canonicalId: "eggs", packs: 1 },
      { canonicalId: "yogurt", packs: 1 },
    ],
    noise: [{ text: "1  FROZEN MIX VEGETABLES 400G     690", price: 690 }],
  },
  {
    storeId: "carrefour",
    label: "Carrefour — Dolmen Mall Clifton",
    header: ["CARREFOUR", "DOLMEN MALL CLIFTON KARACHI", "BILL 55102  12-10-2026"],
    lines: [
      { canonicalId: "chicken", packs: 1 },
      { canonicalId: "fish-rohu", packs: 1 },
      { canonicalId: "fresh-milk", packs: 2 },
      { canonicalId: "tomato", packs: 1 },
      { canonicalId: "onion", packs: 1 },
      { canonicalId: "potato", packs: 1 },
      { canonicalId: "apple", packs: 1 },
      { canonicalId: "lemon", packs: 1 },
      { canonicalId: "butter", packs: 1 },
      { canonicalId: "cheese-slices", packs: 1 },
      { canonicalId: "garam-masala", packs: 1 },
      { canonicalId: "turmeric", packs: 1 },
      { canonicalId: "tissue-roll", packs: 1 },
      { canonicalId: "shampoo", packs: 1 },
    ],
    noise: [{ text: "1  GREEN CORIANDER 250G          90", price: 90 }],
  },
];

/**
 * The pack a shopper would actually put in the trolley: the smallest pack that
 * covers a normal purchase, not the cheapest per kilo. Nobody buys 5 kg of daal
 * because the unit price is better, and a receipt that says otherwise is a
 * receipt nobody brought.
 */
function shelfOffer(seed: ProductSeed, storeId: StoreId): Offer | null {
  const offers = SAMPLE_OFFERS.filter(
    (offer) => offer.storeId === storeId && offer.canonicalId === seed.id && offer.inStock,
  );
  if (!offers.length) return null;
  const covering = offers.filter((offer) => offer.quantity >= seed.defaultQuantity);
  const pool = covering.length ? covering : offers;
  return pool.reduce((best, offer) => {
    if (offer.quantity !== best.quantity) return offer.quantity < best.quantity ? offer : best;
    return offer.price < best.price ? offer : best;
  });
}

const SEED_BY_ID = new Map<string, ProductSeed>(PRODUCT_SEEDS.map((seed) => [seed.id, seed]));

function renderReceipt(spec: ReceiptSpec): { store: string; text: string } | null {
  const rows: string[] = [];
  let subtotal = 0;
  for (const line of spec.lines) {
    const seed = SEED_BY_ID.get(line.canonicalId);
    if (!seed) continue;
    const offer = shelfOffer(seed, spec.storeId);
    if (!offer) continue;
    const total = Math.round(offer.price * line.packs);
    subtotal += total;
    const label = `${line.packs}  ${offer.title.toUpperCase()}`;
    rows.push(`${label}${" ".repeat(Math.max(2, 38 - label.length))}${total.toLocaleString("en-PK")}`);
  }
  for (const extra of spec.noise ?? []) {
    subtotal += extra.price;
    rows.push(extra.text);
  }
  if (!rows.length) return null;
  const footer = (label: string, value: string) =>
    `${label}${" ".repeat(Math.max(2, 34 - label.length))}${value}`;
  return {
    store: spec.label,
    text: [
      ...spec.header,
      "",
      ...rows,
      "",
      footer("SUBTOTAL", subtotal.toLocaleString("en-PK")),
      footer("VAT 0%", "0"),
      footer("TOTAL", subtotal.toLocaleString("en-PK")),
    ].join("\n"),
  };
}

export const SAMPLE_RECEIPTS: { store: string; text: string }[] = RECEIPT_SPECS.map(
  renderReceipt,
).filter((receipt): receipt is { store: string; text: string } => receipt !== null);

/** Unit price helper re-exported so consumers do not import two modules. */
export { unitPrice };
export type { Category, Unit };
