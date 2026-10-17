import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getSnapshot, summarise } from "@/lib/api/index";
import { compareBasket, toBasketItems } from "@/lib/engine/plan";
import { STARTER_BASKET } from "@/lib/catalog/sample/generate";
import { STORES } from "@/lib/catalog/stores";
import { SearchBox, ProductCard } from "@/components/search/SearchUi";
import { StoreTotalsChart, SavingsLedger } from "@/components/basket/Verdict";
import { LoadBasketCta } from "@/components/home/HeroActions";
import { AnimatedNumber, Reveal } from "@/components/motion/Motion";
import { EmptyState, LinkButton, SectionHeading, Tag } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { formatPKR, formatPKRShort, freshnessLabel } from "@/lib/engine/format";
import type { ProductDetail } from "@/lib/types";

export const metadata: Metadata = {
  title: "Kartly — your shopping list, at the lowest possible cost",
};

/**
 * Home page.
 *
 * Every number on this screen is produced by the same engine the basket page
 * runs, over the same sample catalogue. Nothing here is typed in, which is the
 * only reason a demo like this is worth showing anyone.
 */
export default async function HomePage() {
  const snapshot = await getSnapshot();
  const products = new Map<string, ProductDetail>(snapshot.products.map((p) => [p.id, p]));

  const rows = STARTER_BASKET.map((entry, index) => ({
    id: `hero-${index}`,
    canonicalId: entry.canonicalId,
    quantity: entry.quantity,
  }));
  const plan = compareBasket(toBasketItems(rows, products), products, snapshot.stores);

  // How many of the cheapest-looking totals belong to a store that cannot
  // actually fill the basket. Computed, not asserted — the copy is only as
  // honest as the number behind it.
  const incompleteStores = plan ? plan.quotes.filter((quote) => !quote.complete).length : 0;
  const cheapestAreMirages = (() => {
    if (!plan) return 0;
    let count = 0;
    for (const quote of [...plan.quotes].sort((a, b) => a.total - b.total)) {
      if (quote.complete) break;
      count += 1;
    }
    return count;
  })();

  const mirageCopy =
    cheapestAreMirages === 1
      ? "the cheapest total on that card belongs to a store that is missing something"
      : `the ${cheapestAreMirages} cheapest totals on that card all belong to stores that are missing something`;

  // The widest per-product gaps in the catalogue — the "why this exists" proof.
  const widest = snapshot.products
    .map(summarise)
    .filter((summary) => summary.spread > 0 && summary.availableAt.length > 1)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 6);

  const live = snapshot.source === "live";

  return (
    <div className="pb-4">
      {/* ------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-cream-200 bg-cream-100/60">
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-lime-300/25 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-[84rem] gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={live ? "live" : "sample"}>{live ? "Live prices" : "Sample prices"}</Tag>
              <span className="text-[0.78rem] text-sage-500">
                {snapshot.stores.length} Karachi supermarkets · {snapshot.products.length} products
              </span>
            </div>

            <h1 className="mt-5 text-[2.6rem] leading-[1.02] tracking-[-0.03em] text-forest-950 sm:text-[3.6rem]">
              Your shopping list,
              <br />
              at the <span className="text-forest-600">lowest</span>
              <br />
              possible cost.
            </h1>

            <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-sage-600">
              Kartly prices your whole basket at every supermarket in the city — pack sizes, offers,
              stock and delivery included — then tells you the cheapest practical way to buy it.
              One shop, two shops, sometimes four: you do not choose, the arithmetic does.
            </p>

            <div className="mt-7 max-w-xl">
              <Suspense fallback={<div className="h-14" />}>
                <SearchBox size="lg" />
              </Suspense>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <LoadBasketCta
                rows={STARTER_BASKET}
                label={`Try it on a ${STARTER_BASKET.length}-line monthly shop`}
              />
              <LinkButton href="/receipt" variant="outline" size="lg">
                Scan a receipt
              </LinkButton>
              <Link
                href="/search?sort=savings-desc"
                className="text-[0.9rem] font-semibold text-forest-700 hover:underline"
              >
                Or browse every price →
              </Link>
            </div>
          </div>

          {/* The verdict card, computed at render time from the sample basket. */}
          {plan && plan.bestSingle && (
            <Reveal className="w-full">
              <div className="rounded-4xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-lift)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-lime-700">
                      Example basket · {plan.items.length} lines
                    </p>
                    <p className="mt-2 font-display text-[1.05rem] text-forest-950">
                      Cheapest way to buy it
                    </p>
                    <AnimatedNumber
                      value={plan.savings.bestTotal}
                      format="pkr"
                      className="mt-1 block font-display text-[2.9rem] font-semibold leading-none tracking-[-0.03em] text-save"
                    />
                  </div>
                  <div className="rounded-xl bg-save-soft px-3 py-2 text-right">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-save">
                      vs dearest
                    </p>
                    <p className="tabular font-display text-xl font-semibold text-save">
                      −{formatPKRShort(plan.savings.bestVsWorst)}
                    </p>
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-forest-900 px-3.5 py-3">
                    <dt className="text-[0.72rem] uppercase tracking-[0.08em] text-lime-400">
                      Kartly&apos;s plan · {plan.bestPlan?.storeCount ?? 1}{" "}
                      {plan.bestPlan && plan.bestPlan.storeCount === 1 ? "shop" : "shops"}
                    </dt>
                    <dd className="mt-1 flex items-center justify-between gap-2 text-cream-50">
                      <span className="text-[0.82rem]">
                        {plan.bestPlan
                          ? snapshot.stores
                              .filter((s) => plan.bestPlan!.orders.some((order) => order.storeId === s.id))
                              .map((s) => s.name)
                              .join(" + ")
                          : "not available"}
                      </span>
                      <span className="tabular font-semibold">
                        {plan.bestPlan ? formatPKR(plan.bestPlan.total) : "—"}
                      </span>
                    </dd>
                  </div>
                  <div className="rounded-xl bg-cream-100 px-3.5 py-3">
                    <dt className="text-[0.72rem] uppercase tracking-[0.08em] text-sage-500">
                      Best single store
                    </dt>
                    <dd className="mt-1 flex items-center justify-between gap-2">
                      <StoreBadge storeId={plan.bestSingle!.storeId} size="sm" showName />
                      <span className="tabular font-semibold text-ink">
                        {formatPKR(plan.bestSingle!.total)}
                      </span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 border-t border-cream-200 pt-5">
                  <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-sage-500">
                    What this basket costs at each store
                  </p>
                  <StoreTotalsChart plan={plan} />
                </div>

                <p className="mt-4 text-[0.76rem] leading-relaxed text-sage-500">
                  Oldest price in this plan: {freshnessLabel(plan.oldestPriceMins)}.{" "}
                  {live
                    ? "Prices came from the connected feed."
                    : "Illustrative figures built for this demo — not the stores' price lists."}
                </p>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* --------------------------------------------- why one store loses */}
      <section className="mx-auto w-full max-w-[84rem] px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="The trap"
              title="The cheapest items do not make the cheapest basket"
              lead="Everyone knows which shop has cheap atta. Almost nobody knows which shop is cheap for their whole list, because the answer depends on pack rounding, offers, what is actually in stock, and a delivery fee you only see at checkout."
            />
            <div className="mt-7 space-y-4 text-[0.95rem] leading-relaxed text-sage-600">
              <p>
                On the basket to the right, {incompleteStores} of the {plan?.quotes.length ?? 9}{" "}
                stores cannot supply every line on the list, and {mirageCopy}. The store that wins is
                not the one you would have guessed.
              </p>
              <p>
                Splitting this list across {plan?.bestPlan
                  ? plan.bestPlan.storeCount === 1
                    ? "one shop"
                    : `${plan.bestPlan.storeCount} shops`
                  : "more than one shop"}{" "}
                saves {plan ? formatPKR(plan.savings.splitVsSingle) : "—"} here — but only after
                every extra delivery fee, which is exactly the arithmetic Kartly does and shoppers
                almost never do.
              </p>
            </div>
            <div className="mt-7">
              <LinkButton href="/basket" variant="primary">
                Open the basket optimiser
              </LinkButton>
            </div>
          </div>

          <Reveal className="rounded-4xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)] sm:p-7">
            <h3 className="font-display text-[1.1rem] font-semibold text-forest-950">
              Where the money goes
            </h3>
            <p className="mb-4 mt-1 text-[0.82rem] text-sage-600">
              Same basket, same nine stores, four different totals.
            </p>            {plan && <SavingsLedger plan={plan} />}
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------- how it works */}
      <section className="border-y border-cream-200 bg-cream-100/60">
        <div className="mx-auto w-full max-w-[84rem] px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="How it works"
            title="Three steps, about a minute"
            align="center"
          />
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal
                as="li"
                key={step.title}
                delay={index * 0.08}
                className="relative flex flex-col rounded-4xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-forest-900 font-display text-[1.05rem] font-semibold text-lime-500">
                  {index + 1}
                </span>
                <h3 className="mt-5 font-display text-[1.15rem] font-semibold text-forest-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-[0.92rem] leading-relaxed text-sage-600">{step.body}</p>
                <span className="mt-4 text-2xl" aria-hidden="true">
                  {step.glyph}
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------- price gaps */}
      <section className="mx-auto w-full max-w-[84rem] px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="Widest gaps"
            title="Same product, nine prices"
            lead="The six products with the largest difference between the cheapest and dearest shop right now. This spread is what a shopper absorbs silently every month."
          />
          <LinkButton href="/search?sort=savings-desc" variant="outline">
            See all gaps
          </LinkButton>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {widest.map((summary) => (
            <ProductCard key={summary.product.id} summary={summary} />
          ))}
        </div>

        {widest.length === 0 && (
          <div className="mt-10">
            <EmptyState
              glyph="🧺"
              title="No catalogue yet"
              body="The configured price source returned no products. Check /api/health for the reason."
            />
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ stores */}
      <section className="mx-auto w-full max-w-[84rem] px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="The nine"
            title="Delivery fees are the whole story"
            lead="A Rs 200 cheaper basket loses to a free-delivery threshold every time. These are the rules Kartly prices against."
          />
          <LinkButton href="/stores" variant="outline">
            Compare the stores
          </LinkButton>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STORES.map((store) => (
            <Link
              key={store.id}
              href={`/stores#${store.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-cream-200 bg-white px-4 py-3.5 transition-all duration-300 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
            >
              <StoreBadge storeId={store.id} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-forest-950">{store.name}</span>
                <span className="block text-[0.78rem] text-sage-500">
                  {store.deliveryFee === 0
                    ? "free delivery"
                    : `${formatPKR(store.deliveryFee)} · free over ${formatPKRShort(store.freeDeliveryOver)}`}
                </span>
              </span>
              <span className="text-sage-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-forest-600">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

const STEPS = [
  {
    glyph: "🧾",
    title: "Build your list",
    body: "Search products, type quantities the way you think in — 5 kg, 2 dozen — or scan a photo of a receipt and let Kartly read it.",
  },
  {
    glyph: "⚖️",
    title: "Compare nine stores",
    body: "Every line is priced at every store that stocks it, in the pack you would actually have to buy, after offers, with stock checked.",
  },
  {
    glyph: "🛒",
    title: "Buy the cheapest plan",
    body: "Kartly returns the cheapest single store, the best two-store split, and what each decision is worth — so you can ignore the maths.",
  },
];
