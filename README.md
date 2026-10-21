# Kartly

**Your shopping list, at the lowest possible cost.**

Kartly prices a whole grocery basket at six Karachi supermarkets and works out the cheapest
practical way to buy it — pack sizes, availability and delivery included. Sometimes the answer is
one store. Often it is a split across two or three that only pays once you count the extra delivery
charges, which is exactly the arithmetic shoppers never do by hand.

This repository is the working app: a real comparison engine, a data layer with a swappable price
source, and a real UI on top. **Every price and delivery rule in it is a supplied figure** — see
`lib/catalog/dataset.ts`. Nothing is generated, seeded or estimated, and where a store's delivery
charge was not supplied the app says "delivery fee unknown" instead of pretending it is free. None
of these supermarkets is a Kartly partner.

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
| `npm test` | Runs the engine test harness (650 assertions over the supplied catalogue) |

No database, no accounts, no network calls: the catalogue is read from `lib/catalog/` at startup and
the basket lives in `localStorage`.

---

## Pages

| Route | What is there |
| --- | --- |
| `/` | Worked example: one 5-line basket priced at all six stores, the widest per-product price gaps, and the store delivery rules |
| `/search` | Search and filter the catalogue; every product shows the cheapest store and the spread across stores |
| `/product/[id]` | One product across all six stores — pack size, unit price, and where it is not available |
| `/basket` | The optimiser: line editor, the cheapest plan (any number of shops), price grid, savings ledger |
| `/stores` | All six supermarkets with their delivery rules and a measured price index |
| `/receipt` | Receipt → basket. In-browser OCR (or pasted text), line-by-line matching with confidence, review, then straight into the basket |

### HTTP API

The same engine the browser runs, over JSON — for anything that cannot ship the catalogue.

| Endpoint | Notes |
| --- | --- |
| `GET /api/health` | Which price source is configured and in use, cache state |
| `GET /api/catalog` | Full snapshot: stores, products, every offer, `source` |
| `GET /api/stores` | Store metadata (delivery fee, free-delivery threshold, minimum order) |
| `GET /api/products?q=&category=&stores=&sort=` | Ranked catalogue summaries with facets |
| `GET /api/products/:id` | One product with all offers |
| `POST /api/quote` | `{ "items": [{ "canonicalId", "quantity" }] }` → full plan: quotes, cheapest plan, matrix, savings |
| `POST /api/receipt/parse` | `{ "text": "…" }` → matched lines with confidence and reasons |

---

## How it is put together

Four layers that are not allowed to know about each other:

```
lib/types.ts              the canonical domain model — stores, units, offers, products
lib/catalog/stores.ts     the six stores and their delivery rules
lib/catalog/dataset.ts    the five products and every supplied price (24 prices, 6 gaps)
lib/api/                  provider layer: supplied set today, REST tomorrow, one interface
lib/engine/               pure arithmetic: pricing → quotes → split + multi-shop search → plan
lib/basket/, components/  state and UI
```

- **Nothing in the UI imports the catalogue directly.** Everything goes through `lib/api`, which
  resolves a `CatalogProvider` from the environment, so every screen reads the same snapshot.
- **Nothing in the engine imports a data source.** `compareBasket(items, products, stores)` is pure,
  which is why the client can reprice the basket on every keystroke instead of round-tripping.
- **The engine is the single source of truth for every number on screen**, including the landing
  page. No figure is typed into a component.

### What the engine actually does

- **Pack rounding.** You asked for 2 kg of rice; the shop sells 5 kg bags, so you buy 5 kg and the
  quote says so.
- **Availability.** "Not available" is never a price of Rs 0. A store that cannot fill a line is not
  quietly dropped — it is shown as incomplete with the missing count, because "cheapest" that cannot
  deliver your list is a lie.
- **Delivery.** A flat fee, a free-delivery threshold that has to be *exceeded* (Hydri: free above
  Rs 2,000), or an unknown charge. An unknown fee is counted as nothing and flagged, so the total is
  labelled a floor rather than a final price.
- **The cheapest plan, whatever shop count it needs.** Every store pair is priced exhaustively
  (with a lower-bound prune), then a local search over whole-basket assignments opens, closes and
  relocates shops until nothing improves, up to four shops. There is no "is splitting worth it?"
  question to answer: the cheapest total is the recommendation, and the UI says "best option found"
  whenever the answer came from the local search rather than an exhaustive one.

---

## Pointing it at a real price feed

```bash
cp .env.example .env.local
```

Set `KARTLY_API_PROVIDER=rest` and `KARTLY_API_BASE_URL`. The provider expects two endpoints
(`GET <base><KARTLY_API_PRODUCTS_PATH>` and `GET <base><KARTLY_API_STORES_PATH>`) whose shapes are
documented in `lib/api/providers/rest.ts`; the normaliser in `lib/api/normalize.ts` maps store-native
SKUs and titles onto canonical products.

A live source that fails falls back to the supplied snapshot **and the badge flips from "Live
prices" to "Supplied prices"**. There is no code path that can print supplied prices under a live
label.

---

## Testing

```bash
npm test
```

The harness drives the real engine over the supplied catalogue and asserts the things this app must
not get wrong: every price matches the supplied table, exactly six stores and five products exist,
the delivery rules behave (including Hydri's "free above Rs 2,000", which Rs 2,000 itself does not
clear), quote totals reconcile with subtotal + counted delivery, the cheapest plan never costs more
than the best single store and matches a hand-enumerated optimum, pack rounding never under-buys,
pruned and unpruned split searches agree, unavailable lines are never quoted or priced as zero, and
both example receipts come back with the right lines at the right prices.

---

## Known limits

- The catalogue is five products and six stores — the data supplied so far. Prices are point-in-time
  figures, not live checkout prices, and no collection timestamp is claimed for them.
- Four of the six stores have not supplied a delivery charge, so basket totals that involve them are
  floors, not final prices, and the savings they imply are labelled estimates rather than promises.
- Receipt OCR loads `tesseract.js` from a CDN at runtime, so it needs a network connection; the
  paste-text path works offline.
- The receipt matcher is a deterministic text matcher (phrase, token-coverage and bigram similarity),
  not a learned model. Anything it is unsure about is flagged for review rather than guessed at.
- No accounts, no order placement, no persistence beyond the browser's `localStorage`.
