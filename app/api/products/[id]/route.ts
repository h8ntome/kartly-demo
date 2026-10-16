import { NextResponse } from "next/server";
import { getProduct } from "@/lib/api/index";

/** GET /api/products/:id — one canonical product with every store's offer. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const product = await getProduct(id);
  if (!product) {
    return NextResponse.json({ error: `unknown product “${id}”` }, { status: 404 });
  }
  return NextResponse.json({ product });
}
