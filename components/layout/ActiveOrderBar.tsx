"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { activeOrderOf, clockLabel, stageFor, useNow, useOrders } from "@/lib/orders/store";
import { TruckIcon } from "@/components/ui/Icons";

/**
 * The "you have an order on the way" strip.
 *
 * Every delivery app pins the live order to the top of the app; it is the one
 * piece of state a shopper actually returns to check. It disappears the moment
 * the order is delivered, and never appears on the order screen itself.
 */
export function ActiveOrderBar() {
  const { orders } = useOrders();
  const pathname = usePathname();
  const now = useNow(2000);
  const order = activeOrderOf(orders, now);

  const visible = !!order && !pathname.startsWith("/order/");

  return (
    <AnimatePresence>
      {visible && order && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden border-b border-forest-800/15 bg-forest-800"
        >
          <Link
            href={`/order/${order.id}`}
            className="mx-auto flex w-full max-w-[84rem] items-center gap-3 px-4 py-2.5 text-cream-50 sm:px-6"
          >
            <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest-700 text-lime-400">
              <TruckIcon className="h-4 w-4" />
              <span className="animate-ring absolute inset-0 rounded-full" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.84rem] font-semibold">
                {stageLabel(stageFor(order, now))}
              </span>
              <span className="block truncate text-[0.74rem] text-cream-200">
                <span className="hidden sm:inline">Order {order.id} · </span>
                {order.itemCount} items · arriving{" "}
                {clockLabel(order.etaAt ?? order.createdAt + 42 * 60 * 1000)}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-lime-500 px-3 py-1.5 text-[0.76rem] font-bold text-forest-900">
              Track
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "packing":
      return "Your shops are packing your list";
    case "out-for-delivery":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
    default:
      return "Order confirmed";
  }
}
