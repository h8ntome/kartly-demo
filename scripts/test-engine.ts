/**
 * Engine test harness — plain assertions, no test framework.
 *
 * Run with `npm test`. Two jobs:
 *
 *   1. Prove the catalogue is exactly the supplied data — six stores, five
 *      products, every price and every "not available" as given.
 *   2. Prove the arithmetic invariants: totals close, unavailable lines are
 *      never priced, unknown delivery fees are never counted as free, and the
 *      optimiser matches a hand-enumerated optimum.
 */

import { buildOfferIndex } from "@/lib/engine/quotes";
import { findBestSplit } from "@/lib/engine/optimizer";
import { findBestPlan, MAX_PLAN_STORES } from "@/lib/engine/multi";
import { localProvider } from "@/lib/api/providers/local";
import { compareBasket, toBasketItems } from "@/lib/engine/plan";
import {
  cheapestPack,
  deliveryFor,
  lineCost,
  freePacks,
  meetsMinimum,
} from "@/lib/engine/pricing";
import { parseReceiptText, EXAMPLE_RECEIPTS_FOR_TEST } from "@/lib/receipt/test-fixtures";
import { EXAMPLE_BASKET, PRICES } from "@/lib/catalog/dataset";
import { STORE_IDS, type ProductDetail, type StoreId } from "@/lib/types";

let failures = 0;
let checks = 0;

function ok(condition: boolean, label: string, detail = "") {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string) {
  ok(actual === expected, label, `got ${String(actual)}, expected ${String(expected)}`);
}

function group(label: string) {
  console.log(`\n${label}`);
}

const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/* ------------------------------------------------------------------ *
 * The data exactly as supplied. Hard-coded here on purpose: if the
 * catalogue drifts, this table is what catches it.
 * ------------------------------------------------------------------ */

const SUPPLIED_PRODUCTS = [
  "Nestlé Nesvita",
  "Falak Select Basmati Rice (5kg)",
  "Nurpur Butter",
  "Eva Canola Oil (5 Litres)",
  "Cocomo Cereal",
];

const SUPPLIED_STORES = ["Hydri", "Carrefour", "Naheed", "Springs", "Bin Hashim", "Chase Up"];

const SUPPLIED_PRICES: Record<string, Record<string, number | null>> = {
  "Nestlé Nesvita": {
    Hydri: 405,
    Carrefour: 405,
    Naheed: 410,
    Springs: 410,
    "Bin Hashim": 399,
    "Chase Up": 405,
  },
  "Falak Select Basmati Rice (5kg)": {
    Hydri: 2124,
    Carrefour: 2130,
    Naheed: null,
    Springs: 2245,
    "Bin Hashim": 2154,
    "Chase Up": 2145,
  },
  "Nurpur Butter": {
    Hydri: 410,
    Carrefour: 420,
    Naheed: 420,
    Springs: 420,
    "Bin Hashim": null,
    "Chase Up": 415,
  },
  "Eva Canola Oil (5 Litres)": {
    Hydri: 3190,
    Carrefour: null,
    Naheed: 3200,
    Springs: 3300,
    "Bin Hashim": 3113,
    "Chase Up": 3015,
  },
  "Cocomo Cereal": {
    Hydri: null,
    Carrefour: null,
    Naheed: null,
    Springs: 699,
    "Bin Hashim": 665,
    "Chase Up": 699,
  },
};

