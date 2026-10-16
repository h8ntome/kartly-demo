"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot, DataStatusLike, ProductDetail } from "@/lib/types";
import { compareBasket, type BasketPlan } from "@/lib/engine/plan";
import { toBasketItems } from "@/lib/engine/plan";
import type { BasketRow } from "@/lib/basket/store";

/**
 * Client-side catalogue access.
 *
 * One fetch, shared by every component that mounts, then the comparison engine
 * runs locally on every basket edit. That is a deliberate choice over
 * round-tripping to /api/quote: price comparison has to feel like typing, not
 * like submitting a form. The server route still exists and runs the identical
 * engine for non-browser consumers.
 */

export type CatalogPayload = CatalogSnapshot & { status: DataStatusLike };

let inflight: Promise<CatalogPayload> | null = null;

export function loadCatalog(): Promise<CatalogPayload> {
  inflight ??= fetch("/api/catalog", { cache: "default" })
    .then((response) => {
      if (!response.ok) throw new Error(`catalog request failed (${response.status})`);
      return response.json() as Promise<CatalogPayload>;
    })
    .catch((error) => {
      // Let a later mount retry rather than caching the failure forever.
      inflight = null;
      throw error;
    });
  return inflight;
}

/** Force the next mount to refetch — wired to the "refresh prices" control. */
export function invalidateCatalog(): void {
  inflight = null;
}

interface CatalogState {
  data: CatalogPayload | null;
  loading: boolean;
  error: string | null;
  products: Map<string, ProductDetail>;
}

export function useCatalog(): CatalogState {
  const [data, setData] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // `loading` starts true, so there is nothing to set here: the effect only
    // ever settles it, which keeps the first render free of a cascading update.
    loadCatalog()
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setError(null);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const products = useMemo(
    () => new Map<string, ProductDetail>((data?.products ?? []).map((p) => [p.id, p])),
    [data],
  );

  return { data, loading, error, products };
}

export interface PlanState {
  plan: BasketPlan | null;
  loading: boolean;
  error: string | null;
}

/** Run the real comparison engine over the current basket. */
export function usePlan(rows: BasketRow[]): PlanState {
  const { data, loading, error, products } = useCatalog();

  const plan = useMemo(() => {
    if (!data || !rows.length) return null;
    const items = toBasketItems(rows, products);
    if (!items.length) return null;
    return compareBasket(items, products, data.stores);
  }, [data, rows, products]);

  return { plan, loading, error, };
}
