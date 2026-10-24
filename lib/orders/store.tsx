"use client";

import type { StoreId } from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Demo orders.
 *
 * Kartly has no store integrations, so nothing here sends anything to a
 * supermarket. What it does model, honestly, is the *shape* of the post-order
 * experience: an order is created from the cheapest plan, it moves through the
 * stages a grocery order moves through, and the stage is a pure function of the
 * timestamp so a refresh — or a demo that has been sitting open on stage — stays
 * consistent instead of resetting.
 *
 * Timings are compressed so the progression is visible inside a presentation.
 * The UI labels them as simulated; this file is where that is defined.
 */

export type OrderStage = "confirmed" | "packing" | "out-for-delivery" | "delivered";

export const ORDER_STAGES: Array<{
  id: OrderStage;
  label: string;
  hint: string;
  atMs: number;
}> = [
  { id: "confirmed", label: "Order confirmed", hint: "Kartly locked the prices on your list", atMs: 0 },
  { id: "packing", label: "Being picked", hint: "Each shop is packing its part of your list", atMs: 15_000 },
  { id: "out-for-delivery", label: "Out for delivery", hint: "On the way to your address", atMs: 50_000 },
  { id: "delivered", label: "Delivered", hint: "Handed over at your door", atMs: 120_000 },
];

export const ORDER_TOTAL_MS = ORDER_STAGES[ORDER_STAGES.length - 1].atMs;

export interface OrderLine {
  canonicalId: string;
  name: string;
  glyph: string;
  quantity: number;
  unit: string;
  packLabel: string;
  cost: number;
}

export interface OrderShop {
  storeId: StoreId;
  storeName: string;
  lines: OrderLine[];
  subtotal: number;
  delivery: number;
  deliveryKnown: boolean;
  freeDelivery: boolean;
}

export interface OrderAddress {
  name: string;
  phone: string;
  line1: string;
  area: string;
}

export interface DemoOrder {
  id: string;
  createdAt: number;
  address: OrderAddress;
  slot: string;
  /** Wall-clock estimate for hand-over, derived from the chosen slot. */
  etaAt: number;
  payment: string;
  shops: OrderShop[];
  goods: number;
  delivery: number;
  deliveryKnown: boolean;
  total: number;
  /** What the same basket would have cost at the dearest shop that could fill it. */
  baseline: number;
  /** baseline − total, both from the engine, never typed in. */
  saved: number;
  itemCount: number;
}

const STORAGE_KEY = "kartly.orders.v1";
const listeners = new Set<() => void>();
let cache: { raw: string; orders: DemoOrder[] } | null = null;

function sanitise(input: unknown): DemoOrder[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (order): order is DemoOrder =>
      !!order &&
      typeof order === "object" &&
      typeof (order as DemoOrder).id === "string" &&
      typeof (order as DemoOrder).createdAt === "number" &&
      Array.isArray((order as DemoOrder).shops),
  );
}

function readOrders(): DemoOrder[] {
  let raw = "";
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return [];
  }
  if (cache && cache.raw === raw) return cache.orders;
  let orders: DemoOrder[] = [];
  if (raw) {
    try {
      orders = sanitise(JSON.parse(raw));
    } catch {
      orders = [];
    }
  }
  cache = { raw, orders };
  return orders;
}

function commit(orders: DemoOrder[]): void {
  const raw = JSON.stringify(orders);
  cache = { raw, orders };
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Storage blocked: the order still exists for this page view.
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    cache = null;
    listener();
  });
  return () => listeners.delete(listener);
}

const EMPTY: DemoOrder[] = [];
const getServerSnapshot = (): DemoOrder[] => EMPTY;

export interface OrdersApi {
  orders: DemoOrder[];
  /** Newest first. */
  recent: DemoOrder[];
  place: (order: Omit<DemoOrder, "id" | "createdAt">) => DemoOrder;
  cancel: (id: string) => void;
  clear: () => void;
}

const OrdersContext = createContext<OrdersApi | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const orders = useSyncExternalStore(subscribe, readOrders, getServerSnapshot);

  const place = useCallback((input: Omit<DemoOrder, "id" | "createdAt">) => {
    const stamp = Date.now();
    const order: DemoOrder = {
      ...input,
      createdAt: stamp,
      // Short, readable, and unique enough for a demo: KRT-4F2Q.
      id: `KRT-${stamp.toString(36).slice(-4).toUpperCase()}${Math.random()
        .toString(36)
        .slice(2, 4)
        .toUpperCase()}`,
    };
    commit([order, ...readOrders()].slice(0, 20));
    return order;
  }, []);

  const cancel = useCallback((id: string) => {
    commit(readOrders().filter((order) => order.id !== id));
  }, []);

  const clear = useCallback(() => commit([]), []);

  const value = useMemo<OrdersApi>(
    () => ({
      orders,
      recent: [...orders].sort((a, b) => b.createdAt - a.createdAt),
      place,
      cancel,
      clear,
    }),
    [orders, place, cancel, clear],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders(): OrdersApi {
  const context = useContext(OrdersContext);
  if (!context) throw new Error("useOrders must be used inside <OrdersProvider>");
  return context;
}

/* ------------------------------------------------------------------ *
 * Stage derivation
 * ------------------------------------------------------------------ */

export function stageFor(order: DemoOrder, now: number): OrderStage {
  const elapsed = now - order.createdAt;
  let stage: OrderStage = ORDER_STAGES[0].id;
  for (const entry of ORDER_STAGES) if (elapsed >= entry.atMs) stage = entry.id;
  return stage;
}

export function stageIndex(stage: OrderStage): number {
  return ORDER_STAGES.findIndex((entry) => entry.id === stage);
}

export function progressFor(order: DemoOrder, now: number): number {
  return Math.max(0, Math.min(1, (now - order.createdAt) / ORDER_TOTAL_MS));
}

/** Re-renders on a fixed beat so a status timeline can tick without a timer per row. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The order worth pinning to the header: newest one still on its way. */
export function activeOrderOf(orders: DemoOrder[], now: number): DemoOrder | null {
  for (const order of [...orders].sort((a, b) => b.createdAt - a.createdAt)) {
    if (stageFor(order, now) !== "delivered") return order;
  }
  return null;
}

export function clockLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });
}

/* ------------------------------------------------------------------ *
 * Hydration guard
 * ------------------------------------------------------------------ */

const NO_SUBSCRIBE = () => () => {};
const ALWAYS_TRUE = () => true;
const ALWAYS_FALSE = () => false;

/**
 * False on the server and the first client paint, true afterwards.
 * 
 * Anything read from localStorage has to render as nothing until the browser
 * has had its say, and `useSyncExternalStore` is the one API that expresses
 * "different on the server" without a cascading setState in an effect.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(NO_SUBSCRIBE, ALWAYS_TRUE, ALWAYS_FALSE);
}
