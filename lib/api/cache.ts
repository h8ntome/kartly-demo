/**
 * Tiny TTL cache with single-flight de-duplication and stale-while-revalidate.
 *
 * Supermarket price endpoints are slow and rate-limited; the UI wants to render
 * instantly. So a stale snapshot is always served immediately when one exists,
 * and the refresh happens in the background. That is the whole reason
 * `CatalogSnapshot.generatedAt` exists — the UI can say "prices from 4 minutes
 * ago" honestly instead of pretending a refresh just happened.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  refreshedAt: number;
}

export interface CacheOptions {
  /** Milliseconds a value stays fresh. */
  ttlMs: number;
  /** Keep serving the value this long past expiry while it revalidates. */
  staleMs?: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(private options: CacheOptions) {}

  get(key: string): { value: T; age: number; stale: boolean } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    const now = Date.now();
    const age = now - entry.refreshedAt;
    if (now <= entry.expiresAt) return { value: entry.value, age, stale: false };
    const staleLimit = entry.expiresAt + (this.options.staleMs ?? this.options.ttlMs);
    if (now <= staleLimit) return { value: entry.value, age, stale: true };
    this.store.delete(key);
    return null;
  }

  set(key: string, value: T): void {
    const now = Date.now();
    this.store.set(key, {
      value,
      refreshedAt: now,
      expiresAt: now + this.options.ttlMs,
    });
  }

  /**
   * Return a fresh value, or a stale one plus a background refresh, or (only
   * when nothing is cached yet) wait for the loader. Concurrent callers share
   * one loader call.
   */
  async wrap(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit && !hit.stale) return hit.value;

    const running = this.inflight.get(key);
    if (running) {
      if (hit) return hit.value;
      return running;
    }

    const promise = loader()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);

    if (hit) {
      // Serve stale now; let the refresh land for the next request.
      promise.catch(() => undefined);
      return hit.value;
    }
    return promise;
  }

  /** Force the next `wrap` to miss. Used by the "refresh prices" control. */
  invalidate(key?: string): void {
    if (key) this.store.delete(key);
    else this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** GlobalThis pin: Next dev hot-reload would otherwise drop the cache. */
declare global {
  var __kartlyCaches: Map<string, TtlCache<unknown>> | undefined;
}

export function sharedCache<T>(key: string, options: CacheOptions): TtlCache<T> {
  globalThis.__kartlyCaches ??= new Map<string, TtlCache<unknown>>();
  const caches = globalThis.__kartlyCaches;
  let cache = caches.get(key) as TtlCache<T> | undefined;
  if (!cache) {
    cache = new TtlCache<T>(options);
    caches.set(key, cache);
  }
  return cache;
}
