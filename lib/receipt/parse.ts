import type { CanonicalProduct, Unit } from "@/lib/types";
import { matchProduct, parsePackSize, type MatchResult } from "@/lib/api/normalize";

/**
 * Receipt → shopping list.
 *
 * Pakistani grocery receipts are terse and inconsistent: some print `1 GUARD
 * BASMATI RICE 5KG 2,745`, others print the name first with no quantity at
 * all. Rather than pretend a parser exists, this module does the three things
 * that actually work on this corpus:
 *
 *   1. strip totals, tax and header noise,
 *   2. pull a quantity, a pack size and a trailing price out of the line,
 *   3. fuzzy-match the remainder against the canonical catalogue.
 *
 * Every line carries a confidence and a reason. The review step shows both and
 * lets the shopper fix anything below the confident threshold — the product
 * promise is "we extracted 11 of 13 items, check these two", not "trust us".
 */

export interface ReceiptLine {
  lineNumber: number;
  raw: string;
  quantity: number;
  /** Pack size printed on the receipt, if any. */
  pack: { quantity: number; unit: Unit } | null;
  printedPrice: number | null;
  match: MatchResult | null;
  canonicalId: string | null;
  /** Quantity to put in the basket, in the canonical product's unit. */
  basketQuantity: number;
  confidence: number;
  needsReview: boolean;
  reason: string;
}

export interface ReceiptParse {
  lines: ReceiptLine[];
  recognised: number;
  unresolved: number;
  storeGuess: string | null;
  printedTotal: number | null;
  /** Lines ignored as headers, totals and blank rows. */
  skipped: string[];
}

/** Rows that are never products. */
const NOISE =
  /^(subtotal|sub\s*total|total|grand\s*total|net\s*pay|amount\s*due|cash|card|visa|master|change|balance|vat|gst|tax|discount|disc|sst|invoice|inv\b|bill\b|receipt|date|time|till|cashier|item\s*no|thank\s*you|thanks|visit|order|phone|fssai|ntn|sr|#|page)\b/i;

const PRICE_AT_END = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*$/;
const QTY_AT_START = /^(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)?\s+(.*)$/;
const LEADING_INDEX = /^\s*\d{1,3}\s*[.)\]]\s+(.*)$/;

function parsePrice(text: string): { rest: string; price: number | null } {
  const match = PRICE_AT_END.exec(text);
  if (!match) return { rest: text, price: null };
  const value = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return { rest: text, price: null };
  // A trailing "1" is a quantity, not a Rs 1 item.
  if (value < 2 && !match[1].includes(".")) return { rest: text, price: null };
  return { rest: text.slice(0, match.index).trim(), price: Math.round(value) };
}

function parseQuantity(text: string): { rest: string; quantity: number } {
  const match = QTY_AT_START.exec(text);
  if (!match) return { rest: text, quantity: 1 };
  const value = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > 99) return { rest: text, quantity: 1 };
  return { rest: match[2].trim(), quantity: value };
}

/**
 * Quantity for the basket, in the canonical product's unit.
 *
 * If the receipt says "2 CHANA DAAL 1KG" that is two 1 kg packs, and the
 * canonical unit is kg, so the basket wants 2 kg. If the printed pack size is
 * missing we fall back to the product's default quantity × line count.
 */
function basketQuantity(
  line: { quantity: number; pack: { quantity: number; unit: Unit } | null },
  product: CanonicalProduct,
): number {
  const printed = line.pack?.quantity;
  const per = printed && line.pack?.unit === product.unit ? printed : product.defaultQuantity;
  return +(per * line.quantity).toFixed(3);
}

export function parseReceiptText(text: string, products: CanonicalProduct[]): ReceiptParse {
  const rawLines = text.split(/\r?\n/);
  const lines: ReceiptLine[] = [];
  const skipped: string[] = [];
  let storeGuess: string | null = null;
  let printedTotal: number | null = null;

  rawLines.forEach((raw, index) => {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    if (NOISE.test(lower)) {
      const totalMatch = /(?:grand\s*total|total|net\s*pay)\s*[:\-]?\s*([0-9][0-9,]*)/i.exec(trimmed);
      if (totalMatch) printedTotal = Number.parseInt(totalMatch[1].replace(/,/g, ""), 10);
      skipped.push(trimmed);
      return;
    }

    // The leading rows that are mostly letters and carry no price are the store
    // name and its address. Neither is a product, and printing them as "1 line
    // to review" would train the shopper to ignore the review step.
    if (
      lines.length === 0 &&
      !PRICE_AT_END.test(trimmed) &&
      trimmed.length > 6 &&
      /[a-z]/i.test(trimmed) &&
      !parsePackSize(trimmed)
    ) {
      const looksLikeHeader = !/\d/.test(trimmed) || /^[A-Z0-9\s.&'-]{6,}$/.test(trimmed);
      if (looksLikeHeader) {
        if (!storeGuess) storeGuess = trimmed.replace(/\s+/g, " ");
        else skipped.push(trimmed);
        return;
      }
    }

    const indexed = LEADING_INDEX.exec(trimmed);
    const body = indexed ? indexed[1] : trimmed;
    const { rest: afterPrice, price } = parsePrice(body);
    const { rest: afterQty, quantity } = parseQuantity(afterPrice);
    const pack = parsePackSize(afterQty);
    const namePart = afterQty
      .replace(/(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|g|gm|gms|grams?|l|ltr|litres?|liters?|ml|doz|dozen|pcs?|pieces?|sheets?|rolls?|pk)\b/gi, " ")
      .trim();

    const match = matchProduct(namePart || afterQty, products);
    const confidence = match?.confidence ?? 0;
    const needsReview = !match || confidence < 0.62;

    lines.push({
      lineNumber: index + 1,
      raw: trimmed,
      quantity,
      pack,
      printedPrice: price,
      match,
      canonicalId: match?.product.id ?? null,
      basketQuantity: match ? basketQuantity({ quantity, pack }, match.product) : 0,
      confidence,
      needsReview,
      reason: match?.reason ?? "no catalogue match",
    });
  });

  return {
    lines,
    recognised: lines.filter((line) => !line.needsReview).length,
    unresolved: lines.filter((line) => line.needsReview).length,
    storeGuess,
    printedTotal,
    skipped,
  };
}

/** Turn a reviewed receipt into basket rows the engine can price. */
export function receiptToBasketRows(
  parse: ReceiptParse,
  selected: Array<{ lineNumber: number; canonicalId: string; quantity: number }>,
): Array<{ canonicalId: string; quantity: number }> {
  const rows = new Map<string, number>();
  for (const item of selected) {
    if (!item.canonicalId || item.quantity <= 0) continue;
    rows.set(item.canonicalId, +((rows.get(item.canonicalId) ?? 0) + item.quantity).toFixed(3));
  }
  void parse;
  return [...rows].map(([canonicalId, quantity]) => ({ canonicalId, quantity }));
}
