"use client";

import { motion } from "motion/react";
import { Button, Price } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { formatPKR, formatQuantityInput } from "@/lib/engine/format";
import { normaliseQuantity, type ProductDetail } from "@/lib/types";
import type { BasketRow } from "@/lib/basket/store";
import type { BasketPlan } from "@/lib/engine/plan";

/**
 * Basket line editor.
 *
 * Quantities are edited in the product's own unit (kg, L, dozen) rather than
 * "number of packs", because that is how people write a shopping list. The
 * engine decides how many packs that actually costs.
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
              <Button size="sm" variant="danger" onClick={() => onRemove(row.id)}>
                Remove
              </Button>
            </li>
          );
        }

        const qty = normaliseQuantity(product.defaultQuantity, product.unit);
        const step = stepFor(product.defaultQuantity, product.unit);
        const cheapest = cheapestCell(plan, row.id);
        const availableEverywhere =
          plan && plan.quotes.filter((quote) => quote.lines.some((line) => line.lineId === row.id));
        const missingCount = plan ? plan.quotes.length - (availableEverywhere?.length ?? 0) : 0;

        return (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-3.5 sm:flex-nowrap">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream-100 text-xl ring-1 ring-inset ring-cream-200"
              aria-hidden="true"
            >
              {product.glyph}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{product.name}</p>
              <p className="mt-0.5 text-[0.76rem] text-sage-500">
                {cheapest ? (
                  <>
                    Cheapest {formatPKR(cheapest.cost)} at{" "}
                    <span className="font-semibold text-save">{storeNameOf(plan, cheapest.storeId)}</span>
                    {cheapest.packs > 1 && ` · ${cheapest.packs} packs`}
                    {cheapest.surplus > 0.001 &&
                      ` · you get ${formatQuantityInput(cheapest.surplus)} ${product.unit} extra`}
                  </>
                ) : (
                  <span className="text-warn">No store in stock can supply this</span>
                )}
                {missingCount > 0 && <span className="text-warn"> · out of reach at {missingCount} stores</span>}
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-cream-300 bg-white p-1">
              <StepButton
                label={`Decrease ${product.name}`}
                onClick={() => onChange(row.id, +(row.quantity - step).toFixed(3))}
                disabled={row.quantity <= step}
              >
                −
              </StepButton>
              <span className="tabular min-w-[4.6rem] text-center text-[0.82rem] font-semibold text-ink">
                {formatQuantityInput(row.quantity)} {qty.unit}
              </span>
              <StepButton
                label={`Increase ${product.name}`}
                onClick={() => onChange(row.id, +(row.quantity + step).toFixed(3))}
              >
                +
              </StepButton>
            </div>

            <div className="w-[6.5rem] text-right">
              {cheapest ? (
                <Price amount={cheapest.cost} size="sm" tone="muted" />
              ) : (
                <span className="text-[0.78rem] text-sage-400">—</span>
              )}
            </div>

            <button
              onClick={() => onRemove(row.id)}
              className="grid h-8 w-8 place-items-center rounded-lg text-sage-400 transition-colors hover:bg-spend-soft hover:text-spend"
              aria-label={`Remove ${product.name}`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M5.5 5.5l9 9m0-9l-9 9"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-lg text-[1.05rem] leading-none text-forest-800 transition-colors hover:bg-cream-100 disabled:opacity-30"
    >
      {children}
    </motion.button>
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
          className="flex flex-wrap items-center gap-2 rounded-xl bg-cream-100 px-3 py-2.5 text-[0.82rem]"
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
