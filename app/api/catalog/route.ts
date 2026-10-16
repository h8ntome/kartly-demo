import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/api/index";
import { getDataStatus } from "@/lib/api/status";

/**
 * GET /api/catalog
 *
 * The whole catalogue in one call: stores, canonical products and every
 * matched offer. The client fetches this once and then runs the comparison
 * engine locally, which is what makes quantity changes feel instant instead of
 * network-bound.
 */
export async function GET() {
  const [snapshot, status] = await Promise.all([getSnapshot(), getDataStatus()]);
  return NextResponse.json(
    { ...snapshot, status },
    {
      headers: {
        // The server-side TTL cache is the authority; browsers get a short
        // window so a refresh actually re-checks rather than going stale.
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
