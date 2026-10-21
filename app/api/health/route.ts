import { NextResponse } from "next/server";
import { apiConfig, liveConfigured } from "@/lib/api/config";
import { resolveProvider } from "@/lib/api/index";
import { sharedCache } from "@/lib/api/cache";
import type { CatalogSnapshot } from "@/lib/types";

/**
 * GET /api/health
 *
 * Reports what the app is actually doing, not what it is configured to do:
 * `effectiveSource` is what the UI is showing, `configured` is what was asked
 * for. When they differ, the live feed failed and the supplied set is on screen.
 */
export async function GET() {
  const config = apiConfig();
  const provider = resolveProvider(config);
  const cache = sharedCache<CatalogSnapshot>("catalog:snapshot", {
    ttlMs: config.cacheTtlSecs * 1000,
  });
  const cached = cache.get("snapshot");

  return NextResponse.json({
    ok: true,
    configuredProvider: config.provider,
    configuredLive: liveConfigured(config),
    effectiveProvider: provider.id,
    effectiveSource: provider.source,
    baseUrl: config.baseUrl || null,
    cache: {
      warm: !!cached,
      ageSeconds: cached ? Math.round(cached.age / 1000) : null,
      ttlSeconds: config.cacheTtlSecs,
      entries: cache.size,
    },
    time: new Date().toISOString(),
  });
}
