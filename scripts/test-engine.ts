/**
 * Engine test harness — plain assertions, no test framework.
 *
 * Run with `npm test`. These check arithmetic invariants, not snapshots: if a
 * quote's total ever stops equaling subtotal + delivery, or a "split" ever
 * claims to save money it does not, this fails.
 */

import { buildOfferIndex } from "@/lib/engine/quotes";
import { findBestSplit } from "@/lib/engine/optimizer";
import { findBestPlan, MAX_PLAN_STORES } from "@/lib/engine/multi";
import { sampleProvider } from "@/lib/api/providers/sample";
import { compareBasket, toBasketItems } from "@/lib/engine/plan";
import { deliveryFor, cheapestPack, lineCost, freePacks } from "@/lib/engine/pricing";
import { parseReceiptText, SAMPLE_RECEIPTS_FOR_TEST } from "@/lib/receipt/test-fixtures";
import { STARTER_BASKET, TEASER_BASKET } from "@/lib/catalog/sample/generate";
import type { ProductDetail } from "@/lib/types";

let failures = 0;
let checks = 0;

function ok(condition: boolean, label: string, detail = "") {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function group(label: string) {
  console.log(`\n${label}`);
}

const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

async function main() {
  const snapshot = await sampleProvider.load();
  const products = new Map<string, ProductDetail>(snapshot.products.map((p) => [p.id, p]));
  const stores = snapshot.stores;

  console.log(
    `Catalogue: ${snapshot.products.length} products, ${snapshot.products.reduce((n, p) => n + p.offers.length, 0)} offers, ${stores.length} stores`,
  );

  /* ---------------------------------------------------------- starter */
  for (const [label, seed] of [
    ["Starter basket", STARTER_BASKET],
    ["Teaser basket", TEASER_BASKET],
  ] as const) {
    group(label);
    const rows = seed.map((entry, i) => ({
      id: `line-${i}`,
      canonicalId: entry.canonicalId,
      quantity: entry.quantity,
    }));
    const items = toBasketItems(rows, products);
    ok(items.length === seed.length, "every seed line resolved to an engine item");

    const plan = compareBasket(items, products, stores);

    ok(!!plan.bestSingle, "a single store can supply the whole basket");
    ok(plan.quotes.length === stores.length, "one quote per store");

    // Quote arithmetic
    for (const quote of plan.quotes) {
      const sum = quote.lines.reduce((total, line) => total + line.cost, 0);
      ok(Math.abs(sum - quote.subtotal) < 1, `${quote.store.name}: subtotal equals line sum`, `${money(sum)} vs ${money(quote.subtotal)}`);
      ok(
        Math.abs(quote.total - (quote.subtotal + quote.delivery)) < 1,
        `${quote.store.name}: total equals subtotal + delivery`,
      );
      const expected = deliveryFor(quote.store, quote.subtotal);
      ok(quote.delivery === expected.fee, `${quote.store.name}: delivery matches the store's rule`);
      if (quote.complete) {
        ok(quote.lines.length === items.length, `${quote.store.name}: complete quote has every line`);
      }
      // No line may cost less than zero or more than its shelf price.
      for (const line of quote.lines) {
        ok(line.cost > 0, `${quote.store.name}/${line.name}: positive line cost`);
        ok(line.listCost >= line.cost, `${quote.store.name}/${line.name}: promo never raises the price`);
      }
    }

    // Best single really is the best
    const complete = plan.quotes.filter((q) => q.eligible);
    if (complete.length) {
      const minTotal = Math.min(...complete.map((q) => q.total));
      ok(plan.bestSingle!.total === minTotal, "best single store is the cheapest eligible quote");
    }

    // The recommended plan: whatever number of shops it uses, the arithmetic
    // has to close and it has to beat or match every single-shop quote.
    if (plan.bestPlan) {
      const best = plan.bestPlan;
      const sub = best.orders.reduce((sum, order) => sum + order.subtotal, 0);
      const del = best.orders.reduce((sum, order) => sum + order.delivery, 0);
      ok(Math.abs(best.total - (sub + del)) < 1, "plan total equals every subtotal plus every delivery fee");
      ok(best.storeCount === best.orders.length, "plan reports the shop count it actually uses");
      ok(new Set(best.orders.map((o) => o.storeId)).size === best.storeCount, "no shop is ordered from twice");
      ok(best.orders.every((order) => order.lines.length > 0), "every order in the plan is non-empty");
      const covered = best.orders.reduce((sum, order) => sum + order.lines.length, 0);
      ok(covered === items.length, "the plan covers every line exactly once", `${covered} of ${items.length}`);
      const lineIds = best.orders.flatMap((order) => order.lines.map((line) => line.lineId));
      ok(new Set(lineIds).size === lineIds.length, "no line is bought twice");
      for (const order of best.orders) {
        const store = stores.find((s) => s.id === order.storeId)!;
        ok(order.subtotal >= store.minOrder, `${store.name}: order clears its minimum basket`);
        const lineSum = order.lines.reduce((sum, line) => sum + line.choice.cost, 0);
        ok(Math.abs(lineSum - order.subtotal) < 1, `${store.name}: order subtotal equals its line sum`);
      }
      if (plan.bestSingle) {
        ok(best.total <= plan.bestSingle.total + 1, "the plan never costs more than the best single store", `${money(best.total)} vs ${money(plan.bestSingle.total)}`);
        ok(best.savingsVsSingle === Math.max(0, plan.bestSingle.total - best.total), "plan savings equals the real difference vs the best single store");
      }
    }

    // Floor sanity: cherry-picking can never beat a real plan.
    ok(plan.cherryPick <= plan.savings.bestTotal + 1, "cherry-picked floor never exceeds the real best total", `${money(plan.cherryPick)} vs ${money(plan.savings.bestTotal)}`);
    ok(plan.savings.remainingGap >= 0, "remaining gap is never negative");
    if (plan.worstSingle) {
      ok(plan.savings.bestVsWorst >= 0, "best option never costs more than the worst option");
    }

    // Matrix agrees with quotes
    for (const quote of plan.quotes) {
      for (const line of quote.lines) {
        const cell = plan.matrix.find((c) => c.lineId === line.lineId && c.storeId === quote.storeId);
        ok(!!cell && cell.state === "ok" && cell.cost === line.cost, `matrix agrees with ${quote.store.name} quote for ${line.name}`);
      }
    }

    console.log(
      `  best single: ${plan.bestSingle?.store.name} ${money(plan.bestSingle?.total ?? 0)}` +
        ` | plan: ${plan.bestPlan ? `${plan.bestPlan.orders.map((o) => o.storeId).join("+")} ${money(plan.bestPlan.total)} (${plan.bestPlan.storeCount} shops, saves ${money(plan.savings.splitVsSingle)} vs single)` : "none"}` +
        ` | floor ${money(plan.cherryPick)} | worst ${money(plan.worstSingle?.total ?? 0)}` +
        ` | ${plan.meta.setsEvaluated} assignments climbed${plan.exact ? "" : " (best option found)"}`,
    );
  }

  /* --------------------------------------------------- split search */
  group("Split search correctness");
  {
    const rows = STARTER_BASKET.map((entry, i) => ({ id: `s-${i}`, canonicalId: entry.canonicalId, quantity: entry.quantity }));
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
    ok(pruned.pairsEvaluated <= exhaustiveAll.pairsEvaluated, "pruning evaluates no more pairs than brute force");
    console.log(
      `  pruned ${pruned.pairsEvaluated} pairs vs ${exhaustiveAll.pairsEvaluated} unpruned, same answer ${money(pruned.best?.total ?? 0)}`,
    );

    // Brute-force cross-check on a small basket: enumerate every 2-way split
    // of every pair by hand and confirm the optimiser matches it.
    const small = items.slice(0, 6);
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
          if (subA < stores[a].minOrder || subB < stores[b].minOrder) continue;
          const total =
            subA + subB + deliveryFor(stores[a], subA).fee + deliveryFor(stores[b], subB).fee;
          handBest = Math.min(handBest, total);
        }
      }
    }
    ok(
      Math.abs(fast.best!.total - handBest) < 1,
      "optimiser matches a hand-enumerated brute force",
      `${money(fast.best!.total)} vs ${money(handBest)}`,
    );
  }

  /* -------------------------------------------- multi-store plan search */
  group("Multi-store plan correctness");
  {
    const rows = TEASER_BASKET.slice(0, 5).map((entry, i) => ({ id: `m-${i}`, canonicalId: entry.canonicalId, quantity: entry.quantity }));
    const items = toBasketItems(rows, products);
    const input = { items, products, stores };
    const index = buildOfferIndex(products.values());
    const found = findBestPlan(items, input, index).best;

    // Hand-enumerate every assignment of every line to every store — 9^5
    // baskets, any shop count included — and confirm the search matches the
    // true optimum, not just the best pair.
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
        if (subtotals[s] < stores[s].minOrder) {
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

    ok(!!found, "the multi-store search finds a plan for a small basket");
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
  group("Pack rounding and promos");
  {
    const rice = products.get("basmati-rice")!;
    const imtiaz = rice.offers.filter((o) => o.storeId === "imtiaz");
    const choice = cheapestPack(imtiaz, 1, "kg");
    ok(!!choice, "1 kg of rice is buyable at Imtiaz");
    const packsNeeded = Math.ceil(1 / choice!.offer.quantity);
    ok(choice!.packs === packsNeeded, "pack count rounds up to whole packs");

    const bundle = snapshot.products.flatMap((p) => p.offers).find((o) => o.promo?.kind === "bundle");
    if (bundle) {
      const buy = bundle.promo!.buy ?? 2;
      const free = bundle.promo!.value ?? 1;
      ok(freePacks(bundle, buy + free) === free, "bundle grants one free pack per group");
      ok(lineCost(bundle, buy + free) === buy * bundle.price, "bundle charges only the paid packs");
      ok(freePacks(bundle, buy + free - 1) === 0, "no free pack before the group is complete");
    } else {
      ok(true, "no bundle promo in the sample set to test");
    }

    // Unit mismatch must be reported, not silently priced.
    const wrong = cheapestPack(imtiaz, 1, "L");
    ok(wrong === null, "requesting litres of rice is refused, not mispriced");
  }

  /* ------------------------------------------------------ availability */
  group("Availability");
  {
    const all = snapshot.products.flatMap((p) => p.offers);
    const out = all.filter((o) => !o.inStock);
    ok(out.length > 0, "sample set contains out-of-stock offers", `${out.length} found`);
    const carried = new Set(snapshot.products.flatMap((p) => p.offers.map((o) => `${p.id}:${o.storeId}`))).size;
    const gaps = snapshot.products.length * stores.length - carried;
    ok(gaps > 0, "some stores genuinely do not carry some products", `${gaps} gaps`);
    ok(carried / (snapshot.products.length * stores.length) > 0.9, "most stores carry most products", `${((carried / (snapshot.products.length * stores.length)) * 100).toFixed(1)}%`);
  }

  /* --------------------------------------------------------- receipts */
  group("Receipt parsing");
  for (const receipt of SAMPLE_RECEIPTS_FOR_TEST) {
    const parsed = parseReceiptText(receipt.text, snapshot.products);
    const recognised = parsed.lines.filter((l) => !l.needsReview);
    ok(parsed.lines.length >= 8, `${receipt.store.slice(0, 20)}…: multiple product lines found`, `${parsed.lines.length}`);
    ok(recognised.length >= 6, `${receipt.store.slice(0, 20)}…: most lines matched`, `${recognised.length}/${parsed.lines.length}`);
    for (const line of recognised) {
      ok(line.basketQuantity > 0, `basket quantity computed for “${line.raw.slice(0, 32)}”`);
    }
    console.log(
      `  ${receipt.store}: ${recognised.length}/${parsed.lines.length} matched, ${parsed.unresolved} to review, store guess: ${parsed.storeGuess ?? "none"}`,
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
