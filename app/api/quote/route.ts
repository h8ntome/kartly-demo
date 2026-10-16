import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/api/index";
import { compareBasket, toBasketItems } from "@/lib/engine/plan";
import type { ProductDetail } from "@/lib/types";

/**
 * POST /api/quote
 *
 * ```json
 * { "items": [{ "canonicalId": "chakki-atta", "quantity": 10 }] }
 * ```
 *
 * Returns the full comparison plan: every store quote, the best single store,
 * the best two-store split, the price matrix and the savings breakdown. This is
 * the same pure engine the browser runs, exposed for anything that cannot ship
 * the catalogue — a mobile app, a webhook, a batch job.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const rawItems = (body as { items?: unknown })?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json(
      { error: "`items` must be a non-empty array of { canonicalId, quantity }" },
      { status: 400 },
    );
  }
  if (rawItems.length > 60) {
    return NextResponse.json({ error: "baskets are limited to 60 lines" }, { status: 413 });
  }

  const rows: Array<{ id: string; canonicalId: string; quantity: number }> = [];
  for (let index = 0; index < rawItems.length; index++) {
    const item = rawItems[index] as { canonicalId?: unknown; quantity?: unknown };
    const canonicalId = typeof item?.canonicalId === "string" ? item.canonicalId : "";
    const quantity = Number(item?.quantity);
    if (!canonicalId || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: `line ${index + 1} needs a canonicalId and a positive quantity` },
        { status: 400 },
      );
    }
    rows.push({ id: `line-${index + 1}`, canonicalId, quantity });
  }

  const snapshot = await getSnapshot();
  const products = new Map<string, ProductDetail>(snapshot.products.map((p) => [p.id, p]));
  const items = toBasketItems(rows, products);

  if (!items.length) {
    return NextResponse.json(
      { error: "none of those canonicalIds exist in the catalogue", requested: rows.map((r) => r.canonicalId) },
      { status: 422 },
    );
  }

  const plan = compareBasket(items, products, snapshot.stores);
  return NextResponse.json({
    source: snapshot.source,
    generatedAt: snapshot.generatedAt,
    unresolved: rows.filter((row) => !products.has(row.canonicalId)).map((row) => row.canonicalId),
    plan,
  });
}
