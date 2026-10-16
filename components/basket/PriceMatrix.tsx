"use client";

import { STORE_MAP } from "@/lib/catalog/stores";
import { formatPKR, formatPKRShort, formatQuantityInput, freshnessLabel } from "@/lib/engine/format";
import { normaliseQuantity } from "@/lib/types";
import type { BasketPlan } from "@/lib/engine/plan";
import type { ProductDetail } from "@/lib/types";

const REASON_LABEL: Record<string, string> = {
  "not-stocked": "not stocked",
  "out-of-stock": "out of stock",
  "unit-mismatch": "wrong unit",
  "locked-elsewhere": "pinned elsewhere",
  excluded: "excluded",
};

/**
 * The full comparison grid: every basket line against every store.
 *
 * Two rules this table exists to enforce:
 *   - the cheapest cell in each row is marked, always;
 *   - a store that cannot supply a line is shown as unavailable with a reason,
 *     never as a blank that reads like a zero.
 */
export function PriceMatrix({
  plan,
  products,
}: {
  plan: BasketPlan;
  products: Map<string, ProductDetail>;
}) {
  const stores = plan.quotes;
  const bestByLine = new Map<string, number>();
  for (const cell of plan.matrix) {
    if (cell.state !== "ok") continue;
    const current = bestByLine.get(cell.lineId);
    if (current === undefined || cell.cost < current) bestByLine.set(cell.lineId, cell.cost);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-cream-200 bg-white shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[54rem] border-collapse text-[0.82rem]">
        <caption className="sr-only">
          Basket line by supermarket price comparison, including delivery in the totals row
        </caption>
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[13rem] bg-cream-50 px-4 py-3 text-left font-semibold text-sage-600"
            >
              Your list
            </th>
            {stores.map((quote) => {
              const store = STORE_MAP[quote.storeId];
              return (
                <th
                  key={quote.storeId}
                  scope="col"
                  className="px-3 py-3 text-right font-semibold"
                  title={`${store.name} — ${formatPKR(store.deliveryFee)} delivery, free over ${formatPKRShort(store.freeDeliveryOver)}, min order ${formatPKRShort(store.minOrder)}`}
                >
                  <span className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: store.accent }}
                        aria-hidden="true"
                      />
                      {store.name}
                    </span>
                    <span className="text-[0.66rem] font-normal uppercase tracking-[0.06em] text-sage-400">
                      {quote.freeDelivery ? "free delivery" : `+${formatPKRShort(quote.delivery)} del.`}
                    </span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {plan.items.map((item) => {
            const product = products.get(item.canonicalId);
            const qty = product ? normaliseQuantity(item.quantity, product.unit) : null;
            return (
              <tr key={item.id} className="border-b border-cream-100 last:border-0 hover:bg-cream-50/60">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-normal"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-base" aria-hidden="true">
                      {product?.glyph ?? "❓"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{product?.name}</span>
                      <span className="block text-[0.72rem] text-sage-500">
                        {qty ? `${formatQuantityInput(qty.quantity)} ${qty.unit}` : ""}
                      </span>
                    </span>
                  </span>
                </th>
                {stores.map((quote) => {
                  const cell = plan.matrix.find(
                    (entry) => entry.lineId === item.id && entry.storeId === quote.storeId,
                  );
                  if (!cell || cell.state !== "ok") {
                    return (
                      <td key={quote.storeId} className="px-3 py-3 text-right">
                        <span
                          className="text-[0.72rem] text-sage-300"
                          title={REASON_LABEL[cell?.state ?? "not-stocked"]}
                        >
                          {REASON_LABEL[cell?.state ?? "not-stocked"] ?? "—"}
                        </span>
                      </td>
                    );
                  }
                  const isCheapest = cell.cost === bestByLine.get(item.id);
                  return (
                    <td key={quote.storeId} className="px-3 py-3 text-right">
                      <span
                        className={`tabular inline-flex flex-col items-end rounded-lg px-2 py-1 ${
                          isCheapest ? "bg-save-soft font-semibold text-save" : "text-ink-soft"
                        }`}
                        title={`${cell.packs} × ${cell.packLabel} · ${cell.brand} · updated ${freshnessLabel(cell.freshnessMins)}`}
                      >
                        {formatPKR(cell.cost)}
                        <span className="text-[0.66rem] font-normal text-sage-400">
                          {cell.packs > 1 ? `${cell.packs}× ${cell.packLabel}` : cell.packLabel}
                          {cell.promoLabel ? ` · ${cell.promoLabel}` : ""}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-cream-300 bg-cream-50">
            <th scope="row" className="sticky left-0 z-10 bg-cream-50 px-4 py-3 text-left font-semibold text-ink">
              Basket total
              <span className="block text-[0.7rem] font-normal text-sage-500">goods + delivery</span>
            </th>
            {stores.map((quote) => {
              const isBest = quote.eligible && quote.total === plan.savings.bestTotal;
              return (
                <td
                  key={quote.storeId}
                  className={`px-3 py-3 text-right ${isBest ? "bg-save-soft" : ""}`}
                >
                  <span className="tabular block font-semibold text-ink">
                    {quote.subtotal > 0 ? formatPKR(quote.total) : "—"}
                  </span>
                  <span className="block text-[0.68rem] font-normal text-sage-500">
                    {quote.missing.length > 0
                      ? `−${quote.missing.length} item${quote.missing.length === 1 ? "" : "s"}`
                      : quote.belowMinOrder
                        ? "below min order"
                        : `incl. ${quote.delivery === 0 ? "free" : formatPKRShort(quote.delivery)} del.`}
                  </span>
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
