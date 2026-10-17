"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { useBasket } from "@/lib/basket/store";
import type { DataStatusLike } from "@/lib/types";
import { formatPKRShort } from "@/lib/engine/format";
import type { BasketPlan } from "@/lib/engine/plan";
import { useCatalog, usePlan } from "@/lib/basket/use-catalog";

const NAV = [
  { href: "/search", label: "Search" },
  { href: "/basket", label: "Basket" },
  { href: "/stores", label: "Stores" },
  { href: "/receipt", label: "Receipt scan" },
];

/**
 * Live "you are saving" pill.
 *
 * It reads the same plan the basket page computes, so the number in the header
 * and the number on the page can never disagree — the fastest way to lose trust
 * in a price-comparison product is two different totals on one screen.
 */
function SavingsPill({ plan }: { plan: BasketPlan | null }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!plan?.bestSingle) return null;
  // Always measured against the dearest store that could actually fill the
  // basket, so the claim is "vs shopping badly", never vs an imaginary price.
  const shown = plan.savings.bestVsWorst;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative hidden items-center gap-2 rounded-full bg-save-soft px-3 py-1.5 text-[0.78rem] font-semibold text-save ring-1 ring-inset ring-forest-300/40 sm:inline-flex"
      onMouseEnter={() => {
        if (timer.current) clearTimeout(timer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        timer.current = setTimeout(() => setOpen(false), 140);
      }}
      tabIndex={0}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-save" />
      Save {formatPKRShort(shown)}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 block w-64 rounded-xl border border-cream-200 bg-white p-3 text-left text-[0.76rem] font-normal text-sage-600 shadow-[var(--shadow-lift)]"
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
                Best single store: <strong className="text-ink">{formatPKRShort(plan.bestSingle.total)}</strong>
                {` — ${formatPKRShort(plan.bestPlan.savingsVsSingle)} more`}
              </>
            )}
            <br />
            Buying everything at the dearest store that stocks it:{" "}
            <strong className="text-ink">{formatPKRShort(plan.worstSingle?.total ?? 0)}</strong>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

export function DataBadge({ status }: { status?: DataStatusLike }) {
  const live = status?.source === "live";
  return (
    <span
      title={
        status?.note ??
        "Illustrative Karachi prices for demonstration. Not live store data."
      }
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.07em] ${
        live ? "bg-forest-800 text-lime-400" : "sample-hatch bg-warn-soft text-warn ring-1 ring-inset ring-warn/20"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "bg-lime-400" : "bg-warn"}`}
        aria-hidden="true"
      />
      {live ? "Live prices" : "Sample data"}
    </span>
  );
}

export function SiteHeader({ status }: { status?: DataStatusLike }) {
  const pathname = usePathname();
  const { lineCount } = useBasket();
  const { data } = useCatalog();
  const { rows } = useBasket();
  const { plan } = usePlan(rows);
  const [menuOpen, setMenuOpen] = useState(false);

  const effectiveStatus = status ?? data?.status;

  return (
    <header className="sticky top-0 z-50 border-b border-cream-200/80 bg-cream-50/85 backdrop-blur-xl supports-[backdrop-filter]:bg-cream-50/70">
      <div className="mx-auto flex h-16 w-full max-w-[84rem] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Kartly home">
          <Logo />
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "text-forest-900" : "text-sage-600 hover:text-forest-800"
                }`}
              >
                {item.label}
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

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <SavingsPill plan={plan} />
          <DataBadge status={effectiveStatus} />
          <Link
            href="/basket"
            className="relative inline-flex h-10 items-center gap-2 rounded-xl bg-forest-800 px-3.5 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-700"
            aria-label={`Basket, ${lineCount} items`}
          >
            <BasketIcon />
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
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-cream-300 text-forest-900 md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
          >
            <span className="sr-only">Menu</span>
            <span className="space-y-1">
              <span className={`block h-0.5 w-4 bg-current transition-transform ${menuOpen ? "translate-y-1.5 rotate-45" : ""}`} />
              <span className={`block h-0.5 w-4 bg-current ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 w-4 bg-current transition-transform ${menuOpen ? "-translate-y-1.5 -rotate-45" : ""}`} />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-cream-200 bg-cream-50 md:hidden"
            aria-label="Mobile"
          >
            <div className="flex flex-col px-4 py-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-cream-200/70 py-3 text-[0.95rem] font-medium text-ink-soft last:border-0"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function BasketIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden="true">
      <path
        d="M4 8h16l-1.4 10.2A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.8L4 8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.5 8V6.6a3.5 3.5 0 0 1 7 0V8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
