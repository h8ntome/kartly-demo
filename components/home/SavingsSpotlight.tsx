"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/motion/Motion";
import { SavingsRing } from "@/components/savings/SavingsVisual";
import { Button } from "@/components/ui/Primitives";
import { useBasket } from "@/lib/basket/store";
import { usePlan } from "@/lib/basket/use-catalog";
import { formatPKR, formatPKRShort } from "@/lib/engine/format";
import { STORE_MAP } from "@/lib/catalog/stores";
import { EXAMPLE_BASKET } from "@/lib/catalog/dataset";
import { ChevronRightIcon, SparkIcon } from "@/components/ui/Icons";
import type { BasketPlan } from "@/lib/engine/plan";

/**
 * The savings spotlight on the home screen.
 *
 * It shows the live basket when there is one and the worked example when there
 * is not, so the first thing a visitor sees is a real number from the engine
 * rather than a marketing statistic. The example plan is computed on the server
 * and handed in, which is what keeps the prerendered HTML carrying a figure
 * instead of a placeholder.
 */
export function SavingsSpotlight({
  examplePlan,
}: {
  examplePlan: BasketPlan | null;
}) {
  const { rows, clear, replaceAll } = useBasket();
  const { plan: livePlan } = usePlan(rows);
  const router = useRouter();

  const usingExample = rows.length === 0;
  const plan = usingExample ? examplePlan : livePlan ?? examplePlan;
  if (!plan?.bestSingle || !plan.bestPlan) return null;

  const saved = plan.savings.bestVsWorst;
  const certain = plan.savings.savingsCertain;
  const shops = plan.bestPlan.orders
    .map((order) => STORE_MAP[order.storeId]?.name ?? order.store.name)
    .join(" + ");

  const openBasket = () => {
    if (usingExample) {
      // "Try this basket" means load it, not admire it from here.
      clear();
      replaceAll(EXAMPLE_BASKET.map((entry) => ({ ...entry })));
    }
    router.push("/basket");
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-[1.75rem] bg-forest-900 text-cream-50 shadow-[var(--shadow-lift)]"
      aria-label="What Kartly saves on this basket"
    >
      <div className="flex items-start gap-4 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-lime-400">
            <SparkIcon className="h-3.5 w-3.5" />
            {usingExample ? "Example basket · Kartly found" : "Your basket · Kartly found"}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <AnimatedNumber
              value={saved}
              format="pkr"
              className="font-display text-[2.5rem] font-semibold leading-none tracking-[-0.03em] text-lime-400"
            />
            <span className="text-[0.82rem] text-cream-200">
              {certain ? "cheaper" : "est. cheaper"}
            </span>
          </p>
          <p className="mt-1.5 text-[0.82rem] leading-snug text-cream-200">
            than buying the same {plan.items.length} lines at{" "}
            {plan.worstSingle?.store.name ?? "the dearest shop"} — {plan.bestPlan.storeCount}{" "}
            {plan.bestPlan.storeCount === 1 ? "order" : "orders"}, delivery counted wherever the
            shop publishes a charge.
          </p>
        </div>
        <SavingsRing saved={saved} baseline={plan.worstSingle?.total ?? 0} certain={certain} tone="dark" />
      </div>

      <div className="grid grid-cols-2 gap-px bg-forest-700/60">
        <div className="bg-forest-900 px-5 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-cream-200/70">
            Cheapest total
          </p>
          <p className="tabular mt-0.5 font-display text-[1.15rem] font-semibold">
            {formatPKR(plan.savings.bestTotal)}
          </p>
        </div>
        <div className="bg-forest-900 px-5 py-3">
          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-cream-200/70">
            From {plan.bestPlan.storeCount} {plan.bestPlan.storeCount === 1 ? "shop" : "shops"}
          </p>
          <p className="mt-0.5 truncate text-[0.86rem] font-semibold">{shops}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 py-4">
        <Button variant="accent" className="flex-1" onClick={openBasket}>
          {usingExample ? `Try this ${plan.items.length}-line basket` : "Open my basket"}
          <span className="tabular ml-1 opacity-80">{formatPKRShort(plan.savings.bestTotal)}</span>
        </Button>
        <Link
          href="/search?sort=savings-desc"
          className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-[0.84rem] font-semibold text-cream-50 ring-1 ring-inset ring-cream-50/25 transition-colors hover:bg-forest-800"
        >
          Price gaps
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>

      {usingExample && (
        <p className="border-t border-forest-700/60 px-5 py-2.5 text-[0.72rem] text-cream-200/80">
          Same {plan.items.length} lines, priced at all {plan.quotes.length} shops — swap any product
          and the number follows.
        </p>
      )}
    </motion.section>
  );
}
