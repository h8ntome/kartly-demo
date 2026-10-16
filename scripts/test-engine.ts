/**
 * Engine test harness — plain assertions, no test framework.
 *
 * Run with `npm test`. These check arithmetic invariants, not snapshots: if a
 * quote's total ever stops equaling subtotal + delivery, or a "split" ever
 * claims to save money it does not, this fails.
 */

import { buildOfferIndex } from "@/lib/engine/quotes";
import { findBestSplit } from "@/lib/engine/optimizer";
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

    // Split claims
    if (plan.split) {
      const split = plan.split;
      const splitSub = split.primary.subtotal + split.secondary.subtotal;
      ok(
        Math.abs(split.total - (splitSub + split.primary.delivery + split.secondary.delivery)) < 1,
        "split total equals both subtotals plus both delivery fees",
      );
      ok(split.savingsVsSingle === plan.bestSingle!.total - split.total, "split savings equals the real difference");
      ok(split.primary.storeId !== split.secondary.storeId, "split uses two different stores");
      ok(split.primary.lines.length > 0 && split.secondary.lines.length > 0, "both halves of the split are non-empty");
      const covered = split.primary.lines.length + split.secondary.lines.length;
      ok(covered === items.length, "split covers every line exactly once", `${covered} of ${items.length}`);
      ok(
        split.primary.subtotal >= stores.find((s) => s.id === split.primaryStoreId)!.minOrder,
        "primary order clears its minimum basket",
      );
      ok(
        split.secondary.subtotal >= stores.find((s) => s.id === split.secondaryStoreId)!.minOrder,
        "secondary order clears its minimum basket",
      );
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
        ` | split: ${plan.split ? `${plan.split.primaryStoreId}+${plan.split.secondaryStoreId} ${money(plan.split.total)} (saves ${money(plan.savings.splitVsSingle)})` : "not worth it"}` +
        ` | floor ${money(plan.cherryPick)} | worst ${money(plan.worstSingle?.total ?? 0)}` +
        ` | pairs ${plan.meta.pairsEvaluated} evaluated / ${plan.meta.pairsSkipped} pruned`,
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
