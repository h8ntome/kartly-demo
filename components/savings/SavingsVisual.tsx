"use client";

import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber, GrowBar } from "@/components/motion/Motion";
import { StoreBadge } from "@/components/brand/Logo";
import { formatPKR, formatPKRShort } from "@/lib/engine/format";
import { STORE_MAP } from "@/lib/catalog/stores";
import type { BasketPlan } from "@/lib/engine/plan";
import type { StoreId } from "@/lib/types";

/**
 * Savings, as the headline rather than the footnote.
 *
 * Every figure here is a difference between two totals the engine produced for
 * the same basket — nothing is modelled, projected or typed in. When a shop in
 * the recommended plan does not publish a delivery charge the plan is a floor,
 * so the number is labelled an estimate instead of a promise.
 */

interface Row {
  key: string;
  label: string;
  storeId?: StoreId;
  total: number;
  tone: "worst" | "single" | "plan";
  note?: string;
}

function rowsFor(plan: BasketPlan): Row[] {
  const rows: Row[] = [];
  if (plan.worstSingle) {
    rows.push({
      key: "worst",
      label: "Dearest shop that has it all",
      storeId: plan.worstSingle.storeId,
      total: plan.worstSingle.total,
      tone: "worst",
    });
  }
  if (plan.bestSingle) {
    rows.push({
      key: "single",
      label: "Best single shop",
      storeId: plan.bestSingle.storeId,
      total: plan.bestSingle.total,
      tone: "single",
      note:
        plan.bestPlan && plan.bestPlan.storeCount === 1 ? "one order covers it" : undefined,
    });
  }
  if (plan.bestPlan && plan.bestPlan.storeCount > 1) {
    rows.push({
      key: "plan",
      label: `Kartly split · ${plan.bestPlan.storeCount} shops`,
      total: plan.bestPlan.total,
      tone: "plan",
      note: `${plan.bestPlan.orders
        .map((order) => STORE_MAP[order.storeId]?.name ?? order.store.name)
        .join(" + ")}`,
    });
  }
  return rows;
}

