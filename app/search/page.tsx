import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { searchCatalog } from "@/lib/api/index";
import { FilterBar, ProductRow, SearchBox } from "@/components/search/SearchUi";
import { EmptyState, LinkButton } from "@/components/ui/Primitives";
import { CATEGORIES, type Category, type SortKey, type StoreId } from "@/lib/types";
import { formatPKRShort } from "@/lib/engine/format";

export const metadata: Metadata = {
  title: "Compare grocery prices",
  description:
    "Search grocery products and see every Karachi supermarket's price side by side, with the cheapest offer highlighted.",
};

const SORT_KEYS = new Set<SortKey>([
  "relevance",
  "price-asc",
  "price-desc",
  "savings-desc",
  "name-asc",
]);

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const category = typeof params.category === "string" ? params.category : "all";
  const sort = (typeof params.sort === "string" ? params.sort : "relevance") as SortKey;
  const stores = typeof params.stores === "string" ? (params.stores.split(",").filter(Boolean) as StoreId[]) : [];
  const brands = typeof params.brands === "string" ? params.brands.split(",").filter(Boolean) : [];
  const maxPrice = Number.parseFloat(typeof params.maxPrice === "string" ? params.maxPrice : "");

  const result = await searchCatalog({
    query,
    category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : "all",
    stores: stores.length ? stores : undefined,
    brands: brands.length ? brands : undefined,
    sort: SORT_KEYS.has(sort) ? sort : "relevance",
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    inStockOnly: params.inStock === "1",
  });

  const widest = result.items.reduce(
    (best, item) => (item.spread > (best?.spread ?? 0) ? item : best),
    result.items[0],
  );

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 pb-4 sm:px-6">
      {/* Sticky search: the one control a shopper returns to on every search. */}
      <div className="sticky top-14 z-30 -mx-4 border-b border-cream-200/70 bg-cream-50/92 px-4 pb-3 pt-3 backdrop-blur-xl supports-[backdrop-filter]:bg-cream-50/78 sm:-mx-6 sm:px-6 md:top-16">
        <Suspense fallback={<div className="h-12" />}>
          <SearchBox autoFocus={!query} />
        </Suspense>
        <div className="mt-3">
          <Suspense fallback={<div className="h-20" />}>
            <FilterBar
              categories={result.facets.categories}
              stores={result.snapshot.stores}
              brands={result.facets.brands}
              total={result.total}
            />
          </Suspense>
        </div>
      </div>

      {query && (
        <p className="mt-4 text-[0.86rem] text-sage-600">
          Prices for <span className="font-semibold text-forest-800">“{query}”</span>
          {widest && widest.spread > 0 && (
            <>
              {" · widest gap "}
              <Link
                href={`/product/${widest.product.id}`}
                className="font-semibold text-forest-700 hover:underline"
              >
                {widest.product.name} {formatPKRShort(widest.spread)}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="mt-4">
        {result.items.length === 0 ? (
          <EmptyState
            glyph="🧺"
            title="Nothing matched that"
            body={
              query
                ? `No product matches “${query}” with these filters. Try a broader word — “rice”, “oil”, “cereal” — or clear the shop filter.`
                : "The catalogue is empty right now. Try again in a moment."
            }
            action={
              <LinkButton href="/search" variant="outline" size="sm">
                Clear search
              </LinkButton>
            }
          />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
            {result.items.map((summary) => (
              <ProductRow key={summary.product.id} summary={summary} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
