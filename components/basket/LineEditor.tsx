"use client";

import { motion } from "motion/react";
import { Stepper } from "@/components/ui/Stepper";
import { StoreBadge } from "@/components/brand/Logo";
import { formatPKR, formatQuantityInput } from "@/lib/engine/format";
import { normaliseQuantity, type ProductDetail } from "@/lib/types";
import type { BasketRow } from "@/lib/basket/store";
import type { BasketPlan } from "@/lib/engine/plan";
import { TrashIcon } from "@/components/ui/Icons";

/**
 * Basket line editor.
 *
 * Quantities are edited in the product's own unit (kg, L, dozen) rather than
 * "number of packs", because that is how people write a shopping list. The
 * engine decides how many packs that actually costs, and the line says so when
 * the shop can only sell a bigger pack.
 */

interface Props {
  rows: BasketRow[];
  products: Map<string, ProductDetail>;
  plan: BasketPlan | null;
  onChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export function LineEditor({ rows, products, plan, onChange, onRemove }: Props) {
  return (
    <ul className="divide-y divide-cream-200">
      {rows.map((row) => {
        const product = products.get(row.canonicalId);
        if (!product) {
          return (
            <li key={row.id} className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm text-sage-500">
                Unknown product <code className="rounded bg-cream-100 px-1">{row.canonicalId}</code>
              </span>
              <button
                onClick={() => onRemove(row.id)}
                className="text-[0.8rem] font-semibold text-spend"
              >
                Remove
              </button>
            </li>
          );
        }

        const qty = normaliseQuantity(product.defaultQuantity, product.unit);
        const step = stepFor(product.defaultQuantity, product.unit);
        const cheapest = cheapestCell(plan, row.id);
        const stockedAt = plan
          ? plan.quotes.filter((quote) => quote.lines.some((line) => line.lineId === row.id)).length
          : 0;

        return (
          <motion.li
            key={row.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="py-3.5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cream-100 text-xl ring-1 ring-inset ring-cream-200"
                aria-hidden="true"
              >
                {product.glyph}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{product.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.76rem] text-sage-500">
                  {cheapest ? (
                    <>
                      <span className="tabular font-semibold text-save">{formatPKR(cheapest.cost)}</span>
                      at {storeNameOf(plan, cheapest.storeId)}
                      <StoreBadge storeId={cheapest.storeId} size="sm" />
                      {cheapest.packs > 1 && <span>· {cheapest.packs} packs</span>}
                      {cheapest.surplus > 0.001 && (
                        <span className="text-warn">
                          · {formatQuantityInput(cheapest.surplus)} {product.unit} extra
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-warn">No shop in stock can supply this</span>
                  )}
                  {stockedAt > 0 && stockedAt < (plan?.quotes.length ?? 0) && (
                    <span className="text-sage-400">· {stockedAt} shops have it</span>
                  )}
                </p>
              </div>
            </div>

            {/* On a phone the controls wrap onto their own indented row; on a
                wide screen they join the line, so the row is not mostly air. */}
            <div className="order-last mt-2.5 flex w-full items-center justify-between gap-3 pl-[3.75rem] lg:order-none lg:mt-0 lg:w-auto lg:shrink-0 lg:justify-normal lg:pl-0">
              <Stepper
                size="sm"
                value={row.quantity}
                step={step}
                min={step}
                unit={qty.unit}
                label={product.name}
                onChange={(next) => (next <= 0 ? onRemove(row.id) : onChange(row.id, next))}
              />
              <button
                onClick={() => onRemove(row.id)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[0.76rem] font-medium text-sage-500 transition-colors hover:bg-spend-soft hover:text-spend"
                aria-label={`Remove ${product.name}`}
              >
                <TrashIcon className="h-4 w-4" />
                Remove
              </button>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

/** Sensible step: 1 kg staples move by 500 g, spices by 50 g, counts by 1. */
function stepFor(defaultQuantity: number, unit: string): number {
  if (unit === "g" && defaultQuantity >= 500) return 100;
  if (unit === "g") return 50;
  if (unit === "ml") return 250;
  if (unit === "kg" || unit === "L") return defaultQuantity >= 5 ? 1 : 0.5;
  return 1;
}

function cheapestCell(plan: BasketPlan | null, lineId: string) {
  if (!plan) return null;
  const cells = plan.matrix.filter((cell) => cell.lineId === lineId && cell.state === "ok");
  if (!cells.length) return null;
  return cells.reduce((best, cell) => (cell.cost < best.cost ? cell : best));
}

function storeNameOf(plan: BasketPlan | null, storeId: string) {
  return plan?.quotes.find((quote) => quote.storeId === storeId)?.store.name ?? storeId;
}

/** Cheaper swaps the engine found for the winning plan. */
export function AlternativeHints({ plan }: { plan: BasketPlan }) {
  if (!plan.alternatives.length) return null;
  return (
    <div className="space-y-2">
      {plan.alternatives.map((alternative) => (
        <div
          key={`${alternative.lineId}-${alternative.to.canonicalId}`}
          className="flex flex-wrap items-center gap-2 rounded-2xl bg-cream-100 px-3 py-2.5 text-[0.82rem]"
        >
          <StoreBadge storeId={alternative.storeId} size="sm" />
          <span className="text-ink-soft">
            {alternative.from.glyph} {alternative.from.name} → {alternative.to.glyph}{" "}
            <strong>{alternative.to.name}</strong>{" "}
            <span className="text-sage-500">({alternative.to.packLabel})</span>
          </span>
          <span className="ml-auto rounded-md bg-save-soft px-2 py-0.5 font-semibold text-save">
            saves {formatPKR(alternative.saving)}
          </span>
          {alternative.note && (
            <span className="w-full text-[0.74rem] text-sage-500">{alternative.note}</span>
          )}
        </div>
      ))}
    </div>
  );
}
