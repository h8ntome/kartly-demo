"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { useBasket } from "@/lib/basket/store";
import { formatPKRShort } from "@/lib/engine/format";
import type { BasketPlan } from "@/lib/engine/plan";
import { usePlan } from "@/lib/basket/use-catalog";
import { BasketIcon, ReceiptIcon, SparkIcon } from "@/components/ui/Icons";

const NAV = [
  { href: "/search", label: "Search", short: "Search" },
  { href: "/basket", label: "Basket", short: "Basket" },
  { href: "/stores", label: "Stores", short: "Stores" },
  // "Receipt scan" is the honest name but it is the first thing to break a
  // tablet-width header, so the short form carries md and the full one returns
  // once there is room for it.
  { href: "/receipt", label: "Receipt scan", short: "Scan" },
];

/**
 * Live "you are saving" chip.
 *
 * It reads the same plan the basket page computes, so the number in the header
 * and the number on the page can never disagree — the fastest way to lose trust
 * in a price-comparison product is two different totals on one screen.
 */
function SavingsChip({ plan }: { plan: BasketPlan | null }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!plan?.bestSingle) return null;
  // Always measured against the dearest store that could actually fill the
  // basket, so the claim is "vs shopping badly", never vs an imaginary price.
  // When a delivery charge is unknown the gap is an estimate, not a promise.
  const shown = plan.savings.bestVsWorst;
  const certain = plan.savings.savingsCertain;

  return (
    <Link
      href="/basket"
      aria-label={`Saved ${formatPKRShort(shown)} on your basket, open the basket`}
      className="relative"
      onMouseEnter={() => {
        if (timer.current) clearTimeout(timer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        timer.current = setTimeout(() => setOpen(false), 140);
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <motion.span
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-1.5 rounded-full bg-save-soft px-2.5 py-1.5 text-[0.78rem] font-semibold text-save ring-1 ring-inset ring-forest-300/40 sm:px-3"
      >
        <SparkIcon className="h-4 w-4" />
        <span className="tabular">
          {certain ? "Save " : "Est. "}
          {formatPKRShort(shown)}
        </span>
        <AnimatePresence>
          {open && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 top-[calc(100%+8px)] z-50 hidden w-64 rounded-xl border border-cream-200 bg-white p-3 text-left text-[0.76rem] font-normal text-sage-600 shadow-[var(--shadow-lift)] sm:block"
            >
              Cheapest plan
              {plan.bestPlan
                ? ` (${plan.bestPlan.storeCount} ${plan.bestPlan.storeCount === 1 ? "shop" : "shops"})`
                : ""}
              {": "}
              <strong className="text-ink">{formatPKRShort(plan.savings.bestTotal)}</strong>
              {plan.bestPlan && plan.bestPlan.storeCount > 1 && plan.bestSingle && (
                <>
                  <br />
                  Best single store:{" "}
                  <strong className="text-ink">{formatPKRShort(plan.bestSingle.total)}</strong>
                  {` — ${formatPKRShort(plan.bestPlan.savingsVsSingle)} more`}
                </>
              )}
              <br />
              Same list at the dearest store that stocks it:{" "}
              <strong className="text-ink">{formatPKRShort(plan.worstSingle?.total ?? 0)}</strong>
              {!certain && (
                <>
                  <br />*{" "}
                  {plan.savings.deliveryUnknownStores.length === 1
                    ? "One shop in the plan does not publish a delivery charge"
                    : "Some shops in the plan do not publish a delivery charge"}
                  , so the real total may be higher.
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { lineCount, rows } = useBasket();
  const { plan } = usePlan(rows);

  return (
    <header className="sticky top-0 z-50 border-b border-cream-200/80 bg-cream-50/88 backdrop-blur-xl supports-[backdrop-filter]:bg-cream-50/72">
      <div className="mx-auto flex h-14 w-full max-w-[84rem] items-center gap-3 px-4 sm:px-6 md:h-16 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="Kartly home">
          <Logo />
        </Link>

        <nav
          className="ml-2 hidden min-w-0 flex-nowrap items-center gap-1 md:flex lg:ml-4"
          aria-label="Main"
        >
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:px-3 ${
                  active ? "text-forest-900" : "text-sage-600 hover:text-forest-800"
                }`}
              >
                <span className="hidden lg:inline">{item.label}</span>
                <span className="lg:hidden">{item.short}</span>
                {active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-lime-500"
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          <SavingsChip plan={plan} />
          <Link
            href="/orders"
            className="grid h-10 w-10 place-items-center rounded-full border border-cream-300 bg-white text-forest-800 transition-colors hover:bg-cream-100"
            aria-label="Your orders"
          >
            <ReceiptIcon className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/basket"
            className="relative inline-flex h-10 items-center gap-2 rounded-full bg-forest-800 px-3.5 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-700 active:scale-[0.97]"
            aria-label={`Basket, ${lineCount} ${lineCount === 1 ? "item" : "items"}`}
          >
            <BasketIcon className="h-[18px] w-[18px]" />
            <AnimatePresence mode="popLayout">
              {lineCount > 0 && (
                <motion.span
                  key={lineCount}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                  className="tabular min-w-5 rounded-full bg-lime-500 px-1.5 text-[0.72rem] font-bold text-forest-900"
                >
                  {lineCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>
      </div>
    </header>
  );
}
