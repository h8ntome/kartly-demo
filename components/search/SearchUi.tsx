"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button, Chip, Price } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { useBasket } from "@/lib/basket/store";
import { formatPKR, formatPKRShort, formatQuantityInput } from "@/lib/engine/format";
import { effectivePackPrice } from "@/lib/engine/pricing";
import { normaliseQuantity } from "@/lib/types";
import type { CatalogSummary, Store } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Search box
 * ------------------------------------------------------------------ */

export function SearchBox({
  autoFocus = false,
  size = "md",
  placeholder = "Search groceries — rice, atta, chicken, shampoo…",
}: {
  autoFocus?: boolean;
  size?: "md" | "lg";
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    if (pathname !== "/search") next.delete("category");
    router.push(`/search?${next.toString()}`);
  };

  return (
    <form onSubmit={submit} className="relative w-full" role="search">
      <label htmlFor="kartly-search" className="sr-only">
        Search grocery products
      </label>
      <svg
        viewBox="0 0 24 24"
        className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sage-400 ${size === "lg" ? "h-5 w-5" : "h-4 w-4"}`}
        fill="none"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        id="kartly-search"
        name="q"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className={`field !rounded-2xl border-cream-300 pl-11 font-medium placeholder:font-normal ${
          size === "lg" ? "h-14 text-[1.02rem]" : "h-11 text-sm"
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            const next = new URLSearchParams(params.toString());
            next.delete("q");
            router.push(`/search?${next.toString()}`);
          }}
          className="absolute right-[5.6rem] top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-sage-400 hover:bg-cream-200 hover:text-ink"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
      <Button
        type="submit"
        size={size === "lg" ? "lg" : "md"}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 !rounded-xl ${size === "lg" ? "" : "!h-8 !px-3 !text-[0.8rem]"}`}
      >
        Compare
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

export function FilterBar({
  categories,
  stores,
  brands,
  total,
}: {
  categories: string[];
  stores: Store[];
  brands: string[];
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [showBrands, setShowBrands] = useState(false);

  const active = {
    category: params.get("category") ?? "all",
    stores: (params.get("stores")?.split(",").filter(Boolean) ?? []) as string[],
    brands: params.get("brands")?.split(",").filter(Boolean) ?? [],
    sort: params.get("sort") ?? "relevance",
    inStock: params.get("inStock") === "1",
  };

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || value === "all" || value === "relevance") next.delete(key);
      else next.set(key, value);
    }
    router.push(`/search?${next.toString()}`, { scroll: false });
  };

  const toggleStore = (id: string) => {
    const set = new Set(active.stores);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ stores: [...set].join(",") });
  };

  const toggleBrand = (name: string) => {
    const set = new Set(active.brands);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    update({ brands: [...set].join(",") });
  };

  const hasFilters =
    active.category !== "all" || active.stores.length > 0 || active.brands.length > 0 || active.inStock;

  return (
    <div className="space-y-4">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <Chip active={active.category === "all"} onClick={() => update({ category: null })}>
          All categories
        </Chip>
        {categories.map((category) => (
          <Chip
            key={category}
            active={active.category === category}
            onClick={() => update({ category })}
          >
            {category}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-sage-400">
            Stores
          </span>
          {stores.map((store) => (
            <button
              key={store.id}
              onClick={() => toggleStore(store.id)}
              aria-pressed={active.stores.includes(store.id)}
              title={`${store.name} — ${formatPKR(store.deliveryFee)} delivery, free over ${formatPKRShort(store.freeDeliveryOver)}`}
              className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[0.78rem] font-medium transition-all ${
                active.stores.includes(store.id)
                  ? "border-forest-800 bg-white text-forest-900 shadow-[var(--shadow-card)]"
                  : "border-transparent bg-cream-100 text-sage-600 hover:bg-cream-200"
              }`}
            >
              <StoreBadge storeId={store.id} size="sm" />
              {store.name}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowBrands((value) => !value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-medium ${
              active.brands.length
                ? "border-forest-800 text-forest-900"
                : "border-cream-300 text-sage-600 hover:border-sage-300"
            }`}
            aria-expanded={showBrands}
          >
            Brand{active.brands.length ? ` (${active.brands.length})` : ""}
            <span className="text-[0.6rem]">▾</span>
          </button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-cream-300 px-3 text-[0.8rem] font-medium text-sage-600 hover:border-sage-300">
            <input
              type="checkbox"
              checked={active.inStock}
              onChange={(event) => update({ inStock: event.target.checked ? "1" : null })}
              className="h-3.5 w-3.5 accent-forest-700"
            />
            In stock only
          </label>
          <label className="inline-flex h-8 items-center gap-2 rounded-full border border-cream-300 px-3 text-[0.8rem] font-medium text-sage-600">
            Sort
            <select
              value={active.sort}
              onChange={(event) => update({ sort: event.target.value })}
              className="cursor-pointer bg-transparent font-semibold text-forest-900 focus:outline-none"
            >
              <option value="relevance">Relevance</option>
              <option value="price-asc">Cheapest first</option>
              <option value="price-desc">Dearest first</option>
              <option value="savings-desc">Biggest price gap</option>
              <option value="name-asc">A–Z</option>
            </select>
          </label>
          {hasFilters && (
            <button
              onClick={() =>
                router.push(`/search?q=${encodeURIComponent(params.get("q") ?? "")}`, {
                  scroll: false,
                })
              }
              className="text-[0.8rem] font-semibold text-sage-500 underline underline-offset-4 hover:text-spend"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showBrands && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-cream-200 bg-white p-3">
              {brands.map((brand) => (
                <Chip key={brand} active={active.brands.includes(brand)} onClick={() => toggleBrand(brand)}>
                  {brand}
                </Chip>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[0.82rem] text-sage-500" aria-live="polite">
        <strong className="font-semibold text-ink">{total}</strong>{" "}
        {total === 1 ? "product" : "products"} match
        {active.stores.length > 0 && ` at ${active.stores.length} selected ${active.stores.length === 1 ? "store" : "stores"}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Product card
 * ------------------------------------------------------------------ */

export function ProductCard({ summary }: { summary: CatalogSummary }) {
  const { product } = summary;
  const { add, quantityOf } = useBasket();
  const inBasket = quantityOf(product.id) > 0;
  const gap = summary.spread;
  const qty = normaliseQuantity(product.defaultQuantity, product.unit);

  // One bar per store — a shop may list three brands of the same product, and
  // the card compares shops, not SKUs. Prices are after promos, so a bar that
  // looks cheap is a price you could actually pay today.
  const priceBars = useMemo(() => {
    const cheapestPerStore = new Map<string, number>();
    for (const offer of product.offers) {
      if (!offer.inStock) continue;
      const unit = effectivePackPrice(offer, 1) / offer.quantity;
      const current = cheapestPerStore.get(offer.storeId);
      if (current === undefined || unit < current) cheapestPerStore.set(offer.storeId, unit);
    }
    const bars = [...cheapestPerStore]
      .map(([storeId, unitPrice]) => ({ storeId, unitPrice }))
      .sort((a, b) => a.unitPrice - b.unitPrice);
    const cheapest = bars.length ? bars[0].unitPrice : 1;
    return bars.map((bar) => ({ ...bar, ratio: cheapest / bar.unitPrice }));
  }, [product.offers]);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[var(--shadow-card)] transition-all duration-300 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <Link
        href={`/product/${product.id}`}
        className="flex flex-1 flex-col gap-4 p-5 focus-visible:outline-none"
      >
        <div className="flex items-start gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-cream-100 text-[1.75rem] ring-1 ring-inset ring-cream-200 transition-transform duration-300 group-hover:scale-105"
            aria-hidden="true"
          >
            {product.glyph}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-[1.05rem] font-semibold leading-snug text-forest-950">
              {product.name}
            </h3>
            <p className="mt-0.5 text-[0.78rem] text-sage-500">
              {product.category} · {formatQuantityInput(qty.quantity)} {qty.unit}
              {summary.brands.length > 1 ? ` · ${summary.brands.length} brands` : summary.brands[0] ? ` · ${summary.brands[0]}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-auto">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-sage-400">
                Cheapest at
              </p>
              <Price amount={summary.bestPrice} size="lg" tone="save" className="mt-0.5" />
            </div>
            <StoreBadge storeId={summary.bestStoreId} size="md" showName />
          </div>

          {/* Nine-store spread at a glance: bar length = how far each store is
              from the cheapest. Cheap reads long, dear reads short. */}
          <div className="mt-3 flex items-end gap-[3px]" aria-hidden="true">
            {priceBars.map((bar) => (
              <span
                key={bar.storeId}
                className="h-6 flex-1 rounded-[2px] transition-all duration-300"
                style={{
                  height: `${Math.max(12, bar.ratio * 100)}%`,
                  background: bar.ratio > 0.97 ? "var(--color-forest-500)" : "var(--color-cream-300)",
                }}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.76rem]">
            <span className="text-sage-500">
              {summary.availableAt.length}/{summary.stockedAt.length} stores in stock
            </span>
            {gap > 0 && (
              <span className="rounded-md bg-save-soft px-1.5 py-0.5 font-semibold text-save">
                {formatPKR(gap)} spread
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-2 border-t border-cream-200 bg-cream-50/70 px-5 py-3">
        <Button
          size="sm"
          variant={inBasket ? "accent" : "primary"}
          onClick={() => add(product.id, product.defaultQuantity)}
          className="flex-1"
        >
          {inBasket ? "Add again" : `Add ${formatQuantityInput(qty.quantity)} ${qty.unit}`}
        </Button>
        <Link
          href={`/product/${product.id}`}
          className="inline-flex h-8 items-center rounded-lg px-2.5 text-[0.8rem] font-semibold text-forest-800 hover:bg-cream-200"
        >
          Compare 9
        </Link>
      </div>
    </article>
  );
}

/** Skeleton grid shown while the catalogue loads. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-64 animate-pulse rounded-2xl bg-cream-100" />
      ))}
    </div>
  );
}
