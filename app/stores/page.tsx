import type { Metadata } from "next";
import Link from "next/link";
import { getSnapshot } from "@/lib/api/index";
import { effectivePackPrice } from "@/lib/engine/pricing";
import { STORES } from "@/lib/catalog/stores";
import { StoreBadge } from "@/components/brand/Logo";
import { AnimatedNumber, GrowBar, Reveal } from "@/components/motion/Motion";
import { LinkButton, SectionHeading, Tag } from "@/components/ui/Primitives";
import { formatPKR, formatPKRShort, freshnessLabel } from "@/lib/engine/format";
import type { ProductDetail, StoreId } from "@/lib/types";

export const metadata: Metadata = {
  title: "Supermarkets",
  description:
    "All nine Karachi supermarkets Kartly compares, with delivery fees, free-delivery thresholds, minimum orders and how often each one is actually the cheapest.",
};

/**
 * Per-store stats, measured from the catalogue rather than asserted.
 *
 * The price index answers the question a shopper actually has — "is this shop
 * cheap *for me*?" — by pricing one unit of every product it stocks against the
 * best price that exists anywhere. 100 means it is the cheapest shop for every
 * single item; anything above is what you give up by shopping only there.
 */
interface StoreStat {
  storeId: StoreId;
  stocked: number;
  inStock: number;
  cheapestFor: number;
  /** 100 = cheapest possible on every item it carries. */
  priceIndex: number;
  /** What buying one unit of everything here would cost, PKR. */
  basketValue: number;
  bestValue: number;
  freshestMins: number;
  promos: number;
}

function buildStats(products: ProductDetail[]): StoreStat[] {
  const acc = new Map<
    StoreId,
    { stocked: number; inStock: number; cheapestFor: number; value: number; best: number; freshest: number; promos: number }
  >();
  for (const store of STORES) {
    acc.set(store.id, {
      stocked: 0,
      inStock: 0,
      cheapestFor: 0,
      value: 0,
      best: 0,
      freshest: Number.POSITIVE_INFINITY,
      promos: 0,
    });
  }

  for (const product of products) {
    // Cheapest available unit price per store, then the best anywhere.
    const perStore = new Map<StoreId, number>();
    for (const offer of product.offers) {
      if (!offer.inStock) continue;
      const unit = effectivePackPrice(offer, 1) / offer.quantity;
      const current = perStore.get(offer.storeId);
      if (current === undefined || unit < current) perStore.set(offer.storeId, unit);
    }
    const units = [...perStore.values()];
    if (!units.length) continue;
    const best = Math.min(...units);

    for (const [storeId, unit] of perStore) {
      const entry = acc.get(storeId);
      if (!entry) continue;
      entry.inStock += 1;
      entry.value += unit;
      entry.best += best;
      if (unit <= best + 0.001) entry.cheapestFor += 1;
    }

    for (const offer of product.offers) {
      const entry = acc.get(offer.storeId);
      if (!entry) continue;
      entry.stocked += 1;
      if (offer.promo) entry.promos += 1;
      entry.freshest = Math.min(entry.freshest, offer.freshnessMins);
    }
  }

  return [...acc].map(([storeId, entry]) => ({
    storeId,
    stocked: entry.stocked,
    inStock: entry.inStock,
    cheapestFor: entry.cheapestFor,
    basketValue: Math.round(entry.value),
    bestValue: Math.round(entry.best),
    priceIndex: entry.best > 0 ? (entry.value / entry.best) * 100 : 100,
    freshestMins: Number.isFinite(entry.freshest) ? entry.freshest : 0,
    promos: entry.promos,
  }));
}

