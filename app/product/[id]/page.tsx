import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getSnapshot, getStores } from "@/lib/api/index";
import { ProductComparison } from "@/components/product/ProductComparison";
import { StoreBadge } from "@/components/brand/Logo";
import { ChevronRightIcon } from "@/components/ui/Icons";
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
    <div className="has-dock mx-auto w-full max-w-[52rem] px-4 sm:px-6">
      <nav className="flex items-center gap-2 pt-5 text-[0.82rem] text-sage-500" aria-label="Breadcrumb">
        <Link
          href="/search"
          className="grid h-8 w-8 place-items-center rounded-full border border-cream-300 bg-white text-forest-800 transition-colors hover:bg-cream-100"
          aria-label="Back to search"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" />
        </Link>
        <Link href={`/search?category=${encodeURIComponent(product.category)}`} className="hover:text-forest-800">
          {product.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-start gap-4">
        <span
          className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-cream-100 text-[2.6rem] ring-1 ring-inset ring-cream-200"
          aria-hidden="true"
        >
          {product.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.6rem] leading-tight text-forest-950 sm:text-[2.1rem]">
            {product.name}
          </h1>
          <p className="mt-1.5 text-[0.86rem] leading-relaxed text-sage-600">
            {formatQuantityInput(product.defaultQuantity)} {product.unit} · available at{" "}
            {new Set(product.offers.map((offer) => offer.storeId)).size} of {snapshot.stores.length}{" "}
            shops
            {cheapest && (
              <>
                {" "}
                · cheapest at{" "}
                <span className="font-semibold text-save">{STORE_MAP[cheapest.storeId].name}</span>
              </>
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
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

      <div className="mt-6">
        <ProductComparison product={product} stores={snapshot.stores} />
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-[1.3rem] font-semibold text-forest-950">
            More in {product.category}
          </h2>
          <ul className="rail rail-tight mt-4">
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
                    className="flex h-full items-center gap-3 rounded-2xl border border-cream-200 bg-white px-3.5 py-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
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
