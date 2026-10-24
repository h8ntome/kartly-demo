"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useBasket } from "@/lib/basket/store";
import {
  BasketIcon,
  HomeIcon,
  ScanIcon,
  SearchIcon,
  StoreIcon,
} from "@/components/ui/Icons";

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/basket", label: "Basket", Icon: BasketIcon, badge: true },
  { href: "/stores", label: "Stores", Icon: StoreIcon },
  { href: "/receipt", label: "Scan", Icon: ScanIcon },
];

/**
 * The bottom tab bar.
 *
 * It is the single strongest signal that this is an app and not a website with
 * a hamburger menu, so it is present on every screen, never scrolls away, and
 * respects the home-indicator area on a notched phone.
 */
export function TabBar() {
  const pathname = usePathname();
  const { lineCount } = useBasket();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-cream-200 bg-cream-50/92 backdrop-blur-xl supports-[backdrop-filter]:bg-cream-50/78 md:hidden"
      style={{ paddingBottom: "var(--safe-b)" }}
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-lg items-stretch justify-between px-2">
        {TABS.map(({ href, label, Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex h-full flex-col items-center justify-center gap-1 rounded-2xl text-[0.66rem] font-semibold tracking-wide transition-colors"
              >
                <span
                  className={`relative grid h-8 w-14 place-items-center rounded-full transition-colors ${
                    active ? "text-forest-900" : "text-sage-500"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      className="absolute inset-0 rounded-full bg-lime-500/20"
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <Icon className={`relative h-[1.35rem] w-[1.35rem] ${active ? "text-forest-700" : ""}`} />
                  {badge && lineCount > 0 && (
                    <motion.span
                      key={lineCount}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="tabular absolute -right-0.5 top-0.5 grid h-[1.05rem] min-w-[1.05rem] place-items-center rounded-full bg-forest-800 px-1 text-[0.6rem] font-bold text-lime-300"
                    >
                      {lineCount}
                    </motion.span>
                  )}
                </span>
                <span className={active ? "text-forest-900" : "text-sage-500"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
