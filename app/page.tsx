import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getSnapshot, summarise } from "@/lib/api/index";
import { compareBasket, toBasketItems } from "@/lib/engine/plan";
import { EXAMPLE_BASKET } from "@/lib/catalog/dataset";
import { STORES } from "@/lib/catalog/stores";
import { SearchBox, ProductTile } from "@/components/search/SearchUi";
import { SavingsSpotlight } from "@/components/home/SavingsSpotlight";
import { Reveal } from "@/components/motion/Motion";
import { LinkButton } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { SearchBoxSkeleton } from "@/components/ui/Skeletons";
import {
  ChevronRightIcon,
  ReceiptIcon,
  ScanIcon,
  StoreIcon,
} from "@/components/ui/Icons";
import { formatPKR, formatQuantityInput, deliveryRuleLabel } from "@/lib/engine/format";
import {
  normaliseQuantity,
  type CatalogSummary,
  type ProductDetail,
  type StoreId,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Kartly — your shopping list, at the lowest possible cost",
};

/**
 * Home screen.
 *
 * Every number on this screen comes from the same engine the basket runs over
 * the same catalogue, computed at render time. Nothing here is typed in, which
 * is the only reason a comparison like this is worth showing anyone.
 */
export default async function HomePage() {
  const snapshot = await getSnapshot();
  const products = new Map<string, ProductDetail>(snapshot.products.map((p) => [p.id, p]));

  const rows = EXAMPLE_BASKET.map((entry, index) => ({
    id: `hero-${index}`,
    canonicalId: entry.canonicalId,
    quantity: entry.quantity,
  }));
  const plan = compareBasket(toBasketItems(rows, products), products, snapshot.stores);

  const summaries = snapshot.products.map(summarise);
  const categories = [...new Set(snapshot.products.map((product) => product.category))].sort();
  const widest = summaries
    .filter((summary) => summary.spread > 0 && summary.availableAt.length > 1)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 pb-6 sm:px-6">
      {/* ------------------------------------------------------- hero */}
      <section className="pt-6 sm:pt-10">
        <div className="flex items-center gap-2 text-[0.76rem] font-semibold text-sage-500">
          <span className="inline-flex h-5 items-center rounded-full bg-cream-200 px-2 text-forest-800">
            Karachi
          </span>
          <span>
            {snapshot.stores.length} supermarkets · {snapshot.products.length} products priced
          </span>
        </div>
        <h1 className="mt-3 max-w-[16ch] text-[2.35rem] leading-[1.02] tracking-[-0.03em] text-forest-950 sm:max-w-none sm:text-[3.4rem]">
          Your shopping list, at the <span className="text-forest-600">lowest</span> possible cost.
        </h1>
        <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-sage-600 sm:text-[1.05rem]">
          Kartly prices your whole basket at every supermarket it has prices for — pack sizes,
          availability and delivery included — then tells you the cheapest practical way to buy it.
        </p>

        <div className="mt-5 max-w-xl">
          <Suspense fallback={<SearchBoxSkeleton />}>
            <SearchBox size="lg" />
          </Suspense>
        </div>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {categories.map((category) => (
            <Link
              key={category}
              href={`/search?category=${encodeURIComponent(category)}`}
              className="inline-flex h-9 shrink-0 items-center rounded-full border border-cream-300 bg-white px-3.5 text-[0.82rem] font-medium text-ink-soft shadow-[var(--shadow-card)] transition-colors hover:border-sage-300 hover:text-forest-800"
            >
              {category}
            </Link>
          ))}
          <Link
            href="/search"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-forest-800 px-3.5 text-[0.82rem] font-semibold text-cream-50 transition-colors hover:bg-forest-700"
          >
            All products
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* --------------------------------------------------- savings */}
      <section className="mt-7">
        <SavingsSpotlight examplePlan={plan} />
      </section>

      {/* ----------------------------------------------- product rail */}
      <Rail
        title="Add to your basket"
        hint="Tap to add — the price shown is the cheapest shop that has it"
        href="/search"
        linkLabel="Browse all"
      >
        {summaries.map((summary) => (
          <ProductTile key={summary.product.id} summary={summary} />
        ))}
      </Rail>

      {/* ------------------------------------------------- price gaps */}
      {widest.length > 0 && (
        <Rail
          title="Same product, different shop"
          hint="The gap you pay for shopping at the wrong place"
          href="/search?sort=savings-desc"
          linkLabel="All gaps"
        >
          {widest.map((summary) => (
            <GapCard key={summary.product.id} summary={summary} />
          ))}
        </Rail>
      )}

      {/* ----------------------------------------------------- shops */}
      <Rail
        title="The shops"
        hint="Delivery rules are what decide the cheapest basket"
        href="/stores"
        linkLabel="Compare shops"
      >
        {STORES.map((store) => (
          <Link
            key={store.id}
            href={`/stores#${store.id}`}
            className="flex h-full flex-col rounded-3xl border border-cream-200 bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            <StoreBadge storeId={store.id} size="lg" />
            <p className="mt-3 font-display text-[1.02rem] font-semibold text-forest-950">
              {store.name}
            </p>
            <p className="mt-1 text-[0.78rem] leading-snug text-sage-600">
              {deliveryRuleLabel(store)}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-[0.78rem] font-semibold text-forest-700">
              See prices
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </Rail>

      {/* ---------------------------------------------- how it works */}
      <section className="mt-12">
        <h2 className="font-display text-[1.45rem] font-semibold text-forest-950 sm:text-[1.75rem]">
          Three steps, about a minute
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal
              as="li"
              key={step.title}
              delay={index * 0.07}
              className="rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-forest-900 font-display text-[1rem] font-semibold text-lime-500">
                {index + 1}
              </span>
              <h3 className="mt-3.5 font-display text-[1.05rem] font-semibold text-forest-950">
                {step.title}
              </h3>
              <p className="mt-1.5 text-[0.88rem] leading-relaxed text-sage-600">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* --------------------------------------------- receipt promo */}
      <Reveal className="mt-8">
        <div className="flex flex-col gap-4 overflow-hidden rounded-[1.75rem] border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cream-100 text-forest-800">
            <ScanIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[1.1rem] font-semibold text-forest-950">
              Already shopped? Scan the receipt.
            </h3>
            <p className="mt-1 text-[0.86rem] leading-relaxed text-sage-600">
              Kartly reads the bill line by line, matches it to products and prices the same list
              everywhere — so you can see what it should have cost.
            </p>
          </div>
          <div className="flex gap-2">
            <LinkButton href="/receipt" variant="primary">
              <ReceiptIcon className="h-4 w-4" />
              Scan now
            </LinkButton>
            <LinkButton href="/stores" variant="outline">
              <StoreIcon className="h-4 w-4" />
              Shops
            </LinkButton>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Building blocks
 * ------------------------------------------------------------------ */

function Rail({
  title,
  hint,
  href,
  linkLabel,
  children,
}: {
  title: string;
  hint?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-11">
      <div className="mb-3.5 flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 className="font-display text-[1.35rem] font-semibold leading-tight text-forest-950 sm:text-[1.6rem]">
            {title}
          </h2>
          {hint && <p className="mt-1 text-[0.8rem] text-sage-500">{hint}</p>}
        </div>
        {href && linkLabel && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-[0.82rem] font-semibold text-forest-700 hover:text-forest-900"
          >
            {linkLabel}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="rail">{children}</div>
    </section>
  );
}

/** The proof card: one product, the cheapest shop and the dearest shop. */
function GapCard({ summary }: { summary: CatalogSummary }) {
  const { product } = summary;
  const qty = normaliseQuantity(product.defaultQuantity, product.unit);
  const dearest = summary.worstPrice;
  const ratio = dearest > 0 ? summary.bestPrice / dearest : 1;

  return (
    <article className="flex h-full flex-col rounded-3xl border border-cream-200 bg-white p-4 shadow-[var(--shadow-card)]">
      <Link href={`/product/${product.id}`} className="flex flex-1 flex-col">
        <div className="flex items-start gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cream-100 text-[1.4rem] ring-1 ring-inset ring-cream-200"
            aria-hidden="true"
          >
            {product.glyph}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[0.88rem] font-semibold leading-snug text-ink">
              {product.name}
            </h3>
            <p className="text-[0.72rem] text-sage-500">
              {formatQuantityInput(qty.quantity)} {qty.unit}
            </p>
          </div>
        </div>

        <div className="mt-3.5 space-y-2">
          <GapRow
            storeId={summary.bestStoreId}
            price={summary.bestPrice}
            ratio={1}
            tone="save"
            caption="cheapest"
          />
          {dearest > summary.bestPrice && (
            <GapRow
              price={dearest}
              ratio={ratio}
              tone="spend"
              caption={`${formatPKR(summary.spread)} more`}
            />
          )}
        </div>

        <div className="mt-auto pt-3">
          <span className="inline-flex items-center rounded-lg bg-save-soft px-2 py-1 text-[0.76rem] font-bold text-save">
            {formatPKR(summary.spread)} apart
          </span>
        </div>
      </Link>
    </article>
  );
}

function GapRow({
  storeId,
  price,
  ratio,
  tone,
  caption,
}: {
  storeId?: StoreId;
  price: number;
  ratio: number;
  tone: "save" | "spend";
  caption: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
      {storeId ? <StoreBadge storeId={storeId} size="sm" /> : <span className="w-5" />}
      <span className="relative h-1.5 overflow-hidden rounded-full bg-cream-200">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(6, ratio * 100)}%`,
            background: tone === "save" ? "var(--color-forest-500)" : "var(--color-spend)",
            opacity: tone === "save" ? 1 : 0.55,
          }}
        />
      </span>
      <span
        className={`tabular text-[0.8rem] font-semibold ${
          tone === "save" ? "text-save" : "text-sage-500"
        }`}
      >
        {formatPKR(price)}
        <span className="ml-1 text-[0.66rem] font-medium text-sage-400">{caption}</span>
      </span>
    </div>
  );
}

const STEPS = [
  {
    title: "Build your list",
    body: "Search products and set quantities the way you think in — 5 kg, 2 pieces — or scan a photo of a receipt and let Kartly read it.",
  },
  {
    title: "Compare every shop",
    body: "Every line is priced at every shop that has it, in the pack you would actually have to buy, with unavailable lines counted as missing.",
  },
  {
    title: "Buy the cheapest plan",
    body: "Kartly returns the cheapest single shop, the best split across shops, and what each decision is worth — so you can ignore the maths.",
  },
];
