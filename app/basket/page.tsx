"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button, EmptyState, LinkButton } from "@/components/ui/Primitives";
import { LineEditor, AlternativeHints } from "@/components/basket/LineEditor";
import { BestPlanCard, StoreTotalsChart, SavingsLedger } from "@/components/basket/Verdict";
import { PriceMatrix } from "@/components/basket/PriceMatrix";
import { SavingsHero } from "@/components/savings/SavingsVisual";
import { SearchBox } from "@/components/search/SearchUi";
import { BasketIcon, CheckIcon, ChevronRightIcon } from "@/components/ui/Icons";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { useBasket } from "@/lib/basket/store";
import { useCatalog, usePlan } from "@/lib/basket/use-catalog";
import { EXAMPLE_BASKET } from "@/lib/catalog/dataset";
import { formatPKR, formatPKRShort } from "@/lib/engine/format";

type Tab = "plan" | "matrix" | "ledger";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "plan", label: "Cheapest plan", hint: "The cheapest way to buy it, whichever shops that is" },
  { id: "matrix", label: "Price grid", hint: "Every line at every store" },
  { id: "ledger", label: "Where it goes", hint: "Delivery counted, and what is still not published" },
];

export default function BasketPage() {
  const { rows, setQuantity, remove, clear, replaceAll, ready } = useBasket();
  const { data, loading, error, products } = useCatalog();
  const { plan } = usePlan(rows);
  const [tab, setTab] = useState<Tab>("plan");
  const router = useRouter();
  const snapshotCount = data?.stores.length ?? 6;
  const itemCount = rows.length;

  const panels = (
    <>
      <div className="flex gap-1 rounded-2xl bg-cream-200/70 p-1" role="tablist" aria-label="Basket detail">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            title={entry.hint}
            onClick={() => setTab(entry.id)}
            className={`relative flex-1 rounded-xl px-2 py-2 text-[0.78rem] font-semibold transition-colors ${
              tab === entry.id ? "text-forest-900" : "text-sage-500 hover:text-forest-800"
            }`}
          >
            {tab === entry.id && (
              <motion.span
                layoutId="basket-tab"
                className="absolute inset-0 rounded-xl bg-white shadow-[var(--shadow-card)]"
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative">{entry.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4"
        >
          {tab === "plan" && plan && (
            <>
              <BestPlanCard plan={plan} />
              <div className="rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
                <h3 className="mb-3 font-display text-[1rem] font-semibold text-forest-950">
                  All {snapshotCount} shops
                </h3>
                <StoreTotalsChart plan={plan} />
              </div>
            </>
          )}
          {tab === "matrix" && plan && (
            <div className="rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
              <h3 className="mb-1 font-display text-[1rem] font-semibold text-forest-950">
                Line by line, shop by shop
              </h3>
              <p className="mb-4 text-[0.8rem] text-sage-600">
                Green marks the cheapest shop for that line. Cheapest row-by-row is not the cheapest
                basket — that is the whole point.
              </p>
              <PriceMatrix plan={plan} products={products} />
              <p className="mt-2 text-right text-[0.72rem] text-sage-400 lg:hidden">Scroll the grid sideways →</p>
            </div>
          )}
          {tab === "ledger" && plan && (
            <div className="rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
              <h3 className="mb-2 font-display text-[1rem] font-semibold text-forest-950">
                Where the money goes
              </h3>
              <SavingsLedger plan={plan} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );

  return (
    <div className="has-dock mx-auto w-full max-w-[84rem] px-4 sm:px-6 lg:pb-4">
      <header className="flex items-end justify-between gap-4 pt-6">
        <div>
          <h1 className="text-[1.9rem] leading-[1.05] tracking-[-0.02em] text-forest-950 sm:text-[2.3rem]">
            Your basket
          </h1>
          <p className="mt-1.5 text-[0.86rem] text-sage-600">
            {itemCount > 0 ? (
              <>
                {itemCount} {itemCount === 1 ? "line" : "lines"} · priced at all {snapshotCount}{" "}
                shops
              </>
            ) : (
              `Priced at all ${snapshotCount} shops, delivery included`
            )}
          </p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={clear}
            className="rounded-full border border-cream-300 px-3 py-1.5 text-[0.78rem] font-semibold text-sage-600 transition-colors hover:border-spend/40 hover:text-spend"
          >
            Empty
          </button>
        )}
      </header>

      {error && (
        <div className="mt-6 rounded-2xl border border-spend/25 bg-spend-soft px-4 py-3 text-sm text-spend">
          The catalogue could not be loaded: {error}. Reload the page to try again.
        </div>
      )}

      {!ready || (loading && !data) ? (
        <div className="mt-6 space-y-4">
          <div className="shimmer h-40 rounded-[1.75rem]" />
          <div className="rounded-3xl border border-cream-200 bg-white p-4">
            <ListSkeleton rows={4} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 space-y-6">
          <EmptyState
            glyph="🧺"
            title="Your basket is empty"
            body="Add groceries from the catalogue, or load the example basket and watch the total move as you swap things."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  onClick={() =>
                    replaceAll(
                      EXAMPLE_BASKET.map((entry) => ({
                        canonicalId: entry.canonicalId,
                        quantity: entry.quantity,
                      })),
                    )
                  }
                >
                  Load the example basket
                </Button>
                <LinkButton href="/receipt" variant="quiet">
                  Or scan a receipt →
                </LinkButton>
              </div>
            }
          />
          <div className="mx-auto max-w-xl">
            <Suspense fallback={<div className="h-12" />}>
              <SearchBox />
            </Suspense>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
            {/* savings headline — first on a phone, right column on a desktop */}
            <div className="order-1 space-y-4 lg:order-none lg:col-start-2 lg:row-start-1">
              {plan && <SavingsHero plan={plan} />}
            </div>

            {/* the list */}
            <section className="order-2 space-y-4 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-2">
              <div className="rounded-3xl border border-cream-200 bg-white px-4 shadow-[var(--shadow-card)] sm:px-5">
                <div className="flex items-center justify-between border-b border-cream-200 py-3.5">
                  <h2 className="font-display text-[1.05rem] font-semibold text-forest-950">
                    {rows.length} {rows.length === 1 ? "line" : "lines"}
                  </h2>
                  <Link
                    href="/search"
                    className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-3 py-1.5 text-[0.8rem] font-semibold text-forest-800 transition-colors hover:bg-cream-200"
                  >
                    Add products
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <LineEditor
                  rows={rows}
                  products={products}
                  plan={plan}
                  onChange={setQuantity}
                  onRemove={remove}
                />
              </div>

              {plan && plan.alternatives.length > 0 && (
                <div className="rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
                  <h2 className="font-display text-[1.05rem] font-semibold text-forest-950">
                    Cheaper swaps worth considering
                  </h2>
                  <p className="mb-3 mt-1 text-[0.82rem] text-sage-600">
                    Same aisle, same quantity, lower price at the shop already in your plan.
                  </p>
                  <AlternativeHints plan={plan} />
                </div>
              )}

              {plan && plan.unfulfillable.length > 0 && (
                <div className="rounded-3xl border border-warn/25 bg-warn-soft p-5">
                  <h2 className="font-display text-[1rem] font-semibold text-forest-950">
                    No shop can supply {plan.unfulfillable.length === 1 ? "this" : "these"}
                  </h2>
                  <ul className="mt-2 space-y-1 text-[0.84rem] text-sage-700">
                    {plan.unfulfillable.map((item) => (
                      <li key={item.canonicalId}>
                        {item.glyph} {item.name} — out of stock everywhere right now
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* detail panels */}
            <div className="order-3 space-y-4 lg:order-none lg:col-start-2 lg:row-start-2">
              {panels}

              {plan && (
                <div className="hidden items-center justify-between gap-3 rounded-3xl bg-forest-900 px-5 py-4 text-cream-50 lg:flex">
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-[0.1em] text-lime-400">
                      Cheapest way to buy it
                    </p>
                    <p className="tabular font-display text-2xl font-semibold">
                      {formatPKR(plan.savings.bestTotal)}
                    </p>
                  </div>
                  <div className="text-right text-[0.78rem]">
                    <p className="mb-1 text-cream-200">
                      vs {formatPKRShort(plan.worstSingle?.total ?? 0)}
                    </p>
                    <Button variant="accent" onClick={() => router.push("/checkout")}>
                      Checkout
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* thumb-reachable checkout bar */}
          {plan && (
            <div className="dock lg:hidden">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-sage-500">
                    <BasketIcon className="h-3.5 w-3.5" />
                    {itemCount} {itemCount === 1 ? "line" : "lines"}
                    {plan.savings.bestDeliveryKnown ? (
                      <span className="text-save">· delivery in</span>
                    ) : (
                      <span className="text-sage-400">· delivery extra</span>
                    )}
                  </p>
                  <p className="tabular font-display text-[1.5rem] font-semibold leading-tight text-forest-950">
                    {formatPKR(plan.savings.bestTotal)}
                  </p>
                </div>
                {plan.savings.bestVsWorst > 0 && (
                  <span className="hidden items-center gap-1 rounded-full bg-save-soft px-2.5 py-1.5 text-[0.76rem] font-bold text-save sm:inline-flex">
                    <CheckIcon className="h-3.5 w-3.5" />
                    save {formatPKRShort(plan.savings.bestVsWorst)}
                  </span>
                )}
                <Button variant="accent" size="lg" onClick={() => router.push("/checkout")}>
                  Checkout
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
