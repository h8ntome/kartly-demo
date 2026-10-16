/**
 * Normalisation and matching.
 *
 * The hard part of grocery price comparison is not fetching prices, it is
 * deciding that "GUARD BASMATI RICE 5KG" at Imtiaz and "Basmati Rice Super
 * Kernel 5 kg" at Naheed are the same purchase. Everything that answers "are
 * these the same thing?" lives here, so the question is asked exactly once.
 */

import type { CanonicalProduct, Offer, Unit } from "@/lib/types";

/** Words that carry no product identity on a receipt or in a search box. */
const STOPWORDS = new Set([
  "the",
  "and",
  "of",
  "per",
  "pack",
  "pkt",
  "packet",
  "box",
  "boxx",
  "bag",
  "pouch",
  "bottle",
  "btl",
  "pcs",
  "piece",
  "pieces",
  "nos",
  "no",
  "mrp",
  "qty",
  "rate",
  "amt",
  "rs",
  "pkr",
  "total",
  "subtotal",
  "sub",
  "vat",
  "tax",
  "disc",
  "discount",
  "bill",
  "inv",
  "invoice",
  "item",
  "each",
  "approx",
  "loose",
]);

const DIACRITICS: Record<string, string> = {
  é: "e",
  è: "e",
  ü: "u",
  ö: "o",
  ñ: "n",
  ç: "c",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "×": "x",
};

