"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button, EmptyState, LinkButton } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import {
  BasketIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  PackageIcon,
  PinIcon,
  TruckIcon,
} from "@/components/ui/Icons";
import {
  ORDER_STAGES,
  clockLabel,
  progressFor,
  stageFor,
  stageIndex,
  useMounted,
  useNow,
  useOrders,
  type OrderStage,
} from "@/lib/orders/store";
import { useBasket } from "@/lib/basket/store";
import { useToast } from "@/components/ui/Toast";
import { formatPKR, formatQuantityInput } from "@/lib/engine/format";

/**
 * Order tracking.
 *
 * The stage is derived from the order's own timestamp, so refreshing the page —
 * or leaving it open on stage while a presenter talks — never resets the story.
 * Timings are compressed on purpose and the screen says the order is simulated.
 */

const STAGE_ICONS: Record<OrderStage, (props: { className?: string }) => React.ReactElement> = {
  confirmed: CheckIcon,
  packing: PackageIcon,
  "out-for-delivery": TruckIcon,
  delivered: PinIcon,
};

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const { orders } = useOrders();
  const { replaceAll } = useBasket();
  const { toast } = useToast();
  const router = useRouter();
  const now = useNow(1000);
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-[46rem] px-4 py-10 sm:px-6">
        <div className="shimmer h-52 rounded-[1.75rem]" />
        <div className="shimmer mt-4 h-64 rounded-[1.75rem]" />
      </div>
    );
  }

  const order = orders.find((entry) => entry.id.toUpperCase() === id.toUpperCase());

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-[46rem] px-4 py-10 sm:px-6">
        <EmptyState
          glyph="🧾"
          title="No order with that number"
          body="Demo orders live in this browser only, so a different device or a cleared browser will not have them."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <LinkButton href="/orders">See my demo orders</LinkButton>
              <LinkButton href="/basket" variant="quiet">
                Back to basket →
              </LinkButton>
            </div>
          }
        />
      </div>
    );
  }

  const stage = stageFor(order, now);
  const index = stageIndex(stage);
  const progress = progressFor(order, now);
  const done = stage === "delivered";

  const reorder = () => {
    replaceAll(
      order.shops.flatMap((shop) =>
        shop.lines.map((line) => ({ canonicalId: line.canonicalId, quantity: line.quantity })),
      ),
    );
    toast({ title: "Added back to your basket", glyph: "🧺", tone: "save" });
    router.push("/basket");
  };

  return (
    <div className="has-dock page max-w-[76rem] lg:pt-2">
      <header className="flex items-center gap-3 pt-6">
        <Link
          href="/"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cream-300 bg-white text-forest-800 transition-colors hover:bg-cream-100"
          aria-label="Back to home"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] font-semibold leading-tight text-forest-950">
            Order {order.id}
          </h1>
          <p className="text-[0.8rem] text-sage-500">
            Placed {clockLabel(order.createdAt)} · {order.itemCount} items
          </p>
        </div>
      </header>

      {/* ------------------------------------------------- status hero */}
      <section className="mt-5 overflow-hidden rounded-[1.75rem] bg-forest-900 text-cream-50 shadow-[var(--shadow-lift)]">
        <div className="flex items-center gap-4 px-5 py-5">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-lime-500 text-forest-900"
          >
            <CheckIcon className="h-7 w-7" />
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-lime-400">
              Demo order confirmed
            </p>
            <p className="mt-1 font-display text-[1.45rem] font-semibold leading-tight">
              {done ? "Delivered — enjoy" : ORDER_STAGES[index].label}
            </p>
            <p className="mt-0.5 text-[0.8rem] text-cream-200">
              {done
                ? `${order.itemCount} items handed over at ${order.address.area}`
                : ORDER_STAGES[index].hint}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.1em] text-cream-200/70">
                {done ? "Delivered at" : "Arriving around"}
              </p>
              <p className="tabular font-display text-[1.9rem] font-semibold leading-none">
                {clockLabel(done ? order.createdAt + ORDER_STAGES[index].atMs : order.etaAt ?? order.createdAt + 42 * 60 * 1000)}
              </p>
            </div>
            <p className="text-right text-[0.76rem] text-cream-200">
              {order.slot}
              <br />
              {order.payment}
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-forest-700">
            <motion.div
              className="h-full rounded-full bg-lime-500"
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-6">
      <div className="space-y-4 lg:space-y-0">
      <section className="mt-4 space-y-3 lg:mt-0">
        {order.shops.map((shop, shopIndex) => (
          <div
            key={shop.storeId}
            className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center gap-2.5 border-b border-cream-200 px-4 py-3">
              <StoreBadge storeId={shop.storeId} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.92rem] font-semibold text-ink">{shop.storeName}</p>
                <p className="text-[0.74rem] text-sage-500">
                  {shop.lines.length} {shop.lines.length === 1 ? "item" : "items"} ·{" "}
                  {shop.deliveryKnown
                    ? shop.freeDelivery
                      ? "free delivery"
                      : `${formatPKR(shop.delivery)} delivery`
                    : "delivery not published"}
                </p>
              </div>
              <span className="tabular text-[0.92rem] font-semibold text-ink">
                {formatPKR(shop.subtotal + (shop.deliveryKnown ? shop.delivery : 0))}
              </span>
            </div>
            <ul className="divide-y divide-cream-100 px-4">
              {shop.lines.map((line) => (
                <li key={`${shop.storeId}-${line.canonicalId}`} className="flex items-center gap-3 py-3">
                  <span className="text-xl" aria-hidden="true">
                    {line.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.86rem] font-medium text-ink">
                      {line.name}
                    </span>
                    <span className="block text-[0.74rem] text-sage-500">
                      {formatQuantityInput(line.quantity)} {line.unit} · {line.packLabel}
                    </span>
                  </span>
                  <span className="tabular text-[0.86rem] font-semibold text-ink">
                    {formatPKR(line.cost)}
                  </span>
                </li>
              ))}
            </ul>
            {order.shops.length > 1 && (
              <p className="border-t border-cream-100 bg-cream-50/60 px-4 py-2 text-[0.74rem] text-sage-500">
                Order {shopIndex + 1} of {order.shops.length} — this shop packs and delivers its own
                part of the list.
              </p>
            )}
          </div>
        ))}
      </section>

      </div>

      <div className="space-y-4 lg:space-y-0 lg:sticky lg:top-24">
      {/* --------------------------------------------------- timeline */}
      <section className="mt-4 rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)] lg:mt-0">
        <ol className="relative space-y-5">
          <span
            className="absolute left-[1.05rem] top-2 bottom-2 w-0.5 rounded-full bg-cream-200"
            aria-hidden="true"
          />
          <span
            className="absolute left-[1.05rem] top-2 w-0.5 rounded-full bg-forest-500 transition-[height] duration-700 ease-[var(--ease-out-expo)]"
            aria-hidden="true"
            style={{ height: `${(index / (ORDER_STAGES.length - 1)) * 92}%` }}
          />
          {ORDER_STAGES.map((entry, position) => {
            const Icon = STAGE_ICONS[entry.id];
            const reached = position <= index;
            const current = position === index && !done;
            return (
              <li key={entry.id} className="relative flex gap-3.5">
                <span
                  className={`relative z-10 grid h-[2.1rem] w-[2.1rem] shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    reached
                      ? "border-forest-500 bg-forest-500 text-cream-50"
                      : "border-cream-300 bg-white text-sage-300"
                  } ${current ? "animate-ring" : ""}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pb-0.5">
                  <p
                    className={`text-[0.92rem] font-semibold ${
                      reached ? "text-ink" : "text-sage-400"
                    }`}
                  >
                    {entry.label}
                  </p>
                  <p className="text-[0.78rem] leading-snug text-sage-500">
                    {reached ? entry.hint : "Waiting on the step before it"}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[0.76rem] text-sage-400">
                  {reached ? clockLabel(order.createdAt + entry.atMs) : "—"}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 rounded-xl bg-cream-100 px-3 py-2 text-[0.74rem] leading-relaxed text-sage-500">
          Statuses are simulated for this demo and advance on a compressed clock. No order has been
          sent to {order.shops.map((shop) => shop.storeName).join(" or ")}.
        </p>
      </section>

      {/* --------------------------------------------------- summary */}
      <section className="mt-4 rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
        <dl className="divide-y divide-cream-200 text-[0.86rem]">
          <div className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-sage-600">Delivering to</dt>
            <dd className="text-right text-ink">
              <span className="block font-semibold">{order.address.name}</span>
              <span className="block text-[0.8rem] text-sage-600">
                {order.address.line1}, {order.address.area}
              </span>
              <span className="block text-[0.8rem] text-sage-500">{order.address.phone}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sage-600">Slot</dt>
            <dd className="font-medium text-ink">{order.slot}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sage-600">Payment</dt>
            <dd className="font-medium text-ink">{order.payment}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sage-600">Goods</dt>
            <dd className="tabular font-semibold text-ink">{formatPKR(order.goods)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sage-600">Delivery</dt>
            <dd className="tabular font-semibold text-ink">
              {order.deliveryKnown ? (order.delivery === 0 ? "Free" : formatPKR(order.delivery)) : "Not published"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 pt-3">
            <dt className="font-display text-[1.05rem] font-semibold text-forest-950">Total paid</dt>
            <dd className="tabular font-display text-[1.4rem] font-semibold text-forest-900">
              {formatPKR(order.total)}
            </dd>
          </div>
        </dl>

        {order.saved > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-save-soft px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-800 text-lime-400">
              <ClockIcon className="h-5 w-5" />
            </span>
            <p className="text-[0.84rem] leading-relaxed text-save">
              <strong className="font-display text-[1.05rem]">{formatPKR(order.saved)}</strong> less
              than the same basket at the dearest shop that had every line.
            </p>
          </div>
        )}
      </section>

      {/* --------------------------------------------------- actions */}
      {/* On a wide screen the actions sit under the summary instead of floating
          over the bottom of the window. */}
      <div className="mt-4 hidden gap-2 lg:flex">
        <Button variant="outline" className="flex-1" onClick={reorder}>
          <BasketIcon className="h-4 w-4" />
          Buy again
        </Button>
        <Button className="flex-1" onClick={() => router.push("/")}>
          Done
        </Button>
      </div>
      </div>
      </div>

      <div className="dock lg:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={reorder}>
            <BasketIcon className="h-4 w-4" />
            Buy again
          </Button>
          <Button className="flex-1" onClick={() => router.push("/")}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
