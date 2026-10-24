import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { EXAMPLE_RECEIPTS } from "@/lib/catalog/dataset";
import { ReceiptScanner } from "@/components/receipt/ReceiptScanner";
import { SearchBox } from "@/components/search/SearchUi";
import { Skeleton } from "@/components/ui/Primitives";

export const metadata: Metadata = {
  title: "Scan a receipt",
  description:
    "Turn a Karachi grocery receipt into a shopping list in your browser, then see what the same list costs at every supermarket Kartly compares.",
};

const examples = EXAMPLE_RECEIPTS.map((receipt) => ({ store: receipt.store, text: receipt.text }));

export default function ReceiptPage() {
  return (
    <div className="has-dock page max-w-[68rem] pt-8 sm:pt-12 lg:pb-12">
      <header className="max-w-[62ch]">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-lime-700">
          Receipt scan
        </p>
        <h1 className="mt-3 text-[2.1rem] leading-[1.06] text-forest-950 sm:text-[2.7rem]">
          Your last shop, priced the way it should have been
        </h1>
        <p className="mt-4 text-[1rem] leading-relaxed text-sage-600">
          Kartly reads a receipt line by line — quantity, pack size, price — matches each one to a
          product, and then prices that exact list at every store it compares. Most receipts come
          back with a handful of lines to check, not a list to retype.
        </p>
        <div className="mt-6 max-w-[34rem]">
          <Suspense fallback={<Skeleton className="h-14 rounded-xl" />}>
            <SearchBox />
          </Suspense>
          <p className="mt-2 text-[0.78rem] text-sage-500">
            Or skip the scan and{" "}
            <Link href="/search" className="font-semibold text-forest-700 hover:underline">
              build the list by hand
            </Link>
            .
          </p>
        </div>
      </header>

      <div className="mt-8">
        <ReceiptScanner examples={examples} />
      </div>
    </div>
  );
}
