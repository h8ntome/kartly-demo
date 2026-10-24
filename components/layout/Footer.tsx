import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { STORES } from "@/lib/catalog/stores";

/**
 * Compact app footer.
 *
 * The one disclosure this product has to keep — that the prices are the figures
 * Kartly holds rather than live checkout prices, and that the stores are not
 * partners — lives here, in plain grey text. It is a fact, not a warning label.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-cream-200 bg-cream-100/70">
      <div className="mx-auto w-full max-w-[84rem] px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.82rem] font-medium text-sage-600"
          >
            <Link href="/search" className="transition-colors hover:text-forest-800">
              Products
            </Link>
            <Link href="/stores" className="transition-colors hover:text-forest-800">
              Stores
            </Link>
            <Link href="/basket" className="transition-colors hover:text-forest-800">
              Basket
            </Link>
            <Link href="/orders" className="transition-colors hover:text-forest-800">
              Orders
            </Link>
          </nav>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-sage-400">
            Compared here
          </span>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-sage-600">
            {STORES.map((store) => (
              <li key={store.id}>
                <Link href={`/stores#${store.id}`} className="transition-colors hover:text-forest-800">
                  {store.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-1.5 border-t border-cream-200 pt-5 text-[0.76rem] leading-relaxed text-sage-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Kartly · Built in Karachi</span>
          <span>
            Prices are the figures Kartly holds for these stores, not live checkout prices. Kartly is
            not affiliated with the stores named.
          </span>
        </div>
      </div>
    </footer>
  );
}
