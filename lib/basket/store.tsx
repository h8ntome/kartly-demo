"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

/**
 * Basket state.
 *
 * Deliberately tiny and dependency-free: rows of {canonicalId, quantity} kept in
 * localStorage, with the comparison engine run on top by `usePlan`. No store
 * library, because the basket is a handful of numbers and a page reload should not
 * lose them.
 *
 * localStorage is modelled as an external store rather than mirrored into
 * `useState`. That means one read path, no hydrate-then-write effect, and free
 * cross-tab sync through the `storage` event.
 */

export interface BasketRow {
  id: string;
  canonicalId: string;
  /** Quantity in the canonical product's own unit. */
  quantity: number;
}

interface BasketApi {
  rows: BasketRow[];
  /** False for the first hydration render, before the browser store was read. */
  ready: boolean;
  add: (canonicalId: string, quantity: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  replaceAll: (rows: Array<{ canonicalId: string; quantity: number }>) => void;
  quantityOf: (canonicalId: string) => number;
  lineCount: number;
}

const STORAGE_KEY = "kartly.basket.v1";

const BasketContext = createContext<BasketApi | null>(null);

function newId(): string {
  return `b${Math.random().toString(36).slice(2, 9)}`;
}

function sanitise(input: unknown): BasketRow[] {
  if (!Array.isArray(input)) return [];
  const rows: BasketRow[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const item = row as Partial<BasketRow>;
    if (typeof item.canonicalId !== "string" || !item.canonicalId) continue;
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    rows.push({
      id: typeof item.id === "string" && item.id ? item.id : newId(),
      canonicalId: item.canonicalId,
      quantity,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * The store itself
 * ------------------------------------------------------------------ */

type Listener = () => void;

const EMPTY: BasketRow[] = [];
const listeners = new Set<Listener>();
/** Parsed value keyed by the raw string, so `getSnapshot` stays referentially stable. */
let cache: { raw: string; rows: BasketRow[] } | null = null;

function readRows(): BasketRow[] {
  let raw = "";
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Storage disabled (private mode, blocked cookies): the basket still works
    // in memory for this page view.
    return EMPTY;
  }
  if (cache && cache.raw === raw) return cache.rows;
  let rows = EMPTY;
  if (raw) {
    try {
      rows = sanitise(JSON.parse(raw));
    } catch {
      rows = EMPTY;
    }
  }
  cache = { raw, rows };
  return rows;
}

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function commit(rows: BasketRow[]): void {
  const raw = JSON.stringify(rows);
  cache = { raw, rows };
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Quota or private mode: in-memory state is still correct for this tab.
  }
  emit();
}

function onStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  cache = null;
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("storage", onStorageEvent);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorageEvent);
  };
}

const getServerSnapshot = (): BasketRow[] => EMPTY;
const TRUE = true;
const FALSE = false;
const getReady = () => TRUE;
const getNotReady = () => FALSE;

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export function BasketProvider({ children }: { children: React.ReactNode }) {
  const rows = useSyncExternalStore(subscribe, readRows, getServerSnapshot);
  const ready = useSyncExternalStore(subscribe, getReady, getNotReady);

  const add = useCallback((canonicalId: string, quantity: number) => {
    const current = readRows();
    const existing = current.find((row) => row.canonicalId === canonicalId);
    commit(
      existing
        ? current.map((row) =>
            row.id === existing.id
              ? { ...row, quantity: +(row.quantity + quantity).toFixed(3) }
              : row,
          )
        : [...current, { id: newId(), canonicalId, quantity }],
    );
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    const current = readRows();
    commit(
      quantity <= 0
        ? current.filter((row) => row.id !== id)
        : current.map((row) => (row.id === id ? { ...row, quantity: +quantity.toFixed(3) } : row)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    commit(readRows().filter((row) => row.id !== id));
  }, []);

  const clear = useCallback(() => commit([]), []);

  const replaceAll = useCallback((incoming: Array<{ canonicalId: string; quantity: number }>) => {
    // Merge by product so importing a receipt tops up an existing basket
    // instead of silently discarding what the shopper already had.
    const merged = readRows().map((row) => ({ ...row }));
    for (const row of incoming) {
      const existing = merged.find((r) => r.canonicalId === row.canonicalId);
      if (existing) existing.quantity = +(existing.quantity + row.quantity).toFixed(3);
      else merged.push({ id: newId(), canonicalId: row.canonicalId, quantity: row.quantity });
    }
    commit(merged);
  }, []);

  const value = useMemo<BasketApi>(
    () => ({
      rows,
      ready,
      add,
      setQuantity,
      remove,
      clear,
      replaceAll,
      quantityOf: (canonicalId: string) =>
        rows.find((row) => row.canonicalId === canonicalId)?.quantity ?? 0,
      lineCount: rows.length,
    }),
    [rows, ready, add, setQuantity, remove, clear, replaceAll],
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketApi {
  const context = useContext(BasketContext);
  if (!context) throw new Error("useBasket must be used inside <BasketProvider>");
  return context;
}