/** Lowercase, de-punctuate, fold the punctuation Pakistani receipts use. */
export function normaliseText(input: string): string {
  let out = input.toLowerCase();
  for (const [from, to] of Object.entries(DIACRITICS)) out = out.split(from).join(to);
  return out
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Meaningful tokens only — units and receipt noise removed. */
export function tokens(input: string): string[] {
  return normaliseText(input)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/* ------------------------------------------------------------------ *
 * Pack-size parsing
 * ------------------------------------------------------------------ */

const UNIT_ALIASES: Array<[RegExp, Unit, number]> = [
  [/^(kgs?|kilos?|kilogram(s)?)$/, "kg", 1],
  [/^(g|gm|gms|gram(s)?)$/, "g", 1],
  [/^(l|ltr|ltrs|litre(s)?|liter(s)?)$/, "L", 1],
  [/^(ml|mls|millilitre(s)?|milliliter(s)?)$/, "ml", 1],
  [/^(doz|dozen|dozens|tray|trays)$/, "dozen", 1],
  [/^(pc|pcs|piece|pieces|unit|units)$/, "piece", 1],
  [/^(sheet|sheets|roll|rolls|pk|pack)$/, "piece", 1],
];

export interface PackedQuantity {
  quantity: number;
  unit: Unit;
}

/**
 * Pull the first "5KG" / "1.5 L" / "200g" out of free text. Returns null when
 * the text carries no size, which the caller treats as "unknown", never as 0.
 */
export function parsePackSize(input: string): PackedQuantity | null {
  // Deliberately not `normaliseText`: it folds every non-alphanumeric to a
  // space, which turns "1.5 kg" into "1 5 kg" and makes the parser report a
  // 5 kg pack. Lowercase and fold diacritics here, keep the decimal point.
  let text = input.toLowerCase();
  for (const [from, to] of Object.entries(DIACRITICS)) text = text.split(from).join(to);
  text = text.replace(/\s+/g, " ").trim();
  const re = /(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|kilograms?|g|gm|gms|grams?|l|ltr|ltrs|litres?|liters?|ml|mls|millilitres?|milliliters?|doz|dozen|dozens|trays?|pcs?|pieces?|units?|sheets?|rolls?|pk)\b/;
  const m = re.exec(text);
  if (!m) return null;
  const raw = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  for (const [pattern, unit, mult] of UNIT_ALIASES) {
    if (pattern.test(m[2])) {
      // Grams above a kilogram and millilitres above a litre are re-based so
      // every quantity in the system speaks one unit per family.
      if (unit === "g" && raw >= 1000) return { quantity: raw / 1000, unit: "kg" };
      if (unit === "ml" && raw >= 1000) return { quantity: raw / 1000, unit: "L" };
      return { quantity: raw * mult, unit };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Similarity
 * ------------------------------------------------------------------ */

/** Character-bigram Dice coefficient — tolerant of receipt OCR typos. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const left = counts.get(bg) ?? 0;
    if (left > 0) {
      counts.set(bg, left - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}

/* ------------------------------------------------------------------ *
 * Product matching
 * ------------------------------------------------------------------ */

export interface MatchResult {
  product: CanonicalProduct;
  /** 0..1. Below ~0.45 the UI should ask the user to confirm. */
  confidence: number;
  /** Human-readable reason, shown in the receipt review step. */
  reason: string;
  /** Pack size found in the text, if any. */
  pack: PackedQuantity | null;
}

interface Indexed {
  product: CanonicalProduct;
  /** Every searchable phrase for this product, tokenised. */
  phrases: { text: string; tokens: string[] }[];
}

let index: Indexed[] | null = null;

export function buildIndex(products: CanonicalProduct[]): Indexed[] {
  return products.map((product) => {
    const phrases = [product.name, ...product.aliases, ...product.aliases.map((a) => `${a} ${product.name}`)]
      .map((text) => ({ text: normaliseText(text), tokens: tokens(text) }));
    return { product, phrases };
  });
}

export function indexProducts(products: CanonicalProduct[]): Indexed[] {
  if (!index) index = buildIndex(products);
  return index;
}

export function resetIndex(): void {
  index = null;
}

/**
 * Match free text to one canonical product.
 *
 * Scoring blends three signals: exact phrase hits (a receipt that says
 * "basmati rice" should not have to be fuzzy-matched), token coverage (partial
 * names, word order differences), and bigram similarity (OCR noise such as
 * "basmatl"). The winner is only trusted above a floor.
 */
export function matchProduct(
  raw: string,
  products: CanonicalProduct[],
  opts: { minConfidence?: number } = {},
): MatchResult | null {
  const idx = indexProducts(products);
  const min = opts.minConfidence ?? 0.42;
  const text = normaliseText(raw);
  if (!text) return null;
  const pack = parsePackSize(raw);
  const queryTokens = tokens(raw);
  if (!queryTokens.length) return null;

  let best: MatchResult | null = null;

  for (const entry of idx) {
    let score = 0;
    let reason = "";

    for (const phrase of entry.phrases) {
      // Exact or prefix phrase containment is the strongest signal.
      if (text === phrase.text) {
        score = Math.max(score, 1);
        reason = `exact match on “${phrase.text}”`;
        continue;
      }
      if (text.includes(phrase.text) || phrase.text.includes(text)) {
        const overlap = Math.min(text.length, phrase.text.length) / Math.max(text.length, phrase.text.length);
        score = Math.max(score, 0.72 + overlap * 0.2);
        reason = `contains “${phrase.text}”`;
      }
    }

    // Token coverage: how much of the query the product explains, and how much
    // of the product the query covers. Both sides matter — "rice" alone should
    // not confidently beat "basmati rice" into "sella rice".
    for (const phrase of entry.phrases) {
      if (!phrase.tokens.length) continue;
      const hit = queryTokens.filter((t) => phrase.tokens.some((p) => p === t || p.startsWith(t) || t.startsWith(p)));
      const coverage = hit.length / queryTokens.length;
      const productCoverage = phrase.tokens.filter((p) =>
        queryTokens.some((t) => p === t || p.startsWith(t) || t.startsWith(p)),
      ).length / phrase.tokens.length;
      const blended = coverage * 0.65 + productCoverage * 0.35;
      if (blended > score) {
        score = blended * 0.9;
        reason = `matched ${hit.length}/${queryTokens.length} words`;
      }
    }

    // Fuzzy fallback for OCR damage.
    const fuzzy = Math.max(
      ...entry.phrases.map((p) => diceSimilarity(text, p.text)),
    );
    if (fuzzy * 0.85 > score) {
      score = fuzzy * 0.85;
      reason = "similar spelling";
    }

    if ((!best || score > best.confidence) && score >= min) {
      best = { product: entry.product, confidence: Math.min(1, score), reason, pack };
    }
  }

  return best;
}

/** Does an offer plausibly satisfy a requested quantity? Used for filtering. */
export function offerMatchesUnit(offer: Offer, unit: Unit): boolean {
  const family = (u: Unit) => (u === "kg" || u === "g" ? "mass" : u === "L" || u === "ml" ? "volume" : u);
  return family(offer.unit) === family(unit);
}

/** Search relevance for a whole catalogue, highest first. */
export function rankProducts<T extends CanonicalProduct>(
  query: string,
  products: T[],
): Array<{ product: T; score: number }> {
  const text = normaliseText(query);
  if (!text) return products.map((product) => ({ product, score: 0 }));
  const queryTokens = tokens(query);
  const out = products
    .map((product) => {
      const phrases = [product.name, ...product.aliases].map(normaliseText);
      let score = 0;
      for (const phrase of phrases) {
        if (phrase === text) score = Math.max(score, 1);
        else if (phrase.startsWith(text)) score = Math.max(score, 0.86);
        else if (phrase.includes(text)) score = Math.max(score, 0.7);
        else {
          const hits = queryTokens.filter((t) => phrase.includes(t)).length;
          if (hits) score = Math.max(score, (hits / Math.max(1, queryTokens.length)) * 0.6);
        }
        score = Math.max(score, diceSimilarity(text, phrase) * 0.55);
      }
      return { product, score };
    })
    .filter((r) => r.score > 0.2)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return out;
}
