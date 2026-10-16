import { NextResponse, type NextRequest } from "next/server";
import { searchCatalog } from "@/lib/api/index";
import { CATEGORIES, type Category, type SortKey, type StoreId } from "@/lib/types";

/**
 * GET /api/products?q=&category=&stores=&brands=&sort=&maxPrice=&inStock=
 *
 * Server-side search and faceting. The UI uses the same `searchCatalog`
 * function, so a filtered URL and a filtered client view can never disagree.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stores = (params.get("stores")?.split(",").filter(Boolean) ?? []) as StoreId[];
  const brands = params.get("brands")?.split(",").filter(Boolean) ?? [];
  const category = params.get("category");
  const maxPrice = Number.parseFloat(params.get("maxPrice") ?? "");
  const sort = (params.get("sort") ?? "relevance") as SortKey;

  const result = await searchCatalog({
    query: params.get("q") ?? "",
    category: (CATEGORIES as readonly string[]).includes(category ?? "")
      ? (category as Category)
      : "all",
    stores: stores.length ? stores : undefined,
    brands: brands.length ? brands : undefined,
    sort,
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    inStockOnly: params.get("inStock") === "1",
  });

  return NextResponse.json({
    source: result.snapshot.source,
    generatedAt: result.snapshot.generatedAt,
    total: result.total,
    items: result.items,
    facets: {
      categories: result.facets.categories,
      brands: result.facets.brands,
      stores: result.facets.stores.map((store) => ({
        id: store.id,
        name: store.name,
        initials: store.initials,
      })),
    },
  });
}
