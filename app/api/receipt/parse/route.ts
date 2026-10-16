import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/api/index";
import { parseReceiptText } from "@/lib/receipt/parse";

/**
 * POST /api/receipt/parse  { text: string }
 *
 * Turns receipt text into candidate basket lines. OCR itself runs in the
 * browser (tesseract.js), so no image ever leaves the machine; this endpoint
 * takes the recognised text and does the catalogue matching where the catalogue
 * actually lives.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const text = (body as { text?: unknown })?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "`text` must be a non-empty string" }, { status: 400 });
  }
  if (text.length > 20_000) {
    return NextResponse.json({ error: "receipt text is too long" }, { status: 413 });
  }

  const snapshot = await getSnapshot();
  const parsed = parseReceiptText(text, snapshot.products);
  return NextResponse.json({ source: snapshot.source, ...parsed });
}
