"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Chip, Price } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { Sheet } from "@/components/ui/Sheet";
import { AddPill, Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import { useBasket } from "@/lib/basket/store";
import { formatPKR, formatQuantityInput, deliveryRuleLabel } from "@/lib/engine/format";
import { normaliseQuantity } from "@/lib/types";
import { CheckIcon, CloseIcon, SearchIcon, SlidersIcon } from "@/components/ui/Icons";
import type { CatalogSummary, Store, StoreId } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Search box
 * ------------------------------------------------------------------ */

export function SearchBox({
  autoFocus = false,
  size = "md",
  placeholder = "Search rice, oil, butter…",
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

  const height = size === "lg" ? "h-14" : "h-12";

  return (
    <form onSubmit={submit} className="relative w-full" role="search">
      <label htmlFor="kartly-search" className="sr-only">
        Search grocery products
      </label>
      <SearchIcon
        className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sage-400 ${
          size === "lg" ? "h-5 w-5" : "h-[1.1rem] w-[1.1rem]"
        }`}
      />
      <input
        id="kartly-search"
        name="q"
        autoComplete="off"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className={`field w-full rounded-full border-cream-300 bg-white pl-11 pr-24 font-medium shadow-[var(--shadow-card)] placeholder:font-normal focus:shadow-[var(--shadow-lift)] ${height} ${
          size === "lg" ? "text-[1rem]" : "text-[0.92rem]"
        }`}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            const next = new URLSearchParams(params.toString());
            next.delete("q");
            router.push(`/search?${next.toString()}`);
          }}
          className="absolute right-[5.75rem] top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-sage-400 transition-colors hover:bg-cream-200 hover:text-ink"
          aria-label="Clear search"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <Button
        type="submit"
        size={size === "lg" ? "lg" : "md"}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 !rounded-full ${
          size === "lg" ? "!h-11 !px-5" : "!h-9 !px-4 !text-[0.82rem]"
        }`}
      >
        Compare
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Filters: a chip rail for categories, a sheet for everything else
 * ------------------------------------------------------------------ */

const SORTS: Array<{ value: string; label: string }> = [
  { value: "relevance", label: "Best match" },
  { value: "price-asc", label: "Cheapest first" },
  { value: "price-desc", label: "Dearest first" },
  { value: "savings-desc", label: "Biggest price gap" },
  { value: "name-asc", label: "A–Z" },
];

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
  const [sheetOpen, setSheetOpen] = useState(false);

  const active = {
    category: params.get("category") ?? "all",
    stores: (params.get("stores")?.split(",").filter(Boolean) ?? []) as StoreId[],
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

  const toggleStore = (id: StoreId) => {
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

  const filterCount =
    active.stores.length + active.brands.length + (active.inStock ? 1 : 0) + (active.sort !== "relevance" ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
        <Chip active={active.category === "all"} onClick={() => update({ category: null })}>
          All
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSheetOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-cream-300 bg-white px-3.5 text-[0.82rem] font-semibold text-forest-900 shadow-[var(--shadow-card)] transition-colors hover:border-sage-300"
          aria-expanded={sheetOpen}
        >
          <SlidersIcon className="h-4 w-4" />
          Filters
          {filterCount > 0 && (
            <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-forest-800 px-1 text-[0.68rem] font-bold text-lime-300">
              {filterCount}
            </span>
          )}
        </button>

        <div className="no-scrollbar flex flex-1 items-center gap-2 overflow-x-auto">
          {active.stores.map((id) => {
            const store = stores.find((entry) => entry.id === id);
            if (!store) return null;
            return (
              <button
                key={id}
                onClick={() => toggleStore(id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-forest-800 py-1 pl-1 pr-2.5 text-[0.76rem] font-semibold text-cream-50"
              >
                <StoreBadge storeId={id} size="sm" />
                {store.name}
                <CloseIcon className="h-3 w-3" />
              </button>
            );
          })}
          {active.inStock && (
            <button
              onClick={() => update({ inStock: null })}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-forest-800 px-2.5 py-1 text-[0.76rem] font-semibold text-cream-50"
            >
              In stock <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        <p className="text-[0.8rem] text-sage-500" aria-live="polite">
          <strong className="font-semibold text-ink">{total}</strong>{" "}
          {total === 1 ? "product" : "products"}
        </p>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Sort & filters"
        description="Narrow the catalogue. Everything you pick shows as a chip you can clear."
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setSheetOpen(false);
                router.push(`/search?q=${encodeURIComponent(params.get("q") ?? "")}`, {
                  scroll: false,
                });
              }}
            >
              Reset all
            </Button>
            <Button className="flex-1" onClick={() => setSheetOpen(false)}>
              Show {total} {total === 1 ? "result" : "results"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <h3 className="mb-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-sage-500">
              Sort by
            </h3>
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
              {SORTS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => update({ sort: option.value })}
                  aria-pressed={active.sort === option.value}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[0.84rem] font-medium transition-colors ${
                    active.sort === option.value
                      ? "border-forest-700 bg-forest-800 text-cream-50"
                      : "border-cream-300 bg-white text-ink-soft hover:border-sage-300"
                  }`}
                >
                  {option.label}
                  {active.sort === option.value && <CheckIcon className="h-4 w-4 text-lime-400" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-sage-500">
              Shops
            </h3>
            <div className="grid gap-2">
              {stores.map((store) => {
                const on = active.stores.includes(store.id);
                return (
                  <button
                    key={store.id}
                    onClick={() => toggleStore(store.id)}
                    aria-pressed={on}
                    title={`${store.name} — ${deliveryRuleLabel(store)}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      on ? "border-forest-700 bg-save-soft" : "border-cream-300 bg-white hover:border-sage-300"
                    }`}
                  >
                    <StoreBadge storeId={store.id} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.88rem] font-semibold text-ink">{store.name}</span>
                      <span className="block text-[0.74rem] text-sage-500">{deliveryRuleLabel(store)}</span>
                    </span>
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                        on ? "border-forest-700 bg-forest-800 text-lime-400" : "border-cream-300 text-transparent"
                      }`}
                    >
                      <CheckIcon className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-cream-300 bg-white px-3 py-3">
            <span className="text-[0.88rem] font-medium text-ink">In stock only</span>
            <input
              type="checkbox"
              checked={active.inStock}
              onChange={(event) => update({ inStock: event.target.checked ? "1" : null })}
              className="h-5 w-5 accent-forest-700"
            />
          </label>

          {brands.length > 0 && (
            <div>
              <h3 className="mb-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-sage-500">
                Brands
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {brands.map((brand) => (
                  <Chip
                    key={brand}
                    active={active.brands.includes(brand)}
                    onClick={() => toggleBrand(brand)}
                  >
                    {brand}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Product card
 * ------------------------------------------------------------------ */

/** Add button that becomes a stepper once the product is in the basket. */
export function ProductAddControl({
  summary,
  compact = false,
}: {
  summary: CatalogSummary;
  compact?: boolean;
}) {
  const { product } = summary;
  const { add, setProduct, quantityOf } = useBasket();
  const { toast } = useToast();
  const router = useRouter();
  const inBasket = quantityOf(product.id);
  const qty = normaliseQuantity(product.defaultQuantity, product.unit);
  const step = qty.quantity;

  if (inBasket <= 0) {
    return (
      <AddPill
        label={`Add ${product.name} to basket`}
        onClick={() => {
          add(product.id, product.defaultQuantity);
          toast({
            title: `${product.glyph} ${product.name} added`,
            detail: `${formatQuantityInput(step)} ${step === 1 ? "pack" : "packs"} · ${formatPKR(summary.bestPrice)}`,
            tone: "save",
            action: { label: "Basket", onClick: () => router.push("/basket") },
          });
        }}
        className={compact ? "!px-3" : ""}
      />
    );
  }

  return (
    <Stepper
      size={compact ? "sm" : "md"}
      value={inBasket}
      step={step}
      min={step}
      unit={compact ? undefined : qty.unit}
      label={product.name}
      onChange={(next) => {
        setProduct(product.id, next);
        if (next <= 0) toast({ title: `${product.name} removed`, glyph: "🗑️" });
      }}
    />
  );
}

/** Compact tile for the home rails. */
export function ProductTile({ summary }: { summary: CatalogSummary }) {
  const { product } = summary;
  const qty = normaliseQuantity(product.defaultQuantity, product.unit);

  return (
    <article className="flex h-full flex-col rounded-3xl border border-cream-200 bg-white p-3.5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link href={`/product/${product.id}`} className="flex flex-1 flex-col">
        <span
          className="grid h-12 w-12 place-items-center rounded-2xl bg-cream-100 text-[1.5rem] ring-1 ring-inset ring-cream-200"
          aria-hidden="true"
        >
          {product.glyph}
        </span>
        <h3 className="mt-2.5 line-clamp-2 text-[0.86rem] font-semibold leading-snug text-ink">
          {product.name}
        </h3>
        <p className="mt-0.5 text-[0.72rem] text-sage-500">
          {formatQuantityInput(qty.quantity)} {qty.unit}
        </p>
        <div className="mt-auto pt-2.5">
          <Price amount={summary.bestPrice} size="md" tone="save" />
          <span className="mt-1 flex items-center gap-1.5">
            <StoreBadge storeId={summary.bestStoreId} size="sm" />
            <span className="truncate text-[0.72rem] text-sage-500">
              {summary.availableAt.length} shops
            </span>
          </span>
        </div>
      </Link>
      <div className="mt-2.5 flex justify-end">
        <ProductAddControl summary={summary} compact />
      </div>
    </article>
  );
}

/** Compact list row — how a delivery app shows search results on a phone. */
export function ProductRow({ summary }: { summary: CatalogSummary }) {
  const { product } = summary;
  const qty = normaliseQuantity(product.defaultQuantity, product.unit);
  const shopCount = summary.availableAt.length;
  const totalShops = shopCount + summary.unavailableAt.length;

  return (
    <article className="flex items-center gap-3 rounded-3xl border border-cream-200 bg-white p-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link
        href={`/product/${product.id}`}
        className="grid h-[3.25rem] w-[3.25rem] shrink-0 place-items-center rounded-2xl bg-cream-100 text-[1.5rem] ring-1 ring-inset ring-cream-200"
        aria-label={`Compare ${product.name} across shops`}
      >
        <span aria-hidden="true">{product.glyph}</span>
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/product/${product.id}`} className="min-w-0 flex-1">
            <h3 className="truncate text-[0.92rem] font-semibold leading-snug text-ink">
              {product.name}
            </h3>
          </Link>
          <div className="shrink-0">
            <ProductAddControl summary={summary} compact />
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Price amount={summary.bestPrice} size="sm" tone="save" />
          <StoreBadge storeId={summary.bestStoreId} size="sm" />
          {summary.spread > 0 && (
            <span className="rounded-md bg-save-soft px-1.5 py-0.5 text-[0.68rem] font-bold text-save">
              {formatPKR(summary.spread)} apart
            </span>
          )}
        </div>

        <p className="mt-0.5 truncate text-[0.74rem] text-sage-500">
          {formatQuantityInput(qty.quantity)} {qty.unit}
          {summary.brands[0] ? ` · ${summary.brands[0]}` : ""} · {shopCount}/{totalShops} shops
        </p>
      </div>
    </article>
  );
}

/** Skeleton grid shown while the catalogue loads. */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="shimmer h-60 rounded-3xl" />
      ))}
    </div>
  );
}

/** Rail of tiles: scrolls sideways on a phone, becomes a grid on a tablet. */
export function TileRail({ children }: { children: React.ReactNode }) {
  return <div className="rail">{children}</div>;
}
