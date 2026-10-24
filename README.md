# Kartly

**Your shopping list, at the lowest possible cost.**

Kartly prices a whole grocery basket at six Karachi supermarkets and works out the cheapest
practical way to buy it — pack sizes, availability and delivery included. Sometimes the answer is
one store. Often it is a split across two or three that only pays once you count the extra delivery
charges, which is exactly the arithmetic shoppers never do by hand.

This repository is the working app: a real comparison engine, a data layer with a swappable price
source, and a real UI on top. **Every price and delivery rule in it is a supplied figure** — see
`lib/catalog/dataset.ts`. Nothing is generated, seeded or estimated, and where a store's delivery
charge was not supplied the app says "delivery not published" instead of pretending it is free.
None of these supermarkets is a Kartly partner, and the app says so once, quietly, in the footer.

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
| `npm test` | Engine harness (650 assertions) plus the demo-order flow harness (31 assertions) |
| `npm run test:flow` | Just the checkout/order-progress harness |

No database, no accounts, no network calls: the catalogue is read from `lib/catalog/` at startup,
the basket lives in `localStorage`, and demo orders live there too.

---

## Pages

The shell is a mobile app: a compact top bar, a bottom tab bar, thumb-height
controls, bottom sheets for filters, sticky action bars and safe-area insets.
Every route is designed phone-first and scales up to a two-column desktop layout.

| Route | What is there |
| --- | --- |
| `/` | Home: search, category chips, the savings spotlight (live from your basket, or the worked example), product and price-gap rails, the shops |
| `/search` | Search and filter the catalogue; every product shows the cheapest store and the spread across stores |
| `/product/[id]` | One product across all six stores — pack size, unit price, where it is not available, and an add bar |
| `/basket` | The optimiser: line editor, savings headline, the cheapest plan (any number of shops), price grid, savings ledger |
| `/checkout` | Demo checkout: one order per shop, address, slot, payment, totals, and a "Place demo order" button |
| `/order/[id]` | Demo order tracking: confirmed → being picked → out for delivery → delivered, with the plan it came from |
| `/orders` | Demo order history, held in this browser |
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
lib/basket/, lib/orders/   client state: basket rows and demo orders, both localStorage
components/             the interface
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

A live source that fails falls back to the supplied snapshot, and `GET /api/health` reports which
one is actually in use. There is no code path that can print supplied prices under a live label.

---

## The demo checkout

`/checkout` turns the cheapest plan into one order per shop and `/order/[id]` walks it through
confirmed → being picked → out for delivery → delivered. Nothing leaves the browser: no store is
contacted, no payment is taken, and the screen says so. The stage is a pure function of the order's
timestamp, so a refresh keeps the story consistent instead of resetting it, and the timings are
compressed (`ORDER_STAGES` in `lib/orders/store.tsx`) so the progression is visible inside a
presentation.

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

`npm run test:flow` covers the demo order path: every basket line lands in exactly one shop order,
shop subtotals and counted delivery reconcile with the plan total, ordered quantities match the
basket, the saving is exactly `dearest shop − plan`, and the status stages advance in order and stop
at delivered.

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
- Orders are simulated. They are real orders in shape — one per shop, each with its own delivery
  rule — but nothing is sent to a store and no payment is taken.
- Order status advances on a compressed clock, not a store's picking system.
