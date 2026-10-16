# Kartly

**Your shopping list, at the lowest possible cost.**

Kartly prices a whole grocery basket at nine Karachi supermarkets and works out the cheapest
practical way to buy it — pack sizes, offers, stock and delivery included. Sometimes the answer is
one store. Often it is a two-store split that only pays once you count a second delivery fee, which
is exactly the arithmetic shoppers never do by hand.

This repository is the working demo: a real comparison engine, a real data layer with a swappable
price source, and a real UI on top. **The prices are illustrative sample figures**, not the stores'
published price lists, and none of these supermarkets is a Kartly partner.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` + `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Runs the engine test harness (639 assertions over the sample catalogue) |

No database, no accounts, no network calls: the sample catalogue is generated at startup and the
basket lives in `localStorage`.

---

## Pages

| Route | What is there |
| --- | --- |
| `/` | Worked example: one 12-line basket priced at all nine stores, the widest per-product price gaps, and the store fee rules |
| `/search` | Search and filter the catalogue; every product shows the cheapest store and the nine-store spread |
| `/product/[id]` | One product across all nine stores — pack sizes, unit prices, offers, stock, price freshness |
| `/basket` | The optimiser: line editor, best single store, best split, price grid, savings ledger, cheaper swaps |
| `/stores` | All nine supermarkets with delivery fee, free-delivery threshold, minimum order, and a measured price index |
| `/receipt` | Receipt → basket. In-browser OCR (or pasted text), line-by-line matching with confidence, review, then straight into the basket |

### HTTP API

The same engine the browser runs, over JSON — for anything that cannot ship the catalogue.

| Endpoint | Notes |
| --- | --- |
| `GET /api/health` | Which price source is configured and in use, cache state |
| `GET /api/catalog` | Full snapshot: stores, products, every offer, `source` |
| `GET /api/stores` | Store metadata (fees, thresholds, coverage) |
| `GET /api/products?q=&category=&stores=&sort=` | Ranked catalogue summaries with facets |
| `GET /api/products/:id` | One product with all offers |
| `POST /api/quote` | `{ "items": [{ "canonicalId", "quantity" }] }` → full plan: quotes, split, matrix, savings |
| `POST /api/receipt/parse` | `{ "text": "…" }` → matched lines with confidence and reasons |

---

## How it is put together

Four layers that are not allowed to know about each other:

```
lib/types.ts              the canonical domain model — stores, units, offers, products
lib/catalog/              the sample catalogue (9 stores, 62 products, ~1,290 offers)
lib/api/                  provider layer: sample today, REST tomorrow, one interface
lib/engine/               pure arithmetic: pricing → quotes → split search → plan
lib/basket/, components/  state and UI
```

- **Nothing in the UI imports sample data.** Everything goes through `lib/api`, which resolves a
  `CatalogProvider` from the environment.
- **Nothing in the engine imports a data source.** `compareBasket(items, products, stores)` is pure,
  which is why the client can reprice the basket on every keystroke instead of round-tripping.
- **The engine is the single source of truth for every number on screen**, including the landing
  page. No figure is typed into a component.

### What the engine actually does

- **Pack rounding.** You asked for 2 kg of rice; the shop sells 5 kg bags, so you buy 5 kg and the
  quote says so.
- **Offers.** Percent, flat and buy-N-get-M bundles, applied per pack, with the shelf price kept so
  the UI can show what the offer saved.
- **Stock.** A store that cannot fill a line is not quietly dropped — it is shown as incomplete with
  the missing count, because "cheapest" that cannot deliver your list is a lie.
- **Delivery.** Flat fee, free-delivery threshold and minimum order per store, all of which can flip
  the winner.
- **Split search.** Every store pair is priced, with a lower-bound prune; the search reports how
  many pairs it evaluated and how many it skipped, and falls back to a hill climb (flagged as
  non-exact) if a basket ever gets big enough to need one.
- **An honest floor.** The cherry-picked total — every line at its cheapest store, no delivery — is
  printed next to the recommendation so the savings claim is never flattered.
- **A split needs to be worth it.** A second delivery slot is an inconvenience, not just a rupee
  figure, so splits under Rs 150 of saving are computed but not recommended.

---

## Pointing it at a real price feed

```bash
cp .env.example .env.local
```

Set `KARTLY_API_PROVIDER=rest` and `KARTLY_API_BASE_URL`. The provider expects two endpoints
(`GET <base><KARTLY_API_PRODUCTS_PATH>` and `GET <base><KARTLY_API_STORES_PATH>`) whose shapes are
documented in `lib/api/providers/rest.ts`; the normaliser in `lib/api/normalize.ts` maps store-native
SKUs and titles onto canonical products.

A live source that fails falls back to the sample snapshot **and the badge flips from "Live prices"
to "Sample data"**. There is no code path that can print sample prices under a live label.

---

## Testing

```bash
npm test
```

The harness drives the real engine over the real sample catalogue and asserts the things a demo
must not get wrong: quote totals reconcile with subtotal + delivery, the split never costs more than
the best single store, pack rounding never under-buys, pruned and unpruned split searches agree,
promo maths is exact, unavailable stock is never quoted, and both sample receipts come back with the
right lines matched.

---

## Known limits

- Prices, fees and thresholds are **illustrative sample data** generated by
  `lib/catalog/sample/generate.ts`. Store names are real; the numbers are not.
- Receipt OCR loads `tesseract.js` from a CDN at runtime, so it needs a network connection; the
  paste-text path works offline.
- The receipt matcher is a deterministic text matcher (phrase, token-coverage and bigram similarity),
  not a learned model. Anything it is unsure about is flagged for review rather than guessed at.
- No accounts, no order placement, no persistence beyond the browser's `localStorage`.
