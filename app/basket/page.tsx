"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Button, EmptyState, LinkButton, Skeleton, Tag } from "@/components/ui/Primitives";
import { LineEditor, AlternativeHints } from "@/components/basket/LineEditor";
import { BestPlanCard, StoreTotalsChart, SavingsLedger } from "@/components/basket/Verdict";
import { PriceMatrix } from "@/components/basket/PriceMatrix";
import { SearchBox } from "@/components/search/SearchUi";
import { useBasket } from "@/lib/basket/store";
import { useCatalog, usePlan } from "@/lib/basket/use-catalog";
import { EXAMPLE_BASKET } from "@/lib/catalog/dataset";
import { formatPKR, formatPKRShort } from "@/lib/engine/format";
import { Suspense } from "react";

type Tab = "verdict" | "matrix" | "ledger";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "verdict", label: "Cheapest plan", hint: "The cheapest way to buy it, whichever shops that is" },
  { id: "matrix", label: "Price grid", hint: "Every line at every store" },
  { id: "ledger", label: "Where it goes", hint: "Delivery paid, and what is still unknown" },
];

export default function BasketPage() {
  const { rows, setQuantity, remove, clear, replaceAll, ready } = useBasket();
  const { data, loading, error, products } = useCatalog();
  const { plan } = usePlan(rows);
  const [tab, setTab] = useState<Tab>("verdict");
  const snapshotCount = data?.stores.length ?? 6;

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2rem] leading-[1.08] text-forest-950 sm:text-[2.4rem]">
            Your shopping list
          </h1>
          <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-sage-600">
            Kartly prices this basket at all {snapshotCount} supermarkets it has prices for,
            including pack rounding, availability and delivery, then tells you the cheapest
            practical way to actually buy it.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={clear}>
              Empty basket
            </Button>
          </div>
        )}
      </header>

      {error && (
        <div className="mt-6 rounded-xl border border-spend/25 bg-spend-soft px-4 py-3 text-sm text-spend">
          The catalogue could not be loaded: {error}. This usually means the dev server restarted —
          reload the page.
        </div>
      )}

      {!ready || (loading && !data) ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 space-y-6">
          <EmptyState
            glyph="🧺"
            title="Your basket is empty"
            body="Search for groceries and add them here, or start from the example basket and see the maths immediately."
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
                  Load the example basket ({EXAMPLE_BASKET.length} items)
                </Button>
                <LinkButton href="/receipt" variant="quiet">
                  Or scan a receipt →
                </LinkButton>
              </div>
            }
          />
          <div className="mx-auto max-w-xl">
            <Suspense fallback={<div className="h-11" />}>
              <SearchBox />
            </Suspense>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
          {/* -------------------------------------------------- editor */}
          <section className="order-2 lg:order-1">
            <div className="rounded-2xl border border-cream-200 bg-white px-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between border-b border-cream-200 py-3.5">
                <h2 className="font-display text-[1.05rem] font-semibold text-forest-950">
                  {rows.length} {rows.length === 1 ? "line" : "lines"}
                </h2>
                <Suspense fallback={<span />}>
                  <Link
                    href="/search"
                    className="text-[0.82rem] font-semibold text-forest-700 hover:underline"
                  >
                    Add products →
                  </Link>
                </Suspense>
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
              <div className="mt-4 rounded-2xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
                <h2 className="font-display text-[1.05rem] font-semibold text-forest-950">
                  Cheaper swaps worth considering
                </h2>
                <p className="mb-3 mt-1 text-[0.82rem] text-sage-600">
                  Same aisle, same quantity, lower price at the store already in your plan.
                </p>
                <AlternativeHints plan={plan} />
              </div>
            )}

            {plan && plan.unfulfillable.length > 0 && (
              <div className="mt-4 rounded-2xl border border-warn/25 bg-warn-soft p-5">
                <h2 className="font-display text-[1rem] font-semibold text-forest-950">
                  No store can supply {plan.unfulfillable.length === 1 ? "this" : "these"}
                </h2>
                <ul className="mt-2 space-y-1 text-[0.84rem] text-sage-700">
                  {plan.unfulfillable.map((item) => (
                    <li key={item.canonicalId}>
                      {item.glyph} {item.name} — nothing in stock anywhere right now
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* -------------------------------------------------- verdict */}
          <aside className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-20">
              <div className="mb-4 flex gap-1 rounded-xl bg-cream-200/70 p-1" role="tablist">
                {TABS.map((entry) => (
                  <button
                    key={entry.id}
                    role="tab"
                    aria-selected={tab === entry.id}
                    title={entry.hint}
                    onClick={() => setTab(entry.id)}
                    className={`relative flex-1 rounded-lg px-2 py-2 text-[0.78rem] font-semibold transition-colors ${
                      tab === entry.id ? "text-forest-900" : "text-sage-500 hover:text-forest-800"
                    }`}
                  >
                    {tab === entry.id && (
                      <motion.span
                        layoutId="basket-tab"
                        className="absolute inset-0 rounded-lg bg-white shadow-[var(--shadow-card)]"
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
                  {tab === "verdict" && plan && (
                    <>
                      <BestPlanCard plan={plan} />
                      <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
                        <h3 className="mb-3 font-display text-[1rem] font-semibold text-forest-950">
                          All {snapshotCount} stores
                        </h3>
                        <StoreTotalsChart plan={plan} />
                      </div>
                    </>
                  )}
                  {tab === "matrix" && plan && (
                    <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
                      <h3 className="mb-1 font-display text-[1rem] font-semibold text-forest-950">
                        Line-by-line grid
                      </h3>
                      <p className="mb-4 text-[0.8rem] text-sage-600">
                        Green marks the cheapest store for that line. The cheapest row-by-row is not
                        the cheapest basket — that is the whole point.
                      </p>
                      <div className="overflow-x-auto">
                        <PriceMatrix plan={plan} products={products} />
                      </div>
                    </div>
                  )}
                  {tab === "ledger" && plan && (
                    <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
                      <h3 className="mb-2 font-display text-[1rem] font-semibold text-forest-950">
                        Where the money goes
                      </h3>
                      <SavingsLedger plan={plan} />
                      <p className="mt-3 rounded-lg bg-cream-100 px-3 py-2 text-[0.76rem] leading-relaxed text-sage-600">
                        The floor is what you would pay if every single item came from its cheapest
                        store with no delivery — impossible in practice, shown so the savings claim
                        is not flattered.
                      </p>                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {plan && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-forest-900 px-5 py-4 text-cream-50">
                  <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.1em] text-lime-400">
                      Cheapest way to buy it
                    </p>
                    <p className="font-display text-2xl font-semibold">
                      {formatPKR(plan.savings.bestTotal)}
                    </p>
                  </div>
                  <div className="text-right text-[0.78rem]">
                    <p className="text-cream-200">vs {formatPKRShort(plan.worstSingle?.total ?? 0)}</p>
                    <Tag tone="save">save {formatPKR(plan.savings.bestVsWorst)}</Tag>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
