"use client";

import Link from "next/link";
import { EmptyState, LinkButton } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { ChevronRightIcon, ReceiptIcon } from "@/components/ui/Icons";
import {
  ORDER_STAGES,
  clockLabel,
  stageFor,
  stageIndex,
  useMounted,
  useNow,
  useOrders,
} from "@/lib/orders/store";
import { formatPKR } from "@/lib/engine/format";

/**
 * Demo order history.
 *
 * Everything here came from the demo checkout and lives in this browser. It
 * exists so the tracking screen is reachable after the confirmation, which is
 * what a real app does and what a demo that forgets its own orders does not.
 */
export default function OrdersPage() {
  const { recent, clear } = useOrders();
  const now = useNow(5000);
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-[46rem] px-4 py-10 sm:px-6">
        <div className="shimmer h-24 rounded-3xl" />
        <div className="shimmer mt-3 h-24 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[46rem] px-4 pb-4 sm:px-6">
      <header className="flex items-end justify-between gap-4 pt-6">
        <div>
          <h1 className="text-[1.9rem] leading-[1.05] tracking-[-0.02em] text-forest-950 sm:text-[2.3rem]">
            Your orders
          </h1>
          <p className="mt-1.5 text-[0.86rem] text-sage-600">
            Demo orders placed in this browser · nothing was sent to the stores
          </p>
        </div>
        {recent.length > 0 && (
          <button
            onClick={clear}
            className="rounded-full border border-cream-300 px-3 py-1.5 text-[0.78rem] font-semibold text-sage-600 transition-colors hover:border-spend/40 hover:text-spend"
          >
            Clear
          </button>
        )}
      </header>

      {recent.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            glyph="🧾"
            title="No demo orders yet"
            body="Build a basket, check out, and the order will appear here with its progress."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <LinkButton href="/basket">Open the basket</LinkButton>
                <LinkButton href="/search" variant="quiet">
                  Browse products →
                </LinkButton>
              </div>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {recent.map((order) => {
            const stage = stageFor(order, now);
            const index = stageIndex(stage);
            const done = stage === "delivered";
            return (
              <li key={order.id}>
                <Link
                  href={`/order/${order.id}`}
                  className="flex items-center gap-3 rounded-3xl border border-cream-200 bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
                >
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                      done ? "bg-save-soft text-save" : "bg-forest-900 text-lime-400"
                    }`}
                  >
                    <ReceiptIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[0.92rem] font-semibold text-ink">
                        {ORDER_STAGES[index].label}
                      </span>
                      <span className="tabular shrink-0 text-[0.74rem] text-sage-400">
                        {clockLabel(order.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[0.78rem] text-sage-500">
                      {order.id} · {order.itemCount} items ·{" "}
                      {order.shops.map((shop) => shop.storeName).join(" + ")}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {order.shops.map((shop) => (
                        <StoreBadge key={shop.storeId} storeId={shop.storeId} size="sm" />
                      ))}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block font-display text-[1.05rem] font-semibold text-forest-900">
                      {formatPKR(order.total)}
                    </span>
                    <span className="mt-1 inline-flex items-center gap-0.5 text-[0.76rem] font-semibold text-forest-700">
                      Details
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
