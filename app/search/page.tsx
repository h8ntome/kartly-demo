import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { searchCatalog } from "@/lib/api/index";
import { getDataStatus } from "@/lib/api/status";
import { FilterBar, ProductCard, SearchBox } from "@/components/search/SearchUi";
import { EmptyState, LinkButton, Tag } from "@/components/ui/Primitives";
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

  const [result, status] = await Promise.all([
    searchCatalog({
      query,
      category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : "all",
      stores: stores.length ? stores : undefined,
      brands: brands.length ? brands : undefined,
      sort: SORT_KEYS.has(sort) ? sort : "relevance",
      maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
      inStockOnly: params.inStock === "1",
    }),
    getDataStatus(),
  ]);

  const cheapestOverall = result.items.length
    ? Math.min(...result.items.map((item) => item.bestPrice))
    : 0;
  const biggestGap = result.items.reduce(
    (best, item) => (item.spread > (best?.spread ?? 0) ? item : best),
    result.items[0],
  );

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <h1 className="text-[2rem] leading-[1.08] text-forest-950 sm:text-[2.5rem]">
            {query ? (
              <>
                Prices for <span className="text-forest-600">“{query}”</span>
              </>
            ) : (
              "Compare nine supermarkets at once"
            )}
          </h1>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-sage-600">
            Every price below is the real pack price after offers, converted to a common unit so a
            5 kg bag and a 1 kg bag are compared honestly.
          </p>
        </div>
        <div className="w-full max-w-xl lg:w-[34rem]">
          <Suspense fallback={<div className="h-14" />}>
            <SearchBox size="lg" autoFocus={!query} />
          </Suspense>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Tag tone={status.source === "live" ? "live" : "sample"}>
          {status.source === "live" ? "Live prices" : "Sample prices"}
        </Tag>
        <span className="text-[0.8rem] text-sage-500">{status.note}</span>
        {result.items.length > 0 && (
          <span className="ml-auto hidden items-center gap-4 text-[0.8rem] text-sage-500 sm:flex">
            {cheapestOverall > 0 && <>cheapest item {formatPKRShort(cheapestOverall)}</>}
            {biggestGap && biggestGap.spread > 0 && (
              <>
                · widest gap{" "}
                <Link href={`/product/${biggestGap.product.id}`} className="font-semibold text-forest-700 hover:underline">
                  {biggestGap.product.name} {formatPKRShort(biggestGap.spread)}
                </Link>
              </>
            )}
          </span>
        )}
      </div>

      <div className="mt-6">
        <Suspense fallback={<div className="h-24" />}>
          <FilterBar
            categories={result.facets.categories}
            stores={result.snapshot.stores}
            brands={result.facets.brands}
            total={result.total}
          />
        </Suspense>
      </div>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <EmptyState
            glyph="🧺"
            title="Nothing matched that"
            body={
              query
                ? `No product in the catalogue matches “${query}” with these filters. Try a broader word — “rice”, “oil”, “daal” — or clear the store filter.`
                : "The catalogue is empty, which means the price source returned nothing. Check /api/health."
            }
            action={
              <LinkButton href="/search" variant="outline" size="sm">
                Clear search
              </LinkButton>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((summary) => (
              <ProductCard key={summary.product.id} summary={summary} />
            ))}
          </div>
        )}
      </div>

      <p className="mt-10 max-w-3xl rounded-xl bg-cream-100 px-4 py-3 text-[0.8rem] leading-relaxed text-sage-600">
        Prices on this page are{" "}
        {status.source === "live" ? (
          "fetched from the connected supermarket pricing API"
        ) : (
          <span className="font-semibold text-warn">
            illustrative sample figures built for this demo
          </span>
        )}
        . They are not the stores&apos; published price lists. Connect a live feed through the
        environment variables in <code className="rounded bg-cream-200 px-1">.env.example</code> and
        this line updates itself.
      </p>
    </div>
  );
}
