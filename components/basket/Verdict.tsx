"use client";

import { motion } from "motion/react";
import { Price, Tag } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { GrowBar } from "@/components/motion/Motion";
import { formatPKR, formatPKRShort, freshnessLabel } from "@/lib/engine/format";
import { STORE_MAP } from "@/lib/catalog/stores";
import type { BasketPlan, SplitPlan } from "@/lib/engine/plan";
import type { StoreQuote } from "@/lib/engine/quotes";

/**
 * The verdict.
 *
 * Three claims, each with its arithmetic visible: the cheapest single store,
 * the best two-store split, and what the same basket would cost at the dearest
 * store that could fill it. Nothing here is a rounded marketing number — every
 * figure is a total the engine actually computed.
 */

export function BestSingleCard({ plan }: { plan: BasketPlan }) {
  const quote = plan.bestSingle;
  if (!quote) {
    return (
      <div className="rounded-2xl border border-warn/25 bg-warn-soft p-5">
        <h3 className="font-display text-lg text-forest-950">No single store can fill this basket</h3>
        <p className="mt-2 text-sm leading-relaxed text-sage-600">
          At least one line is stocked by only one shop, and no shop carries everything on your list.
          The split below is the only way to buy all of it.
        </p>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-forest-300/40 bg-white shadow-[var(--shadow-lift)]"
    >
      <div className="flex items-center gap-3 border-b border-cream-200 bg-forest-900 px-5 py-3.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-lime-500 text-[0.8rem] font-bold text-forest-900">
          1
        </span>
        <h3 className="font-display text-[1.05rem] font-semibold text-cream-50">
          Cheapest single store
        </h3>
        <Tag tone="save" className="ml-auto">
          saves {formatPKRShort(plan.savings.bestVsWorst)}
        </Tag>
      </div>

      <div className="flex items-center gap-4 px-5 py-5">
        <StoreBadge storeId={quote.storeId} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold leading-tight text-forest-950">
            {quote.store.name}
          </p>
          <p className="text-[0.8rem] text-sage-500">
            {quote.store.eta} · {quote.lines.length} items
            {quote.discount > 0 && ` · offers worth ${formatPKR(quote.discount)}`}
          </p>
        </div>
        <div className="text-right">
          <Price amount={quote.total} size="lg" tone="save" />
          <p className="mt-0.5 text-[0.76rem] text-sage-500">
            {formatPKR(quote.subtotal)} +{" "}
            {quote.delivery === 0 ? (
              <span className="font-semibold text-save">free delivery</span>
            ) : (
              `${formatPKR(quote.delivery)} delivery`
            )}
          </p>
        </div>
      </div>

      {quote.gapToFree > 0 && (
        <p className="border-t border-cream-200 bg-cream-50 px-5 py-2.5 text-[0.78rem] text-sage-600">
          Add {formatPKR(quote.gapToFree)} more at {quote.store.name} to make delivery free.
        </p>
      )}
    </motion.div>
  );
}

export function SplitCard({ plan }: { plan: BasketPlan }) {
  const split = plan.split;
  if (!split) return null;

  const recommended = plan.splitRecommended && split.savingsVsSingle > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
      className={`overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-card)] ${
        recommended ? "border-lime-600/60" : "border-cream-200"
      }`}
    >
      <div className="flex items-center gap-3 border-b border-cream-200 px-5 py-3.5">
        <span
          className={`grid h-7 w-7 place-items-center rounded-full text-[0.8rem] font-bold ${
            recommended ? "bg-lime-500 text-forest-900" : "bg-cream-200 text-sage-600"
          }`}
        >
          2
        </span>
        <h3 className="font-display text-[1.05rem] font-semibold text-forest-950">
          Split across two stores
        </h3>
        <span className="ml-auto">
          {recommended ? (
            <Tag tone="save">saves {formatPKR(split.savingsVsSingle)} more</Tag>
          ) : (
            <Tag tone="warn">
              {split.savingsVsSingle > 0
                ? `only ${formatPKR(split.savingsVsSingle)} better`
                : "not worth it"}
            </Tag>
          )}
        </span>
      </div>

      <div className="divide-y divide-cream-200">
        <SplitHalf assignment={split.primary} label="Main order" />
        <SplitHalf assignment={split.secondary} label="Top-up order" />
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-cream-200 bg-cream-50 px-5 py-4">
        <div className="text-[0.8rem] text-sage-600">
          {formatPKR(split.subtotal)} goods +{" "}
          {split.delivery === 0 ? "free delivery" : `${formatPKR(split.delivery)} delivery`}
          {!plan.exact && <span className="ml-1 text-warn">· best option found</span>}
        </div>
        <Price amount={split.total} size="lg" tone={recommended ? "save" : "muted"} />
      </div>

      {!recommended && split.savingsVsSingle > 0 && (
        <p className="border-t border-cream-200 px-5 py-2.5 text-[0.78rem] leading-relaxed text-sage-600">
          Splitting saves {formatPKR(split.savingsVsSingle)} but costs a second delivery slot, so
          Kartly keeps the single-store plan as the recommendation.
        </p>
      )}
    </motion.div>
  );
}

function SplitHalf({
  assignment,
  label,
}: {
  assignment: SplitPlan["primary"];
  label: string;
}) {
  const store = STORE_MAP[assignment.storeId];
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <StoreBadge storeId={assignment.storeId} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{store?.name}</p>
          <p className="text-[0.76rem] text-sage-500">
            {label} · {assignment.lines.length} {assignment.lines.length === 1 ? "item" : "items"}
            {assignment.freeDelivery && " · free delivery"}
          </p>
        </div>
        <div className="text-right text-[0.82rem]">
          <p className="tabular font-semibold text-ink">{formatPKR(assignment.total)}</p>
          <p className="text-[0.72rem] text-sage-500">
            {assignment.delivery === 0 ? "delivery free" : `+${formatPKR(assignment.delivery)}`}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {assignment.lines.map((line) => (
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
    ...(plan.split
      ? [
          {
            label: `Best split (${STORE_MAP[plan.split.primaryStoreId]?.name} + ${STORE_MAP[plan.split.secondaryStoreId]?.name})`,
            value: plan.split.total,
            tone: plan.splitRecommended ? ("save" as const) : ("muted" as const),
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
