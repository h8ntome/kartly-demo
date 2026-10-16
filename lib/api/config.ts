/**
 * Environment-driven configuration for the price-source layer.
 *
 * Nothing here is a secret and no secret is ever read into the client bundle:
 * `KARTLY_API_KEY` is only ever touched inside route handlers, which run on the
 * server. `NEXT_PUBLIC_*` is deliberately absent from this file.
 */

export interface ApiConfig {
  /** "sample" (default) or "rest". */
  provider: "sample" | "rest";
  baseUrl: string;
  /** Path appended to baseUrl for the catalogue. */
  productsPath: string;
  /** Path appended to baseUrl for store metadata. */
  storesPath: string;
  /** Header name the key travels in; some gateways want X-Api-Key. */
  keyHeader: string;
  keyScheme: "bearer" | "raw" | "none";
  apiKey: string;
  timeoutMs: number;
  retries: number;
  /** Seconds a catalogue snapshot stays fresh. */
  cacheTtlSecs: number;
  /** Extra header names/values, comma separated "X-Tenant:karachi". */
  extraHeaders: Record<string, string>;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseExtraHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/**
 * Read configuration. Called per request rather than at module load so a
 * long-lived server picks up changes without a redeploy, and so importing this
 * from a client component can never happen by accident.
 */
export function apiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const provider = env.KARTLY_API_PROVIDER === "rest" ? "rest" : "sample";
  return {
    provider,
    baseUrl: (env.KARTLY_API_BASE_URL ?? "").replace(/\/+$/, ""),
    productsPath: env.KARTLY_API_PRODUCTS_PATH ?? "/catalog",
    storesPath: env.KARTLY_API_STORES_PATH ?? "/stores",
    keyHeader: env.KARTLY_API_KEY_HEADER ?? "Authorization",
    keyScheme: (env.KARTLY_API_KEY_SCHEME as ApiConfig["keyScheme"]) ?? "bearer",
    apiKey: env.KARTLY_API_KEY ?? "",
    timeoutMs: int(env.KARTLY_API_TIMEOUT_MS, 8000),
    retries: int(env.KARTLY_API_RETRIES, 2),
    cacheTtlSecs: int(env.KARTLY_API_CACHE_TTL_SECS, 300),
    extraHeaders: parseExtraHeaders(env.KARTLY_API_EXTRA_HEADERS),
  };
}

/** True when a live source is configured *and* usable. */
export function liveConfigured(config = apiConfig()): boolean {
  return config.provider === "rest" && config.baseUrl.length > 0;
}
