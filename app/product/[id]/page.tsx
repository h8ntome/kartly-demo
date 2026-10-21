import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getSnapshot, getStores } from "@/lib/api/index";
import { ProductComparison } from "@/components/product/ProductComparison";
import { StoreBadge } from "@/components/brand/Logo";
import { Tag } from "@/components/ui/Primitives";
import { formatPKR, formatQuantityInput } from "@/lib/engine/format";
import { cheapestPack } from "@/lib/engine/pricing";
import { STORE_MAP } from "@/lib/catalog/stores";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: "Product not found" };
  const storeCount = (await getStores()).length;
  const offers = product.offers.filter((offer) => offer.inStock);
  const cheapest = offers.length
    ? Math.min(...offers.map((offer) => cheapestPack([offer], offer.quantity, offer.unit)?.cost ?? Infinity))
    : 0;
  return {
    title: `${product.name} — prices at ${storeCount} Karachi supermarkets`,
    description: cheapest
      ? `Compare ${product.name} across ${storeCount} Karachi supermarkets from ${formatPKR(cheapest)}.`
      : `Compare ${product.name} across ${storeCount} Karachi supermarkets.`,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, snapshot] = await Promise.all([getProduct(id), getSnapshot()]);
  if (!product) notFound();

  const inStock = product.offers.filter((offer) => offer.inStock);
  const cheapest = inStock.length
    ? inStock.reduce((best, offer) => {
        const cost = cheapestPack([offer], product.defaultQuantity, product.unit)?.cost ?? Infinity;
        const bestCost =
          cheapestPack([best], product.defaultQuantity, product.unit)?.cost ?? Infinity;
        return cost < bestCost ? offer : best;
      })
    : null;

  const related = snapshot.products
    .filter((candidate) => candidate.category === product.category && candidate.id !== product.id)
    .slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-6 sm:py-10">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-[0.82rem] text-sage-500" aria-label="Breadcrumb">
        <Link href="/search" className="hover:text-forest-800">
          Search
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/search?category=${encodeURIComponent(product.category)}`} className="hover:text-forest-800">
          {product.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <header className="flex flex-wrap items-start gap-5">
        <span
          className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-cream-100 text-[2.6rem] ring-1 ring-inset ring-cream-200"
          aria-hidden="true"
        >
          {product.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.9rem] leading-tight text-forest-950 sm:text-[2.3rem]">
              {product.name}
            </h1>
            <Tag tone={snapshot.source === "live" ? "live" : "warn"}>
              {snapshot.source === "live" ? "Live prices" : "Supplied prices"}
            </Tag>
          </div>
          <p className="mt-1.5 text-[0.9rem] text-sage-600">
            {product.category} · {formatQuantityInput(product.defaultQuantity)}{" "}
            {product.unit} · available at {new Set(product.offers.map((offer) => offer.storeId)).size} of{" "}
            {snapshot.stores.length} stores
            {cheapest && (
              <>
                {" "}
                · cheapest right now at{" "}
                <span className="font-semibold text-save">{STORE_MAP[cheapest.storeId].name}</span>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...new Set(product.offers.map((offer) => offer.brand))].map((brand) => (
              <span
                key={brand}
                className="rounded-md bg-cream-100 px-2 py-0.5 text-[0.74rem] text-sage-600"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-8">
        <ProductComparison product={product} stores={snapshot.stores} />
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[1.3rem] text-forest-950">More in {product.category}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((candidate) => {
              const offers = candidate.offers.filter((offer) => offer.inStock);
              const best = offers.length
                ? offers.reduce((min, offer) => {
                    const cost =
                      cheapestPack([offer], candidate.defaultQuantity, candidate.unit)?.cost ?? Infinity;
                    const minCost =
                      cheapestPack([min], candidate.defaultQuantity, candidate.unit)?.cost ?? Infinity;
                    return cost < minCost ? offer : min;
                  })
                : null;
              return (
                <li key={candidate.id}>
                  <Link
                    href={`/product/${candidate.id}`}
                    className="flex items-center gap-3 rounded-xl border border-cream-200 bg-white px-4 py-3 transition-shadow hover:shadow-[var(--shadow-card)]"
                  >
                    <span className="text-xl" aria-hidden="true">
                      {candidate.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9rem] font-medium text-ink">
                        {candidate.name}
                      </span>
                      <span className="block text-[0.74rem] text-sage-500">
                        {formatQuantityInput(candidate.defaultQuantity)} {candidate.unit}
                      </span>
                    </span>
                    {best && <StoreBadge storeId={best.storeId} size="sm" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
