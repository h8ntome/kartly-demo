import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { STORES } from "@/lib/catalog/stores";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-cream-200 bg-cream-100/70">
      <div className="mx-auto grid w-full max-w-[84rem] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-sage-600">
            Your shopping list, at the lowest possible cost. Kartly compares six Karachi
            supermarkets at the level that actually matters — your whole basket, delivery
            included.
          </p>
          <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-[0.76rem] leading-relaxed text-warn ring-1 ring-inset ring-warn/15">
            Prices are supplied figures for the stores listed here, not their published price
            lists. Where a delivery charge was not supplied, Kartly says so rather than guessing.
            None of these stores is a Kartly partner.
          </p>
        </div>

        <FooterColumn
          title="Compare"
          links={[
            { href: "/search", label: "Search products" },
            { href: "/basket", label: "Basket optimiser" },
            { href: "/stores", label: "Supermarkets" },
            { href: "/receipt", label: "Scan a receipt" },
          ]}
        />

        <FooterColumn
          title="Popular searches"
          links={[
            { href: "/search?q=nesvita", label: "Nesvita" },
            { href: "/search?q=basmati rice", label: "Basmati rice" },
            { href: "/search?q=nurpur butter", label: "Nurpur butter" },
            { href: "/search?q=canola oil", label: "Canola oil" },
            { href: "/search?q=cocomo cereal", label: "Cocomo cereal" },
          ]}
        />

        <div>
          <h3 className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-sage-500">
            Supermarkets
          </h3>
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-sage-600">
            {STORES.map((store) => (
              <li key={store.id}>
                <Link href={`/stores#${store.id}`} className="hover:text-forest-800">
                  {store.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-cream-200">
        <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-2 px-4 py-5 text-[0.78rem] text-sage-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Kartly. Built in Karachi.</span>
          <span className="flex items-center gap-4">
            <Link href="/api/health" className="hover:text-forest-800">
              API status
            </Link>
            <Link href="/search?sort=savings-desc" className="hover:text-forest-800">
              Biggest price gaps
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h3 className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-sage-500">
        {title}
      </h3>
      <ul className="mt-4 space-y-2 text-sm text-sage-600">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link href={link.href} className="hover:text-forest-800">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
