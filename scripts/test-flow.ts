/**
 * Demo-order flow checks.
 *
 * The engine has its own harness (`test-engine.ts`); this one covers the part
 * that turns a plan into an order and an order into a progressing status — the
 * code behind /checkout and /order/[id]. It runs the same pure functions the
 * browser runs, so a broken checkout payload fails here rather than on stage.
 *
 *   npm run test:flow
 */

import { compareBasket, toBasketItems, type BasketItem } from "../lib/engine/plan";
import { getSnapshot } from "../lib/api/index";
import { EXAMPLE_BASKET } from "../lib/catalog/dataset";
import {
  ORDER_STAGES,
  clockLabel,
  progressFor,
  stageFor,
  type DemoOrder,
} from "../lib/orders/store";
import {
  ASAP_LEAD_MS,
  SLOT_LEAD_MS,
  asapSlot,
  buildSlots,
  etaFor,
} from "../lib/orders/slots";
import type { ProductDetail } from "../lib/types";

let checks = 0;
let failures = 0;

function ok(condition: boolean, label: string) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}

function equal<T>(actual: T, expected: T, label: string) {
  ok(Object.is(actual, expected), `${label} — expected ${String(expected)}, got ${String(actual)}`);
}

async function main() {
  const snapshot = await getSnapshot();
  const products = new Map<string, ProductDetail>(snapshot.products.map((p) => [p.id, p]));
  const rows = EXAMPLE_BASKET.map((entry, index) => ({
    id: `line-${index}`,
    canonicalId: entry.canonicalId,
    quantity: entry.quantity,
  }));
  const items: BasketItem[] = toBasketItems(rows, products);
  const plan = compareBasket(items, products, snapshot.stores);

  console.log("Checkout payload");
  ok(!!plan.bestPlan, "the example basket produces a plan");
  if (!plan.bestPlan) {
    console.log(`\n${failures} FAILED`);
    process.exit(1);
  }

  const best = plan.bestPlan;
  const itemsById = new Map(plan.items.map((item) => [item.id, item]));

  // Exactly what /checkout hands to the order store.
  const shops = best.orders.map((order) => ({
    storeId: order.storeId,
    storeName: order.store.name,
    lines: order.lines.map((line) => {
      const item = itemsById.get(line.lineId);
      const product = products.get(line.canonicalId);
      return {
        canonicalId: line.canonicalId,
        name: line.name,
        glyph: line.glyph,
        quantity: item?.quantity ?? 0,
        unit: item?.unit ?? product?.unit ?? "piece",
        packLabel: `${line.choice.packs > 1 ? `${line.choice.packs} × ` : ""}${line.choice.offer.packLabel}`,
        cost: line.choice.cost,
      };
    }),
    subtotal: order.subtotal,
    delivery: order.delivery,
    deliveryKnown: order.deliveryKnown,
    freeDelivery: order.freeDelivery,
  }));

  equal(shops.length, best.storeCount, "one order per shop in the plan");
  equal(
    shops.reduce((sum, shop) => sum + shop.lines.length, 0),
    plan.items.length,
    "every basket line lands in exactly one shop order",
  );
  equal(
    Math.round(shops.reduce((sum, shop) => sum + shop.subtotal, 0)),
    Math.round(best.subtotal),
    "shop subtotals add up to the plan subtotal",
  );
  equal(
    Math.round(shops.reduce((sum, shop) => sum + (shop.deliveryKnown ? shop.delivery : 0), 0)),
    Math.round(best.delivery),
    "only published delivery charges are counted",
  );
  equal(
    Math.round(best.subtotal + best.delivery),
    Math.round(best.total),
    "plan total reconciles with goods + counted delivery",
  );

  for (const shop of shops) {
    equal(
      Math.round(shop.lines.reduce((sum, line) => sum + line.cost, 0)),
      Math.round(shop.subtotal),
      `${shop.storeName}: line costs add up to its subtotal`,
    );
  }

  const quantities = new Map<string, number>();
  for (const shop of shops) {
    for (const line of shop.lines) {
      quantities.set(line.canonicalId, (quantities.get(line.canonicalId) ?? 0) + line.quantity);
    }
  }
  for (const item of plan.items) {
    equal(
      quantities.get(item.canonicalId) ?? 0,
      item.quantity,
      `${item.canonicalId}: the ordered quantity matches the basket`,
    );
  }

  const baseline = plan.worstSingle?.total ?? best.total;
  const saved = plan.savings.bestVsWorst;
  ok(baseline > 0, "there is a dearest-shop baseline to compare against");
  equal(Math.round(baseline - best.total), Math.round(saved), "the saving is exactly baseline − total");
  ok(saved >= 0, "the saving is never negative");

  const createdAt = 1_700_000_000_000;
  const order: DemoOrder = {
    id: "KRT-TEST",
    createdAt,
    address: { name: "Test", phone: "0300 000 0000", line1: "Test Street", area: "Karachi" },
    slot: "Today 6pm–8pm",
    etaAt: createdAt + 30 * 60 * 1000,
    payment: "Cash on delivery",
    shops,
    goods: best.subtotal,
    delivery: best.delivery,
    deliveryKnown: best.deliveryKnown,
    total: best.total,
    baseline,
    saved,
    itemCount: plan.items.length,
  };

  console.log("Order status progression");
  equal(stageFor(order, order.createdAt), "confirmed", "a fresh order is confirmed");
  equal(stageFor(order, order.createdAt + 30_000), "packing", "30s in, it is being picked");
  equal(stageFor(order, order.createdAt + 70_000), "out-for-delivery", "70s in, it is on its way");
  equal(stageFor(order, order.createdAt + 200_000), "delivered", "after the last stage it stays delivered");
  equal(progressFor(order, order.createdAt), 0, "progress starts at zero");
  equal(progressFor(order, order.createdAt + 10_000_000), 1, "progress never runs past 100%");
  ok(progressFor(order, order.createdAt + 60_000) > 0, "progress moves before the end");

  let previous = "";
  for (const stage of ORDER_STAGES) {
    equal(stageFor(order, createdAt + stage.atMs), stage.id, `${stage.id} is reached at its own timestamp`);
    ok(stage.id !== previous, `${stage.id} is not a duplicate stage`);
    previous = stage.id;
  }

  console.log("Delivery timing");
  const clock = new Date(createdAt);
  const asap = asapSlot(clock);
  const windows = buildSlots(clock);
  equal(asap.label, "ASAP", "the live option is labelled ASAP");
  ok(
    asap.hint.includes(clockLabel(createdAt + ASAP_LEAD_MS)),
    "the ASAP hint quotes the exact time the order will later estimate",
  );
  equal(
    etaFor(asap, createdAt),
    createdAt + ASAP_LEAD_MS,
    "an ASAP order is estimated one lead time after it is placed",
  );
  ok(windows.length >= 2, "scheduled windows are still offered next to ASAP");
  for (const entry of windows) {
    ok(entry.startAt > createdAt, `${entry.label}: a window never opens in the past`);
    equal(
      etaFor(entry, createdAt),
      entry.startAt + SLOT_LEAD_MS,
      `${entry.label}: a window is quoted inside itself, not from now`,
    );
  }
  for (const hour of [0, 3, 9, 17, 21, 23]) {
    const late = new Date(2026, 9, 24, hour, 5);
    const list = buildSlots(late);
    equal(list.length, 3, `${String(hour).padStart(2, "0")}:05 still offers three windows`);
    ok(
      list.every((entry) => entry.startAt > late.getTime()),
      `${String(hour).padStart(2, "0")}:05 offers no window that has already closed`,
    );
  }

  const asapOrder: DemoOrder = { ...order, slot: asap.label, etaAt: etaFor(asap, order.createdAt) };
  ok(asapOrder.etaAt > asapOrder.createdAt, "the ASAP estimate is in the future");
  for (const stage of ORDER_STAGES) {
    equal(
      stageFor(asapOrder, createdAt + stage.atMs),
      stage.id,
      `choosing ASAP does not change when ${stage.id} is reached`,
    );
  }

  console.log(
    failures === 0 ? `\n${checks}/${checks} checks passed\nOrder flow OK` : `\n${failures} FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