/** Three bars, longest = most expensive, so the cheapest is visibly the shortest. */
export function PlanComparisonBars({ plan }: { plan: BasketPlan }) {
  const rows = rowsFor(plan);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => row.total), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row, index) => {
        const delta = rows[0].total - row.total;
        return (
          <li key={row.key} className="grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-center gap-2 text-[0.8rem]">
              {row.storeId ? <StoreBadge storeId={row.storeId} size="sm" /> : (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-forest-900 text-[0.6rem] font-bold text-lime-400">
                  K
                </span>
              )}
              <span
                className={`truncate ${
                  row.tone === "plan" ? "font-semibold text-forest-800" : "text-sage-600"
                }`}
              >
                {row.label}
              </span>
            </span>
            <span className="tabular shrink-0 text-right text-[0.86rem] font-semibold text-ink">
              {formatPKR(row.total)}
            </span>
            <span className="col-span-2 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <GrowBar
                  ratio={row.total / max}
                  delay={index * 0.08}
                  color={
                    row.tone === "plan"
                      ? "var(--color-forest-500)"
                      : row.tone === "single"
                        ? "var(--color-sage-300)"
                        : "var(--color-cream-300)"
                  }
                />
              </span>
              {delta > 0 && (
                <span className="tabular shrink-0 rounded-md bg-save-soft px-1.5 py-0.5 text-[0.7rem] font-bold text-save">
                  −{formatPKRShort(delta)}
                </span>
              )}
            </span>
            {row.note && (
              <span className="col-span-2 -mt-0.5 text-[0.72rem] text-sage-500">{row.note}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The donut: what share of the dearest bill you keep in your pocket. */
export function SavingsRing({
  saved,
  baseline,
  certain,
  tone = "light",
}: {
  saved: number;
  baseline: number;
  certain: boolean;
  /** "light" sits on paper, "dark" on the forest panels. */
  tone?: "light" | "dark";
}) {
  const ratio = baseline > 0 ? Math.max(0, Math.min(1, saved / baseline)) : 0;
  const size = 108;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // From motion, not matchMedia: it has to read the same on the server and the
  // first client paint, or the ring animates from the wrong place.
  const reduced = useReducedMotion();

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone === "dark" ? "rgba(253,251,245,0.16)" : "var(--color-cream-200)"}
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-lime-500)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduced ? circumference * (1 - ratio) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-center">
        <span
          className={`tabular font-display text-[1.35rem] font-semibold leading-none ${
            tone === "dark" ? "text-cream-50" : "text-forest-900"
          }`}
        >
          {Math.round(ratio * 100)}%
        </span>
        <span
          className={`mt-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] ${
            tone === "dark" ? "text-cream-200/70" : "text-sage-500"
          }`}
        >
          {certain ? "cheaper" : "est."}
        </span>
      </span>
      <span className="sr-only">
        {Math.round(ratio * 100)} percent cheaper than the dearest shop that can fill the basket
      </span>
    </div>
  );
}

/**
 * The savings headline. Used on the basket page and the order screen, so the
 * number a shopper is shown before checkout is the one they are shown after it.
 */
export function SavingsHero({ plan, compact = false }: { plan: BasketPlan; compact?: boolean }) {
  const saved = plan.savings.bestVsWorst;
  const baseline = plan.worstSingle?.total ?? 0;
  const certain = plan.savings.savingsCertain;
  if (!baseline || saved <= 0) return null;

  return (
    <section
      className="overflow-hidden rounded-3xl border border-lime-600/50 bg-white shadow-[var(--shadow-lift)]"
      aria-label="Your savings on this basket"
    >
      <div className="flex items-center gap-4 bg-forest-900 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-lime-400">
            {certain ? "You save" : "Estimated saving"}
          </p>
          <AnimatedNumber
            value={saved}
            format="pkr"
            className="mt-1 block font-display text-[2.1rem] font-semibold leading-none tracking-[-0.03em] text-cream-50"
          />
          <p className="mt-1.5 text-[0.76rem] leading-snug text-cream-200">
            on this basket vs {plan.worstSingle?.store.name} — the dearest shop that has every line
          </p>
        </div>
        <SavingsRing saved={saved} baseline={baseline} certain={certain} tone="dark" />
      </div>

      {!compact && (
        <div className="px-5 py-4">
          <PlanComparisonBars plan={plan} />
          {!certain && (
            <p className="mt-3 text-[0.74rem] leading-relaxed text-sage-500">
              {plan.savings.deliveryUnknownStores
                .map((storeId) => plan.quotes.find((quote) => quote.storeId === storeId)?.store.name ?? storeId)
                .join(", ")}{" "}
              {plan.savings.deliveryUnknownStores.length === 1 ? "does" : "do"} not publish a
              delivery charge, so it is not counted and the real gap may be smaller.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** What the saving is actually made of — price spread, delivery, offers. */
export function SavingsBreakdown({ plan }: { plan: BasketPlan }) {
  const rows = [
    {
      label: "Price gap between shops",
      value: plan.savings.bestVsWorst,
      tone: "save" as const,
    },
    ...(plan.savings.promoValue > 0
      ? [{ label: "Offers applied", value: plan.savings.promoValue, tone: "save" as const }]
      : []),
    {
      label: "Delivery on the cheapest plan",
      value: plan.savings.deliveryPaid,
      tone: plan.savings.deliveryPaid > 0 ? ("spend" as const) : ("muted" as const),
    },
  ];

  return (
    <dl className="divide-y divide-cream-200 text-[0.86rem]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-sage-600">{row.label}</dt>
          <dd
            className={`tabular font-semibold ${
              row.tone === "save"
                ? "text-save"
                : row.tone === "spend"
                  ? "text-spend"
                  : "text-sage-500"
            }`}
          >
            {row.tone === "save" ? "−" : ""}
            {row.value === 0 ? "none" : formatPKR(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
