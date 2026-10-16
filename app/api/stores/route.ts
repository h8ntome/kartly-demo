import { NextResponse } from "next/server";
import { getStores } from "@/lib/api/index";

/** GET /api/stores — the nine supermarkets and their delivery rules. */
export async function GET() {
  const stores = await getStores();
  return NextResponse.json({ stores });
}
