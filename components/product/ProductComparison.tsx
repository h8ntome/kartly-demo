"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Button, Price, Tag } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { formatPKR, formatQuantityInput, freshnessLabel, freshnessTone } from "@/lib/engine/format";
import { cheapestPack, familyOf } from "@/lib/engine/pricing";
import { useBasket } from "@/lib/basket/store";
import type { Offer, ProductDetail, Store, Unit } from "@/lib/types";

/**
 * One product, nine shops.
 *
 * The honest unit here is price per base unit, not shelf price: a 5 kg bag is
 * not "more expensive" than a 1 kg bag, it is a different quantity. The table
 * therefore sorts on unit price and shows the pack it came from, and the
 * quantity selector re-prices every store for the amount actually wanted.
 */

interface Row {
  store: Store;
  offers: Offer[];
  best: { cost: number; packs: number; offer: Offer; unitPrice: number } | null;
  reason: string | null;
}

function buildRows(product: ProductDetail, stores: Store[], quantity: number): Row[] {
  const byStore = new Map<string, Offer[]>();
  for (const offer of product.offers) {
    const list = byStore.get(offer.storeId);
    if (list) list.push(offer);
    else byStore.set(offer.storeId, [offer]);
  }

  return stores
    .map((store) => {
      const offers = byStore.get(store.id) ?? [];
      const choice = offers.length ? cheapestPack(offers, quantity, product.unit) : null;
      let reason: string | null = null;
      if (!offers.length) reason = "Not stocked here";
      else if (!offers.some((offer) => familyOf(offer.unit) === familyOf(product.unit))) {
        reason = "Sold in a different unit";
      } else if (!choice) reason = "Out of stock";
      return {
        store,
        offers,
        reason,
        best: choice
          ? {
              cost: choice.cost,
              packs: choice.packs,
              offer: choice.offer,
              unitPrice: choice.unitPrice,
            }
          : null,
      };
    })
    .sort((a, b) => {
      if (!a.best && !b.best) return 0;
      if (!a.best) return 1;
      if (!b.best) return 0 - 1;
      return a.best.cost - b.best.cost;
    });
}