export default async function StoresPage() {
  const snapshot = await getSnapshot();
  const stats = new Map(buildStats(snapshot.products).map((s) => [s.storeId, s]));
  const ranked = [...STORES].sort(
    (a, b) => (stats.get(a.id)?.priceIndex ?? 999) - (stats.get(b.id)?.priceIndex ?? 999),
  );
  const best = stats.get(ranked[0].id)!;
  const worstIndex = Math.max(...[...stats.values()].map((s) => s.priceIndex));
  const live = snapshot.source === "live";

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={live ? "live" : "sample"}>{live ? "Live prices" : "Sample prices"}</Tag>
            <span className="text-[0.78rem] text-sage-500">
              {snapshot.products.length} products · {snapshot.products.reduce((n, p) => n + p.offers.length, 0)} offers
            </span>
          </div>
          <h1 className="mt-4 text-[2.1rem] leading-[1.06] text-forest-950 sm:text-[2.7rem]">
            Nine supermarkets, priced the way you actually shop
          </h1>
          <p className="mt-4 text-[1rem] leading-relaxed text-sage-600">
            No store is cheap at everything. The table below is measured from the catalogue Kartly
            holds right now: how much each shop carries, how often it is the cheapest place for a
            product, and what it would cost to buy one unit of everything it stocks.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/basket" variant="primary">
            Price my basket
          </LinkButton>
          <LinkButton href="/search" variant="outline">
            Browse products
          </LinkButton>
        </div>
      </div>

      {/* ------------------------------------------- index leaderboard */}
      <section className="mt-10 rounded-4xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[1.25rem] font-semibold text-forest-950">
            Overall price index
          </h2>
          <p className="text-[0.78rem] text-sage-500">
            100 = the cheapest available price for every item the store carries
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {ranked.map((store, index) => {
            const stat = stats.get(store.id)!;
            // Longest bar = cheapest, so the eye reads "good" the same way it
            // does on every other chart in the app.
            const ratio = (worstIndex + 4 - stat.priceIndex) / (worstIndex + 4 - 100);
            return (
              <div key={store.id} className="grid grid-cols-[8.5rem_1fr_7.5rem] items-center gap-3 sm:grid-cols-[10rem_1fr_9rem]">
                <a
                  href={`#${store.id}`}
                  className="flex min-w-0 items-center gap-2 text-[0.86rem] hover:text-forest-700"
                >
                  <StoreBadge storeId={store.id} size="sm" />
                  <span className="truncate text-ink">{store.name}</span>
                </a>
                <GrowBar
                  ratio={Math.max(0.04, Math.min(1, ratio))}
                  delay={index * 0.05}
                  color={index === 0 ? "var(--color-forest-500)" : "var(--color-sage-300)"}
                />
                <span className="tabular text-right text-[0.86rem] font-semibold text-ink">
                  {stat.priceIndex.toFixed(1)}
                  {index === 0 && (
                    <span className="ml-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-save">
                      best
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-6 rounded-xl bg-cream-100 px-4 py-3 text-[0.82rem] leading-relaxed text-sage-600">
          <strong className="font-semibold text-forest-800">{best ? ranked[0].name : ""}</strong> is
          the cheapest overall on this catalogue, but only{" "}
          <strong className="font-semibold text-forest-800">
            {`${Math.round((best.cheapestFor / Math.max(1, best.inStock)) * 100)}%`}
          </strong>{" "}
          of individual products are cheapest there. That gap is the entire reason Kartly exists: the
          best basket is almost never bought at one shop.
        </p>
      </section>

      {/* ------------------------------------------------ store cards */}
      <div className="mt-14">
        <SectionHeading
          eyebrow="Store by store"
          title="The rules each one charges you by"
          lead="Delivery fee, the subtotal that makes it free, and the minimum order a courier will turn up for. These four numbers decide most two-store split decisions."
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {ranked.map((store, index) => {
          const stat = stats.get(store.id)!;
          return (
            <Reveal
              key={store.id}
              delay={Math.min(index * 0.05, 0.3)}
              className="scroll-mt-24"
            >
              <article
                id={store.id}
                className="flex h-full flex-col rounded-4xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <StoreBadge storeId={store.id} size="lg" />
                    <div>
                      <h3 className="font-display text-[1.3rem] font-semibold leading-tight text-forest-950">
                        {store.name}
                      </h3>
                      <p className="text-[0.8rem] text-sage-500">{store.coverage}</p>
                    </div>
                  </div>
                  <span
                    className="tabular rounded-xl px-3 py-1.5 text-[0.82rem] font-semibold"
                    style={{ background: `${store.accent}14`, color: store.accent }}
                    title="Price index — 100 is the cheapest possible"
                  >
                    index {stat.priceIndex.toFixed(1)}
                  </span>
                </div>

                <p className="mt-4 text-[0.92rem] leading-relaxed text-sage-600">{store.blurb}</p>

                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[0.86rem] sm:grid-cols-4">
                  <Stat label="Delivery" value={store.deliveryFee === 0 ? "Free" : formatPKR(store.deliveryFee)} />
                  <Stat
                    label="Free over"
                    value={store.freeDeliveryOver === 0 ? "Never" : formatPKRShort(store.freeDeliveryOver)}
                  />
                  <Stat label="Min order" value={formatPKRShort(store.minOrder)} />
                  <Stat label="Delivery" value={store.eta} wide />
                </dl>

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-cream-200 pt-4 text-[0.82rem] sm:grid-cols-4">
                  <Metric
                    value={stat.inStock}
                    label={`products in stock (${stat.stocked} listed)`}
                  />
                  <Metric value={stat.cheapestFor} label="cheapest here" />
                  <Metric value={stat.promos} label="offers running" />
                  <span>
                    <span className="block text-[0.72rem] uppercase tracking-[0.07em] text-sage-400">
                      prices
                    </span>
                    <span className="block font-semibold text-ink">
                      {freshnessLabel(stat.freshestMins)}
                    </span>
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/search?stores=${store.id}`}
                    className="inline-flex h-9 items-center rounded-lg bg-cream-100 px-3.5 text-[0.84rem] font-semibold text-forest-800 transition-colors hover:bg-cream-200"
                  >
                    Prices at {store.name}
                  </Link>
                  <Link
                    href={`/search?stores=${store.id}&sort=price-asc`}
                    className="text-[0.84rem] font-semibold text-sage-600 hover:text-forest-800"
                  >
                    Cheapest first →
                  </Link>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>

      <p className="mt-12 max-w-3xl rounded-xl bg-cream-100 px-4 py-3 text-[0.8rem] leading-relaxed text-sage-600">
        Store names are real Karachi supermarkets; the prices, fees and thresholds in this demo are{" "}
        {live ? (
          "read from the connected price source"
        ) : (
          <strong className="font-semibold text-warn">illustrative sample figures</strong>
        )}{" "}
        and are not their published price lists. None of these stores is a Kartly partner.
      </p>
    </div>
  );
}

function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[0.7rem] uppercase tracking-[0.07em] text-sage-400">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span className="block">
      <AnimatedNumber
        value={value}
        format="number"
        className="block font-display text-[1.15rem] font-semibold text-forest-900"
      />
      <span className="block text-[0.72rem] leading-snug text-sage-500">{label}</span>
    </span>
  );
}
