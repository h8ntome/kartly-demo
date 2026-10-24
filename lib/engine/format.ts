/** Display formatting. PKR everywhere — this is a Karachi product. */

import type { Store } from "@/lib/types";
import type { DeliveryStatus } from "@/lib/engine/pricing";

export function formatPKR(amount: number): string {
  const value = Math.round(amount);
  const sign = value < 0 ? "−" : "";
  return `${sign}Rs ${Math.abs(value).toLocaleString("en-PK")}`;
}

/** Compact form for chips and axes: Rs 12.4k. */
export function formatPKRShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 100_000) return `${sign}Rs ${Math.round(abs / 1000)}k`;
  if (abs >= 10_000) {
    const tenths = (abs / 1000).toFixed(1).replace(/\.0$/, "");
    return `${sign}Rs ${tenths}k`;
  }
  return `${sign}Rs ${Math.round(abs).toLocaleString("en-PK")}`;
}

/** Digits only, for tabular alignment: 12,480 */
export function formatNumber(amount: number): string {
  return Math.round(amount).toLocaleString("en-PK");
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/**
 * "42m ago" — derived from an integer, never from `new Date()`, so server
 * prerender and client hydration always print the same string. Returns null
 * when no price reported an age, because "unknown" is not the same as "now".
 */
export function freshnessLabel(mins?: number | null): string | null {
  if (mins === null || mins === undefined) return null;
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export type FreshnessTone = "fresh" | "recent" | "stale";

export function freshnessTone(mins: number): FreshnessTone {
  if (mins <= 60) return "fresh";
  if (mins <= 240) return "recent";
  return "stale";
}

export function formatQuantityInput(quantity: number): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/\.?0+$/, "");
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-PK")} ${count === 1 ? singular : plural}`;
}

/* ------------------------------------------------------------------ *
 * Delivery rules, in words
 * ------------------------------------------------------------------ */

/**
 * The store's published delivery rule. Anything we were not told stays a
 * statement of ignorance rather than a friendly zero.
 */
export function deliveryRuleLabel(store: Store): string {
  const freeOver = store.freeDeliveryOver;
  const fee = store.deliveryFee;
  if (freeOver !== null && fee === null) {
    return `Free delivery above ${formatPKR(freeOver)}; below that the fee is not published`;
  }
  if (freeOver !== null && fee !== null) {
    return `Free delivery above ${formatPKR(freeOver)}, otherwise ${formatPKR(fee)}`;
  }
  if (fee !== null) return `${formatPKR(fee)} delivery`;
  return "Delivery not published";
}

/** What delivery costs on one specific order. */
export function deliveryLineLabel(delivery: { status: DeliveryStatus; fee?: number }): string {
  if (delivery.status === "free") return "free delivery";
  if (delivery.status === "unknown") return "delivery not published";
  if (delivery.status === "charged") return `${formatPKR(delivery.fee ?? 0)} delivery`;
  return "no order";
}

/** Short form for table columns and chips. */
export function deliveryShortLabel(delivery: { status: DeliveryStatus; fee?: number }): string {
  if (delivery.status === "free") return "free delivery";
  if (delivery.status === "unknown") return "no published fee";
  if (delivery.status === "charged") return `+${formatPKRShort(delivery.fee ?? 0)} delivery`;
  return "—";
}