export function ProductComparison({
  product,
  stores,
}: {
  product: ProductDetail;
  stores: Store[];
}) {
  const { add, quantityOf } = useBasket();
  const [quantity, setQuantity] = useState(product.defaultQuantity);
  const rows = buildRows(product, stores, quantity);
  const priced = rows.filter((row) => row.best);
  const cheapest = priced.length ? Math.min(...priced.map((row) => row.best!.cost)) : 0;
  const dearest = priced.length ? Math.max(...priced.map((row) => row.best!.cost)) : 0;
  const spread = dearest - cheapest;
  const inBasket = quantityOf(product.id) > 0;

  const steps = stepsFor(product);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-sage-400">
            I want
          </p>
          <div className="mt-1.5 flex items-center gap-1 rounded-xl border border-cream-300 bg-white p-1">
            <button
              onClick={() => setQuantity((value) => Math.max(steps[0], +(value - steps[1]).toFixed(3)))}
              className="grid h-8 w-8 place-items-center rounded-lg text-lg text-forest-800 hover:bg-cream-100"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="tabular min-w-[5.5rem] text-center font-semibold">
              {formatQuantityInput(quantity)} {product.unit}
            </span>
            <button
              onClick={() => setQuantity((value) => +(value + steps[1]).toFixed(3))}
              className="grid h-8 w-8 place-items-center rounded-lg text-lg text-forest-800 hover:bg-cream-100"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>

        <div className="hidden h-12 w-px bg-cream-200 sm:block" />

        <div className="min-w-[10rem]">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-sage-400">
            Cheapest for that
          </p>
          <Price amount={cheapest} size="lg" tone="save" className="mt-1" />
        </div>

        {spread > 0 && (
          <div className="rounded-xl bg-save-soft px-3 py-2">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-save/70">
              Cheapest vs dearest
            </p>
            <p className="tabular font-display text-lg font-semibold text-save">
              {formatPKR(spread)}
            </p>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant={inBasket ? "accent" : "primary"} onClick={() => add(product.id, quantity)}>
            {inBasket ? `Add ${formatQuantityInput(quantity)} ${product.unit} more` : "Add to basket"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[var(--shadow-card)]">
        <ul className="divide-y divide-cream-200">
          {rows.map((row, index) => {
            const isCheapest = !!row.best && row.best.cost === cheapest && spread > 0;
            const tone = row.best ? freshnessTone(row.best.offer.freshnessMins) : "stale";
            return (
              <motion.li
                key={row.store.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.02 }}
                className={`flex flex-wrap items-center gap-4 px-5 py-4 sm:flex-nowrap ${
                  isCheapest ? "bg-save-soft/60" : ""
                }`}
              >
                <StoreBadge storeId={row.store.id} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{row.store.name}</p>
                  {row.best ? (
                    <p className="mt-0.5 truncate text-[0.78rem] text-sage-500">
                      {row.best.packs > 1 ? `${row.best.packs} × ` : ""}
                      {row.best.offer.packLabel} · {row.best.offer.brand}
                      {row.best.offer.promo && (
                        <span className="ml-1 font-semibold text-save">{row.best.offer.promo.label}</span>
                      )}
                      {row.best.packs * row.best.offer.quantity > quantity + 1e-9 && (
                        <span className="ml-1 text-warn">
                          · {formatQuantityInput(+(row.best.packs * row.best.offer.quantity - quantity).toFixed(2))}{" "}
                          {product.unit} extra
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[0.78rem] text-warn">{row.reason}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 sm:gap-6">
                  {row.best && (
                    <span className="hidden text-right text-[0.74rem] leading-tight text-sage-500 sm:block">
                      {formatPKR(row.best.unitPrice)}
                      <span className="block text-[0.68rem]">per {unitLabel(product.unit)}</span>
                    </span>
                  )}
                  <div className="w-[7.5rem] text-right">
                    {row.best ? (
                      <>
                        <Price
                          amount={row.best.cost}
                          list={row.best.offer.listPrice}
                          size="md"
                          tone={isCheapest ? "save" : "default"}
                        />
                        <span className="mt-0.5 flex items-center justify-end gap-1.5">
                          <FreshnessDot tone={tone} />
                          <span className="text-[0.7rem] text-sage-400">
                            {freshnessLabel(row.best.offer.freshnessMins)}
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="text-[0.8rem] text-sage-300">—</span>
                    )}
                  </div>
                  {isCheapest && <Tag tone="save">Lowest</Tag>}
                  {row.best && row.best.offer.stock === "low" && <Tag tone="warn">Low stock</Tag>}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <p className="max-w-3xl text-[0.82rem] leading-relaxed text-sage-600">
        Prices are per pack, converted to {unitLabel(product.unit)} for the ranking. Where a shop only
        sells a larger pack than you asked for, the price shown is what that shop would actually
        charge you — the surplus is called out rather than hidden.
      </p>
    </div>
  );
}

function FreshnessDot({ tone }: { tone: "fresh" | "recent" | "stale" }) {
  const colour =
    tone === "fresh" ? "var(--color-forest-400)" : tone === "recent" ? "var(--color-warn)" : "var(--color-sage-300)";
  return <span className="h-1.5 w-1.5 rounded-full" style={{ background: colour }} aria-hidden="true" />;
}

function unitLabel(unit: Unit): string {
  if (unit === "kg") return "kg";
  if (unit === "L") return "litre";
  if (unit === "dozen") return "dozen";
  if (unit === "piece") return "piece";
  return unit;
}

function stepsFor(product: ProductDetail): [number, number] {
  switch (product.unit) {
    case "g":
      return [50, product.defaultQuantity >= 500 ? 100 : 50];
    case "ml":
      return [100, 250];
    case "kg":
    case "L":
      return [0.5, product.defaultQuantity >= 5 ? 1 : 0.5];
    default:
      return [1, 1];
  }
}
