"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Price, Tag } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { Stepper } from "@/components/ui/Stepper";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Primitives";
import { BasketIcon, CheckIcon } from "@/components/ui/Icons";
import { formatPKR, formatQuantityInput } from "@/lib/engine/format";
import { cheapestPack, familyOf } from "@/lib/engine/pricing";
import { useBasket } from "@/lib/basket/store";
import { useRouter } from "next/navigation";
import type { Offer, ProductDetail, Store, Unit } from "@/lib/types";

/**
 * One product, every shop.
 *
 * The honest unit here is price per base unit, not shelf price: a 5 kg bag is
 * not "more expensive" than a 1 kg bag, it is a different quantity. The list
 * therefore sorts on what you would actually pay for the amount you asked for,
 * and calls out the surplus when a shop only sells a bigger pack.
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
      if (!offers.length) reason = "Not available here";
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
  const { toast } = useToast();
  const router = useRouter();
  const [quantity, setQuantity] = useState(product.defaultQuantity);
  const rows = buildRows(product, stores, quantity);
  const priced = rows.filter((row) => row.best);
  const cheapest = priced.length ? Math.min(...priced.map((row) => row.best!.cost)) : 0;
  const dearest = priced.length ? Math.max(...priced.map((row) => row.best!.cost)) : 0;
  const spread = dearest - cheapest;
  const inBasket = quantityOf(product.id) > 0;
  const bestStore = priced.length
    ? priced.reduce((best, row) => (row.best!.cost < best.best!.cost ? row : best)).store
    : null;

  const steps = stepsFor(product);

  const addToBasket = () => {
    add(product.id, quantity);
    toast({
      title: `${product.glyph} ${product.name} added`,
      detail: `${formatQuantityInput(quantity)} ${product.unit} · ${formatPKR(cheapest)} at ${bestStore?.name ?? "the cheapest shop"}`,
      tone: "save",
      action: { label: "Basket", onClick: () => router.push("/basket") },
    });
  };

  return (
    // On a phone the buy card sits above the shop list; on a wide screen they
    // sit side by side, because a six-row price list in a 800px column is a
    // stretched phone, not a desktop layout.
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
      {/* quantity + headline price, one card, thumb height */}
      <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-sage-400">
              I want
            </p>
            <div className="mt-1.5">
              <Stepper
                value={quantity}
                step={steps[1]}
                min={steps[0]}
                unit={product.unit}
                label={product.name}
                onChange={setQuantity}
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-sage-400">
              Cheapest for that
            </p>
            <Price amount={cheapest} size="lg" tone="save" className="mt-1" />
            {bestStore && (
              <p className="mt-1 flex items-center justify-end gap-1.5 text-[0.76rem] text-sage-500">
                <StoreBadge storeId={bestStore.id} size="sm" />
                {bestStore.name}
              </p>
            )}
          </div>
        </div>

        {spread > 0 && (
          <div className="mt-4 border-t border-cream-200 pt-3.5">
            <div className="flex items-center justify-between text-[0.76rem]">
              <span className="text-sage-500">Cheapest</span>
              <span className="tabular font-semibold text-save">{formatPKR(cheapest)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cream-200">
              <motion.div
                className="h-full rounded-full bg-forest-500"
                initial={{ width: 0 }}
                animate={{ width: `${(cheapest / dearest) * 100}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[0.76rem]">
              <span className="text-sage-500">Dearest</span>
              <span className="tabular font-semibold text-ink">
                {formatPKR(dearest)}
                <span className="ml-1.5 rounded-md bg-spend-soft px-1.5 py-0.5 text-[0.68rem] font-bold text-spend">
                  +{formatPKR(spread)}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* the shop list */}
      <div className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-[var(--shadow-card)]">
        <h2 className="border-b border-cream-200 px-4 py-3 text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-sage-500">
          Every shop · {priced.length} can supply it
        </h2>
        <ul className="divide-y divide-cream-100">
          {rows.map((row, index) => {
            const isCheapest = !!row.best && row.best.cost === cheapest && spread > 0;
            return (
              <motion.li
                key={row.store.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.02 }}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  isCheapest ? "bg-save-soft/60" : ""
                }`}
              >
                <StoreBadge storeId={row.store.id} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <span className="truncate">{row.store.name}</span>
                    {isCheapest && <Tag tone="save">Lowest</Tag>}
                    {row.best && row.best.offer.stock === "low" && <Tag tone="warn">Low stock</Tag>}
                  </p>
                  {row.best ? (
                    <p className="mt-0.5 truncate text-[0.76rem] text-sage-500">
                      {row.best.packs > 1 ? `${row.best.packs} × ` : ""}
                      {row.best.offer.packLabel} · {row.best.offer.brand}
                      {row.best.offer.promo && (
                        <span className="ml-1 font-semibold text-save">
                          {row.best.offer.promo.label}
                        </span>
                      )}
                      {row.best.packs * row.best.offer.quantity > quantity + 1e-9 && (
                        <span className="ml-1 text-warn">
                          · {formatQuantityInput(
                            +(row.best.packs * row.best.offer.quantity - quantity).toFixed(2),
                          )}{" "}
                          {product.unit} extra
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[0.76rem] text-warn">{row.reason}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {row.best ? (
                    <>
                      <Price
                        amount={row.best.cost}
                        list={row.best.offer.listPrice}
                        size="md"
                        tone={isCheapest ? "save" : "default"}
                      />
                      <p className="text-[0.7rem] text-sage-400">
                        {formatPKR(row.best.unitPrice)} per {unitLabel(product.unit)}
                      </p>
                    </>
                  ) : (
                    <span className="text-[0.8rem] text-sage-300">—</span>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <p className="px-1 text-[0.78rem] leading-relaxed text-sage-500">
        Prices are per pack, ranked on what you would pay for {formatQuantityInput(quantity)}{" "}
        {product.unit}. Where a shop only sells a bigger pack, the price shown is what that shop
        would actually charge you.
      </p>

      {/* sticky add bar */}
      <div className="dock">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-sage-500">
              {formatQuantityInput(quantity)} {product.unit} · cheapest
            </p>
            <p className="tabular font-display text-[1.45rem] font-semibold leading-tight text-forest-950">
              {formatPKR(cheapest)}
            </p>
          </div>
          <Button
            variant={inBasket ? "accent" : "primary"}
            size="lg"
            onClick={addToBasket}
            className="min-w-[10.5rem]"
          >
            {inBasket ? <CheckIcon className="h-4 w-4" /> : <BasketIcon className="h-4 w-4" />}
            {inBasket ? "Add more" : "Add to basket"}
          </Button>
        </div>
      </div>
    </div>
  );
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
