"use client";

import { motion } from "motion/react";
import { Price, Tag } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { GrowBar } from "@/components/motion/Motion";
import { formatPKR, formatPKRShort, freshnessLabel } from "@/lib/engine/format";
import { STORE_MAP } from "@/lib/catalog/stores";
import type { BasketPlan } from "@/lib/engine/plan";
import type { MultiPlan, PlanOrder } from "@/lib/engine/multi";
import type { StoreQuote } from "@/lib/engine/quotes";

/**
 * The verdict.
 *
 * One recommendation, with its arithmetic visible: the cheapest way to buy the
 * whole basket, whichever shops that turns out to be. The shopper is not asked
 * to decide how many stores to use — the engine decides, and the only thing
 * shown is the answer plus what it beats.
 */

/** One shop's order inside the recommended plan. */
function OrderBlock({
  order,
  label,
}: {
  order: PlanOrder;
  label: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <StoreBadge storeId={order.storeId} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{order.store.name}</p>
          <p className="text-[0.76rem] text-sage-500">
            {label} · {order.lines.length} {order.lines.length === 1 ? "item" : "items"}
            {order.freeDelivery && " · free delivery"}
          </p>
        </div>
        <div className="text-right text-[0.82rem]">
          <p className="tabular font-semibold text-ink">{formatPKR(order.total)}</p>
          <p className="text-[0.72rem] text-sage-500">
            {order.delivery === 0 ? "delivery free" : `+${formatPKR(order.delivery)}`}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {order.lines.map((line) => (
          <span
            key={line.lineId}
            title={`${line.name} — ${line.choice.offer.packLabel} at ${line.choice.offer.brand}`}
            className="inline-flex items-center gap-1 rounded-lg bg-cream-100 px-2 py-1 text-[0.74rem] text-ink-soft"
          >
            <span aria-hidden="true">{line.glyph}</span>
            {line.name}
            <span className="tabular text-sage-500">{formatPKRShort(line.choice.cost)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BestPlanCard({ plan }: { plan: BasketPlan }) {
  const best: MultiPlan | null = plan.bestPlan;

  if (!best) {
    return (
      <div className="rounded-2xl border border-warn/25 bg-warn-soft p-5">
        <h3 className="font-display text-lg text-forest-950">No shop can fill this basket</h3>
        <p className="mt-2 text-sm leading-relaxed text-sage-600">
          At least one line on your list is out of stock everywhere in the catalogue right now.
          Everything else is priced below; the missing lines are listed next to your list.
        </p>
      </div>
    );
  }

  const split = best.storeCount > 1;
  const beatSingle = best.savingsVsSingle > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-lime-600/60 bg-white shadow-[var(--shadow-lift)]"
    >
      <div className="flex items-center gap-3 border-b border-cream-200 bg-forest-900 px-5 py-3.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-lime-500 text-[0.8rem] font-bold text-forest-900">
          ✓
        </span>
        <h3 className="font-display text-[1.05rem] font-semibold text-cream-50">
          Cheapest way to buy it
        </h3>
        <Tag tone="save" className="ml-auto">
          saves {formatPKRShort(plan.savings.bestVsWorst)}
        </Tag>
      </div>

      <div className="divide-y divide-cream-200">
        {best.orders.map((order, index) => (
          <OrderBlock
            key={order.storeId}
            order={order}
            label={
              best.storeCount === 1
                ? "Single order"
                : `Order ${index + 1} of ${best.storeCount}`
            }
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-cream-200 bg-cream-50 px-5 py-4">
        <div className="text-[0.8rem] text-sage-600">
          {formatPKR(best.subtotal)} goods +{" "}
          {best.delivery === 0 ? (
            <span className="font-semibold text-save">free delivery</span>
          ) : (
            `${formatPKR(best.delivery)} delivery`
          )}
          <span className="ml-1">
            across {best.storeCount} {best.storeCount === 1 ? "shop" : "shops"}
          </span>
          {!plan.exact && <span className="ml-1 text-warn">· best option found</span>}
        </div>
        <Price amount={best.total} size="lg" tone="save" />
      </div>

      {split && beatSingle && plan.bestSingle && (
        <p className="border-t border-cream-200 px-5 py-2.5 text-[0.78rem] leading-relaxed text-sage-600">
          Buying the same list at {plan.bestSingle.store.name} alone costs{" "}
          {formatPKR(plan.bestSingle.total)} — {formatPKR(best.savingsVsSingle)} more, after every
          delivery fee is counted.
        </p>
      )}
      {!split && plan.bestSingle && (
        <p className="border-t border-cream-200 px-5 py-2.5 text-[0.78rem] leading-relaxed text-sage-600">
          One shop is the cheapest answer here: splitting this list anywhere else costs more once a
          second delivery fee is added.
        </p>
      )}
      {split && !beatSingle && (
        <p className="border-t border-cream-200 px-5 py-2.5 text-[0.78rem] leading-relaxed text-sage-600">
          Splitting only just matches the best single shop on price; it is kept because it is still
          the cheapest total the engine found.
        </p>
      )}
    </motion.div>
  );
}

/**
 * Every store's total for this basket, ranked. The point of this chart is the
 * shape: two stores usually sit far below the rest, and that gap is the whole
 * product.
 */
export function StoreTotalsChart({ plan }: { plan: BasketPlan }) {
  const ranked = [...plan.quotes]
    .filter((quote) => quote.subtotal > 0)
    .sort((a, b) => rank(a) - rank(b) || a.total - b.total);
  const max = Math.max(...ranked.map((quote) => quote.total), 1);
  const bestTotal = plan.savings.bestTotal;

  return (
    <div className="space-y-2.5">
      {ranked.map((quote, index) => {
        const complete = quote.eligible;
        const isBest = complete && quote.total === bestTotal;
        return (
          <div key={quote.storeId} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
            <span className="flex items-center gap-2 truncate text-[0.82rem]">
              <StoreBadge storeId={quote.storeId} size="sm" />
              <span className={complete ? "text-ink" : "text-sage-400"}>{quote.store.name}</span>
            </span>
            <span className="relative">
              <GrowBar
                ratio={quote.total / max}
                delay={index * 0.04}
                color={
                  isBest
                    ? "var(--color-forest-500)"
                    : complete
                      ? "var(--color-sage-300)"
                      : "var(--color-cream-300)"
                }
              />
            </span>
            <span className="tabular text-right text-[0.82rem] font-semibold text-ink">
              {complete ? (
                formatPKR(quote.total)
              ) : (
                <span className="font-normal text-sage-400" title={`${quote.missing.length} items unavailable`}>
                  {quote.lines.length}/{quote.lines.length + quote.missing.length} items
                </span>
              )}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[0.74rem] text-sage-500">
        Bars include delivery. Grey bars cannot fill the whole basket — missing items are counted,
        never dropped.
      </p>
    </div>
  );
}

function rank(quote: StoreQuote): number {
  return quote.eligible ? 0 : quote.complete ? 1 : 2;
}

/** The savings ledger: what the basket costs, and what each decision is worth. */
export function SavingsLedger({ plan }: { plan: BasketPlan }) {
  const rows = [
    {
      label: "Dearest store that can fill it",
      value: plan.worstSingle?.total ?? 0,
      tone: "muted" as const,
    },
    {
      label: "Best single store",
      value: plan.bestSingle?.total ?? 0,
      tone: "default" as const,
    },
    ...(plan.bestPlan
      ? [
          {
            label:
              plan.bestPlan.storeCount === 1
                ? "Kartly's cheapest plan"
                : `Kartly's cheapest plan (${plan.bestPlan.storeCount} shops)`,
            value: plan.bestPlan.total,
            tone: "save" as const,
          },
        ]
      : []),
    {
      label: "Theoretical floor (each item at its cheapest, no delivery)",
      value: plan.cherryPick,
      tone: "muted" as const,
    },
  ];

  return (
    <dl className="divide-y divide-cream-200 text-[0.86rem]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-sage-600">{row.label}</dt>
          <dd className={`tabular font-semibold ${row.tone === "save" ? "text-save" : "text-ink"}`}>
            {formatPKR(row.value)}
          </dd>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <dt className="text-sage-600">Delivery paid on the best plan</dt>
        <dd className="tabular font-semibold text-ink">
          {plan.savings.deliveryPaid === 0 ? "none" : formatPKR(plan.savings.deliveryPaid)}
        </dd>
      </div>
      {plan.savings.promoValue > 0 && (
        <div className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-sage-600">Value of offers applied</dt>
          <dd className="tabular font-semibold text-save">−{formatPKR(plan.savings.promoValue)}</dd>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <dt className="text-sage-600">Oldest price in this plan</dt>
        <dd className="text-sage-600">{freshnessLabel(plan.oldestPriceMins)}</dd>
      </div>
    </dl>
  );
}

/** Store names for a plan, in order, e.g. "Imtiaz + Naheed". */
export function planNames(plan: MultiPlan): string {
  return plan.orders.map((order) => STORE_MAP[order.storeId]?.name ?? order.store.name).join(" + ");
}
