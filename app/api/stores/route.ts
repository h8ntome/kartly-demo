import { NextResponse } from "next/server";
import { getStores } from "@/lib/api/index";

/** GET /api/stores — every supermarket Kartly compares and its delivery rules. */
export async function GET() {
  const stores = await getStores();
  return NextResponse.json({ stores });
}