async function main() {
  const snapshot = await localProvider.load();
  const products = new Map<string, ProductDetail>(snapshot.products.map((p) => [p.id, p]));
  const stores = snapshot.stores;

  /* ------------------------------------------------------- catalogue */
  group("Catalogue shape");
  equal(stores.length, 6, "exactly six stores");
  equal(snapshot.products.length, 5, "exactly five products");
  equal(
    stores.map((s) => s.name).join(", "),
    SUPPLIED_STORES.join(", "),
    "the stores are the six supplied",
  );
  equal(
    snapshot.products.map((p) => p.name).join(", "),
    SUPPLIED_PRODUCTS.join(", "),
    "the products are the five supplied",
  );
  equal(
    [...STORE_IDS].join(","),
    stores.map((s) => s.id).join(","),
    "STORE_IDS matches the store list",
  );
  equal(snapshot.source, "supplied", "the snapshot declares where its prices came from");
  equal(snapshot.generatedAt, null, "no collection timestamp is invented");

  const offerCount = snapshot.products.reduce((n, p) => n + p.offers.length, 0);
  const expectedPrices = Object.values(SUPPLIED_PRICES).reduce(
    (n, byStore) => n + Object.values(byStore).filter((p) => p !== null).length,
    0,
  );
  equal(offerCount, expectedPrices, "one offer per supplied price, none invented");
  equal(expectedPrices, 24, "the supplied table holds 24 prices and 6 gaps");

  group("Every price matches the supplied table");
  for (const product of snapshot.products) {
    const expected = SUPPLIED_PRICES[product.name];
    ok(!!expected, `${product.name} is a supplied product`);
    if (!expected) continue;
    for (const store of stores) {
      const want = expected[store.name];
      const offer = product.offers.find((o) => o.storeId === store.id);
      if (want === null) {
        ok(offer === undefined, `${product.name} at ${store.name}: not available, no offer`);
        continue;
      }
      ok(!!offer, `${product.name} at ${store.name}: has an offer`);
      if (!offer) continue;
      equal(offer.price, want, `${product.name} at ${store.name}: price`);
      ok(offer.inStock, `${product.name} at ${store.name}: available`);
      ok(offer.promo == null, `${product.name} at ${store.name}: no invented discount`);
      ok(offer.listPrice == null, `${product.name} at ${store.name}: no invented strike-through`);
      ok(
        offer.freshnessMins == null,
        `${product.name} at ${store.name}: no invented price age`,
      );
    }
  }

  group("No fake data anywhere in the catalogue");
  for (const product of snapshot.products) {
    ok(product.swapIds === undefined || product.swapIds.length === 0, `${product.name}: no invented swaps`);
    for (const offer of product.offers) {
      ok(offer.price > 0, `${product.name} at ${offer.storeId}: price is never zero`);
      ok(offer.title === product.name, `${product.name} at ${offer.storeId}: title is the product name`);
    }
  }

  /* ------------------------------------------------------- delivery */
  group("Delivery rules");
  const byName = new Map(stores.map((s) => [s.name, s]));
  const hydri = byName.get("Hydri")!;
  const binHashim = byName.get("Bin Hashim")!;

  equal(hydri.freeDeliveryOver, 2000, "Hydri's free-delivery threshold is Rs 2,000");
  equal(hydri.deliveryFee, null, "Hydri's charge below the threshold is unknown");
  equal(binHashim.deliveryFee, 99, "Bin Hashim charges Rs 99");
  for (const store of stores) {
    if (store.name === "Bin Hashim" || store.name === "Hydri") continue;
    equal(store.deliveryFee, null, `${store.name}: delivery fee is unknown, not zero`);
    equal(store.freeDeliveryOver, null, `${store.name}: no free-delivery threshold is claimed`);
  }
  for (const store of stores) {
    equal(store.minOrder, null, `${store.name}: no minimum order is claimed`);
    ok(meetsMinimum(store, 1), `${store.name}: any order clears an unknown minimum`);
  }

  // Hydri's rule is "free above Rs 2,000": exactly 2,000 does not qualify.
  equal(deliveryFor(hydri, 1999).status, "unknown", "Hydri at Rs 1,999: fee unknown");
  equal(deliveryFor(hydri, 1999).fee, 0, "Hydri at Rs 1,999: nothing is invented into the total");
  equal(deliveryFor(hydri, 2000).status, "unknown", "Hydri at exactly Rs 2,000: still not free");
  equal(deliveryFor(hydri, 2001).status, "free", "Hydri at Rs 2,001: free delivery");
  equal(deliveryFor(hydri, 2001).fee, 0, "Hydri above the threshold: free");
  equal(deliveryFor(binHashim, 500).fee, 99, "Bin Hashim charges Rs 99 on a small order");
  equal(deliveryFor(binHashim, 50_000).fee, 99, "Bin Hashim charges Rs 99 on a big order too");
  equal(deliveryFor(byName.get("Naheed")!, 5000).status, "unknown", "Naheed: fee stays unknown");
  equal(deliveryFor(byName.get("Naheed")!, 5000).fee, 0, "Naheed: unknown is not counted as free");
  equal(deliveryFor(hydri, 0).status, "no-order", "an empty basket has no delivery");

  /* ------------------------------------------------------- baskets */
  const runBasket = (
    seed: Array<{ canonicalId: string; quantity: number }>,
    label: string,
  ) => {
    group(label);
    const rows = seed.map((entry, i) => ({
      id: `line-${i}`,
      canonicalId: entry.canonicalId,
      quantity: entry.quantity,
    }));
    const items = toBasketItems(rows, products);
    equal(items.length, seed.length, "every seed line resolved to an engine item");

    const plan = compareBasket(items, products, stores);
    equal(plan.quotes.length, stores.length, "one quote per store");
    ok(!!plan.bestSingle, "some single store can supply the whole basket");
    ok(plan.unfulfillable.length === 0, "every line is available somewhere");

    // Quote arithmetic, and the rule that a store that cannot fill the basket
    // is never offered as a single-store option.
    for (const quote of plan.quotes) {
      const sum = quote.lines.reduce((total, line) => total + line.cost, 0);
      ok(Math.abs(sum - quote.subtotal) < 1, `${quote.store.name}: subtotal equals the line sum`);
      ok(
        Math.abs(quote.total - (quote.subtotal + quote.delivery)) < 1,
        `${quote.store.name}: total equals subtotal + counted delivery`,
      );
      const expected = deliveryFor(quote.store, quote.subtotal);
      equal(quote.delivery, expected.fee, `${quote.store.name}: delivery matches the store's rule`);
      equal(quote.deliveryKnown, expected.known, `${quote.store.name}: delivery certainty`);
      if (quote.deliveryKnown) {
        ok(quote.totalCertain, `${quote.store.name}: a known fee makes the total final`);
      } else {
        equal(quote.delivery, 0, `${quote.store.name}: an unknown fee contributes nothing`);
      }
      for (const line of quote.lines) {
        ok(line.cost > 0, `${quote.store.name}/${line.name}: positive line cost`);
        const price = products.get(line.canonicalId)!.offers.find((o) => o.storeId === quote.storeId)!.price;
        equal(
          line.cost,
          price * line.packs,
          `${quote.store.name}/${line.name}: charged at the supplied price`,
        );
      }
      for (const missing of quote.missing) {
        const offer = products
          .get(missing.canonicalId)!
          .offers.find((o) => o.storeId === quote.storeId);
        ok(
          offer === undefined || !offer.inStock,
          `${quote.store.name}: “${missing.name}” is only missing when it really is unavailable`,
        );
        ok(
          !quote.lines.some((l) => l.canonicalId === missing.canonicalId),
          `${quote.store.name}: an unavailable line is never also priced`,
        );
      }
      if (quote.complete) {
        equal(quote.lines.length, items.length, `${quote.store.name}: complete quote has every line`);
      }
    }

    // Best single store really is the cheapest eligible one, and is complete.
    const complete = plan.quotes.filter((q) => q.eligible);
    ok(complete.length > 0, "at least one store can fill the basket");
    if (complete.length) {
      const minTotal = Math.min(...complete.map((q) => q.total));
      equal(plan.bestSingle!.total, minTotal, "best single store is the cheapest eligible quote");
      ok(plan.bestSingle!.complete, "the recommended single store can supply every line");
      for (const quote of plan.quotes.filter((q) => !q.complete)) {
        ok(
          quote.missing.length > 0,
          `${quote.store.name}: excluded from single-store only because it is missing lines`,
        );
      }
    }

    if (plan.bestPlan) {
      const best = plan.bestPlan;
      const sub = best.orders.reduce((sum, order) => sum + order.subtotal, 0);
      const del = best.orders.reduce((sum, order) => sum + order.delivery, 0);
      ok(
        Math.abs(best.total - (sub + del)) < 1,
        "plan total equals every subtotal plus every counted delivery",
      );
      equal(best.storeCount, best.orders.length, "plan reports the shop count it actually uses");
      equal(
        new Set(best.orders.map((o) => o.storeId)).size,
        best.storeCount,
        "no shop is ordered from twice",
      );
      ok(best.orders.every((order) => order.lines.length > 0), "every order in the plan is non-empty");
      const covered = best.orders.reduce((sum, order) => sum + order.lines.length, 0);
      equal(covered, items.length, "the plan covers every line exactly once");
      const lineIds = best.orders.flatMap((order) => order.lines.map((line) => line.lineId));
      equal(new Set(lineIds).size, lineIds.length, "no line is bought twice");
      for (const order of best.orders) {
        const store = stores.find((s) => s.id === order.storeId)!;
        ok(meetsMinimum(store, order.subtotal), `${store.name}: order clears the store's minimum`);
        const lineSum = order.lines.reduce((sum, line) => sum + line.choice.cost, 0);
        ok(Math.abs(lineSum - order.subtotal) < 1, `${store.name}: order subtotal equals its line sum`);
        for (const line of order.lines) {
          ok(
            products.get(line.canonicalId)!.offers.some((o) => o.storeId === store.id && o.inStock),
            `${store.name}: actually has ${line.name}`,
          );
        }
      }
      if (plan.bestSingle) {
        ok(
          best.total <= plan.bestSingle.total + 1,
          "the plan never costs more than the best single store",
          `${money(best.total)} vs ${money(plan.bestSingle.total)}`,
        );
        equal(
          best.savingsVsSingle,
          Math.max(0, plan.bestSingle.total - best.total),
          "plan savings equals the real difference vs the best single store",
        );
      }
      const unknown = best.orders.filter((o) => !o.deliveryKnown).length > 0;
      equal(best.deliveryKnown, !unknown, "plan knows whether every delivery fee is known");
      equal(plan.savings.savingsCertain, !unknown, "savings are only certain without unknown fees");
      equal(
        plan.savings.deliveryUnknownStores.length,
        best.orders.filter((o) => !o.deliveryKnown).length,
        "every shop with an unknown fee is listed",
      );
    }

    ok(
      plan.cherryPick <= plan.savings.bestTotal + 1,
      "cherry-picked floor never exceeds the real best total",
      `${money(plan.cherryPick)} vs ${money(plan.savings.bestTotal)}`,
    );
    ok(plan.savings.remainingGap >= 0, "remaining gap is never negative");
    if (plan.worstSingle) {
      ok(plan.savings.bestVsWorst >= 0, "best option never costs more than the worst option");
    }

    // Matrix agrees with quotes, and unavailable cells are marked, not zeroed.
    for (const quote of plan.quotes) {
      for (const line of quote.lines) {
        const cell = plan.matrix.find(
          (c) => c.lineId === line.lineId && c.storeId === quote.storeId,
        );
        ok(
          !!cell && cell.state === "ok" && cell.cost === line.cost,
          `matrix agrees with the ${quote.store.name} quote for ${line.name}`,
        );
      }
    }
    for (const cell of plan.matrix) {
      if (cell.state === "ok") continue;
      equal(cell.cost, 0, "an unavailable cell carries no price");
    }

    console.log(
      `  best single: ${plan.bestSingle?.store.name} ${money(plan.bestSingle?.total ?? 0)}` +
        ` | plan: ${
          plan.bestPlan
            ? `${plan.bestPlan.orders.map((o) => o.storeId).join("+")} ${money(plan.bestPlan.total)} (${plan.bestPlan.storeCount} shops)`
            : "none"
        }` +
        ` | floor ${money(plan.cherryPick)} | worst ${money(plan.worstSingle?.total ?? 0)}` +
        ` | ${plan.meta.setsEvaluated} assignments climbed${plan.exact ? "" : " (best option found)"}`,
    );
    return plan;
  };

  runBasket(EXAMPLE_BASKET, "Example basket (one of everything)");

  // A basket that only some stores can fill: cereal is at three shops only.
  runBasket(
    [
      { canonicalId: "cocomo-cereal", quantity: 2 },
      { canonicalId: "nurpur-butter", quantity: 1 },
    ],
    "Split basket (cereal + butter)",
  );

  // A basket whose cheapest-looking store cannot fill it at all.
  runBasket(
    [
      { canonicalId: "eva-canola-oil", quantity: 5 },
      { canonicalId: "cocomo-cereal", quantity: 1 },
    ],
    "Availability basket (oil + cereal)",
  );

  /* ------------------------------------------------- split search */
  group("Split search correctness");
  {
    const rows = EXAMPLE_BASKET.map((entry, i) => ({
      id: `s-${i}`,
      canonicalId: entry.canonicalId,
      quantity: entry.quantity,
    }));
    const items = toBasketItems(rows, products);
    const input = { items, products, stores };
    const index = buildOfferIndex(products.values());
    const pruned = findBestSplit(items, input, index);
    const exhaustiveAll = findBestSplit(items, input, index, { prune: false });
    ok(
      !!pruned.best && !!exhaustiveAll.best && pruned.best.total === exhaustiveAll.best.total,
      "lower-bound pruning never changes the winning split",
      `${pruned.best?.total} vs ${exhaustiveAll.best?.total}`,
    );
    ok(
      pruned.pairsEvaluated <= exhaustiveAll.pairsEvaluated,
      "pruning evaluates no more pairs than brute force",
    );
    if (pruned.best) {
      const split = pruned.best;
      const ids = [...split.primary.lines, ...split.secondary.lines].map((l) => l.lineId);
      equal(new Set(ids).size, items.length, "the split covers every line exactly once");
      for (const side of [split.primary, split.secondary]) {
        for (const line of side.lines) {
          ok(
            products.get(line.canonicalId)!.offers.some((o) => o.storeId === side.storeId),
            `split: ${line.name} really is available at its assigned shop`,
          );
        }
      }
    }
    console.log(
      `  pruned ${pruned.pairsEvaluated} pairs vs ${exhaustiveAll.pairsEvaluated} unpruned, same answer ${money(pruned.best?.total ?? 0)}`,
    );

    // Hand-enumerate every 2-way split of every pair and confirm a match.
    const small = items.slice(0, 4);
    const fast = findBestSplit(small, { items: small, products, stores }, index);
    let handBest = Infinity;
    for (let a = 0; a < stores.length; a++) {
      for (let b = a + 1; b < stores.length; b++) {
        for (let mask = 0; mask < 1 << small.length; mask++) {
          const inB = new Set<number>();
          for (let i = 0; i < small.length; i++) if (mask & (1 << i)) inB.add(i);
          if (!inB.size || inB.size === small.length) continue;
          let subA = 0;
          let subB = 0;
          let possible = true;
          small.forEach((item, i) => {
            const store = inB.has(i) ? stores[b] : stores[a];
            const offers = index.get(item.canonicalId)?.get(store.id) ?? [];
            const choice = cheapestPack(offers, item.quantity, item.unit);
            if (!choice) {
              possible = false;
              return;
            }
            if (inB.has(i)) subB += choice.cost;
            else subA += choice.cost;
          });
          if (!possible) continue;
          const total =
            subA + subB + deliveryFor(stores[a], subA).fee + deliveryFor(stores[b], subB).fee;
          handBest = Math.min(handBest, total);
        }
      }
    }
    ok(
      !!fast.best && Math.abs(fast.best.total - handBest) < 1,
      "split optimiser matches a hand-enumerated brute force",
      `${money(fast.best?.total ?? 0)} vs ${money(handBest)}`,
    );
  }

  /* ----------------------------------------- multi-store plan search */
  group("Multi-store plan correctness");
  {
    const rows = EXAMPLE_BASKET.map((entry, i) => ({
      id: `m-${i}`,
      canonicalId: entry.canonicalId,
      quantity: entry.quantity,
    }));
    const items = toBasketItems(rows, products);
    const input = { items, products, stores };
    const index = buildOfferIndex(products.values());
    const found = findBestPlan(items, input, index).best;

    // Hand-enumerate every assignment of every line to every store, any shop
    // count included, and confirm the search matches the true optimum.
    const cost: (number | null)[][] = items.map((item) =>
      stores.map((store) => {
        const offers = index.get(item.canonicalId)?.get(store.id) ?? [];
        return cheapestPack(offers, item.quantity, item.unit)?.cost ?? null;
      }),
    );
    const assign = new Array<number>(items.length).fill(0);
    let handBest = Infinity;
    let handShops = 0;
    const combos = stores.length ** items.length;
    for (let mask = 0; mask < combos; mask++) {
      let rest = mask;
      for (let i = 0; i < items.length; i++) {
        assign[i] = rest % stores.length;
        rest = Math.floor(rest / stores.length);
      }
      const subtotals = new Array<number>(stores.length).fill(0);
      let possible = true;
      for (let i = 0; i < items.length; i++) {
        const c = cost[i][assign[i]];
        if (c === null) {
          possible = false;
          break;
        }
        subtotals[assign[i]] += c;
      }
      if (!possible) continue;
      let total = 0;
      let shops = 0;
      let feasible = true;
      for (let s = 0; s < stores.length; s++) {
        if (subtotals[s] <= 0) continue;
        if (!meetsMinimum(stores[s], subtotals[s])) {
          feasible = false;
          break;
        }
        shops += 1;
        total += subtotals[s] + deliveryFor(stores[s], subtotals[s]).fee;
      }
      if (feasible && total < handBest) {
        handBest = total;
        handShops = shops;
      }
    }

    ok(!!found, "the multi-store search finds a plan for the basket");
    ok(
      !!found && Math.abs(found.total - handBest) < 1,
      "multi-store plan matches a hand-enumerated optimum over every shop count",
      `${money(found?.total ?? 0)} vs ${money(handBest)} (${handShops} shops)`,
    );
    ok(
      !!found && found.storeCount <= MAX_PLAN_STORES,
      "the plan never asks for more shops than the cap allows",
      `${found?.storeCount} shops`,
    );
    console.log(
      `  hand optimum ${money(handBest)} across ${handShops} shops vs engine ${money(found?.total ?? 0)} across ${found?.storeCount ?? 0} shops (${combos.toLocaleString("en-PK")} assignments checked)`,
    );
  }

  /* --------------------------------------------------- pack rounding */
  group("Packs, quantities and availability");
  {
    const rice = products.get("falak-basmati-rice")!;
    const hydriRice = rice.offers.filter((o) => o.storeId === "hydri");
    const oneKg = cheapestPack(hydriRice, 1, "kg");
    ok(!!oneKg, "1 kg of rice is buyable at Hydri");
    equal(oneKg!.packs, 1, "a 5 kg bag covers a 1 kg request in one pack");
    equal(oneKg!.cost, 2124, "you are charged for the whole 5 kg bag, not the 1 kg asked for");
    equal(oneKg!.surplus, 4, "the 4 kg surplus is reported, not hidden");
    equal(oneKg!.paidQuantity, 5, "the quantity actually bought is the pack size");

    const twoBags = cheapestPack(hydriRice, 6, "kg");
    equal(twoBags!.packs, 2, "6 kg of rice is two 5 kg bags");
    equal(twoBags!.cost, 2124 * 2, "two bags cost twice the supplied price");

    const wrong = cheapestPack(hydriRice, 1, "L");
    ok(wrong === null, "requesting litres of rice is refused, not mispriced");

    ok(freePacks({ promo: null } as never, 3) === 0, "no promo means no free packs");
    ok(lineCost({ price: 405, promo: null } as never, 2) === 810, "two packs cost twice the price");

    // Unavailable is never a zero price.
    const cereal = products.get("cocomo-cereal")!;
    for (const store of stores) {
      const offers = cereal.offers.filter((o) => o.storeId === store.id);
      if (!offers.length) {
        ok(
          cheapestPack(offers, 1, "piece") === null,
          `Cocomo Cereal at ${store.name}: unavailable, so nothing can be bought`,
        );
        continue;
      }
      const choice = cheapestPack(offers, 1, "piece")!;
      ok(choice.cost > 0, `Cocomo Cereal at ${store.name}: priced, never free`);
    }
  }

  /* --------------------------------------------------------- receipts */
  group("Receipt parsing");
  for (const receipt of EXAMPLE_RECEIPTS_FOR_TEST) {
    const parsed = parseReceiptText(receipt.text, snapshot.products);
    const recognised = parsed.lines.filter((l) => !l.needsReview);
    ok(parsed.lines.length >= 3, `${receipt.store}: multiple product lines found`, `${parsed.lines.length}`);
    equal(recognised.length, parsed.lines.length, `${receipt.store}: every printed line matched`);
    for (const line of recognised) {
      ok(line.basketQuantity > 0, `basket quantity computed for “${line.raw.trim()}”`);
      const product = snapshot.products.find((p) => p.id === line.canonicalId)!;
      const printedStore = parsed.storeGuess ?? "";
      const store = stores.find((s) => printedStore.toUpperCase().startsWith(s.name.toUpperCase()))!;
      const supplied = PRICES[product.id][store.id as StoreId];
      equal(line.printedPrice, supplied, `${receipt.store}: ${product.name} printed at the supplied price`);
    }
    console.log(
      `  ${receipt.store}: ${recognised.length}/${parsed.lines.length} matched, store guess: ${parsed.storeGuess ?? "none"}`,
    );
  }

  /* ------------------------------------------------------------ report */
  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) {
    console.error(`${failures} FAILED`);
    process.exit(1);
  }
  console.log("Engine OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
