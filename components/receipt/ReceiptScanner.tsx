"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Button, LinkButton, Tag } from "@/components/ui/Primitives";
import { useBasket } from "@/lib/basket/store";
import { useCatalog, usePlan } from "@/lib/basket/use-catalog";
import { rankProducts } from "@/lib/api/normalize";
import { STORE_MAP } from "@/lib/catalog/stores";
import { formatPKR, formatPKRShort, pluralise } from "@/lib/engine/format";
import { formatQuantity, type ProductDetail, type Unit } from "@/lib/types";
import type { ReceiptParse } from "@/lib/receipt/parse";

/**
 * Receipt → basket.
 *
 * OCR runs in the browser (tesseract.js, loaded on demand) so a photo of a
 * receipt never leaves the machine. The text it produces goes to
 * /api/receipt/parse, where the catalogue matching happens, and comes back as
 * lines with a confidence and a reason. The review step is the product: Kartly
 * says "I read 11 of 13, check these two" instead of asking to be trusted.
 */

interface Sample {
  store: string;
  text: string;
}

type Mode = "paste" | "photo" | "sample";

interface Edit {
  canonicalId: string | null;
  quantity: number;
  include: boolean;
}

interface ResolvedLine {
  lineNumber: number;
  raw: string;
  printedPrice: number | null;
  confidence: number;
  reason: string;
  needsReview: boolean;
  canonicalId: string | null;
  quantity: number;
  include: boolean;
  product: ProductDetail | null;
}

export function ReceiptScanner({ samples }: { samples: Sample[] }) {
  const router = useRouter();
  const { replaceAll, clear } = useBasket();
  const { products, loading: catalogueLoading } = useCatalog();
  const productsList = useMemo(() => [...products.values()], [products]);

  const [mode, setMode] = useState<Mode>("sample");
  const [text, setText] = useState(samples[0]?.text ?? "");
  const [parsed, setParsed] = useState<ReceiptParse | null>(null);
  const [edits, setEdits] = useState<Map<number, Edit>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocr, setOcr] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runParse = useCallback(async (source: string) => {
    setError(null);
    setBusy("Reading the receipt…");
    try {
      const response = await fetch("/api/receipt/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: source }),
      });
      const payload = (await response.json()) as ReceiptParse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `parse failed (${response.status})`);
      setParsed(payload);
      // Default: trust confident lines, hold back anything the matcher flagged.
      setEdits(
        new Map(
          payload.lines.map((line) => [
            line.lineNumber,
            {
              canonicalId: line.canonicalId,
              quantity: line.basketQuantity || line.quantity,
              include: !line.needsReview,
            },
          ]),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setParsed(null);
    } finally {
      setBusy(null);
    }
  }, []);

  const runOcr = useCallback(
    async (file: File) => {
      setError(null);
      setOcr(0);
      setBusy("Loading the OCR engine (first run downloads it)…");
      try {
        const Tesseract = await import("tesseract.js");
        const result = await Tesseract.recognize(file, "eng", {
          logger: (message: { status: string; progress: number }) => {
            if (message.status === "recognizing text") {
              setOcr(message.progress);
              setBusy(`Reading the photo… ${Math.round(message.progress * 100)}%`);
            } else {
              setBusy(message.status);
            }
          },
        });
        const recognised = result.data.text ?? "";
        setOcr(null);
        if (!recognised.trim()) {
          setError("The photo produced no readable text. Try a flatter, brighter shot, or paste the text instead.");
          return;
        }
        setText(recognised);
        setMode("paste");
        await runParse(recognised);
      } catch (cause) {
        setOcr(null);
        setError(
          `OCR could not run (${cause instanceof Error ? cause.message : "offline?"}). ` +
            "The engine loads from a CDN; paste the receipt text or use a sample instead.",
        );
      } finally {
        setBusy(null);
      }
    },
    [runParse],
  );

  /* ------------------------------------------------- resolved lines */

  const lines: ResolvedLine[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines.map((line) => {
      const edit = edits.get(line.lineNumber);
      const canonicalId = edit ? edit.canonicalId : line.canonicalId;
      const product = canonicalId ? (products.get(canonicalId) ?? null) : null;
      return {
        lineNumber: line.lineNumber,
        raw: line.raw,
        printedPrice: line.printedPrice,
        confidence: line.confidence,
        reason: line.reason,
        needsReview: line.needsReview,
        canonicalId,
        quantity: edit ? edit.quantity : line.basketQuantity || line.quantity,
        include: edit ? edit.include : !line.needsReview,
        product,
      };
    });
  }, [parsed, edits, products]);

  // Candidates for the lines the matcher was not sure about, so "fix it" is a
  // choice from a list rather than a typing test.
  const candidates = useMemo(() => {
    const map = new Map<number, ProductDetail[]>();
    if (!parsed || !productsList.length) return map;
    for (const line of parsed.lines) {
      if (line.match && line.confidence >= 0.62) continue;
      map.set(
        line.lineNumber,
        rankProducts(line.raw, productsList)
          .slice(0, 6)
          .map((entry) => entry.product),
      );
    }
    return map;
  }, [parsed, productsList]);

  const selected = useMemo(
    () =>
      lines
        .filter((line) => line.include && line.canonicalId && line.quantity > 0)
        .map((line) => ({ canonicalId: line.canonicalId!, quantity: line.quantity })),
    [lines],
  );

  const planRows = useMemo(
    () => selected.map((row, index) => ({ id: `rcpt-${index}`, ...row })),
    [selected],
  );
  const { plan } = usePlan(planRows);

  const reviewCount = lines.filter((line) => line.needsReview).length;
  const matchedCount = lines.filter((line) => line.canonicalId).length;
  // Printed value of everything the shopper could not (or did not) map, so the
  // rail never claims a saving against a total that excludes part of the bill.
  const unmatchedLines = lines.filter((line) => !line.include || !line.canonicalId).length;
  const unmatchedValue = lines
    .filter((line) => !line.include || !line.canonicalId)
    .reduce((sum, line) => sum + (line.printedPrice ?? 0), 0);

  function patch(lineNumber: number, next: Partial<Edit>) {
    setEdits((current) => {
      const line = lines.find((entry) => entry.lineNumber === lineNumber);
      const base: Edit = line
        ? { canonicalId: line.canonicalId, quantity: line.quantity, include: line.include }
        : { canonicalId: null, quantity: 1, include: false };
      const merged = new Map(current);
      merged.set(lineNumber, { ...base, ...next });
      return merged;
    });
  }

  function addToBasket(replace: boolean) {
    if (!selected.length) return;
    if (replace) clear();
    replaceAll(selected);
    router.push("/basket");
  }

  /* --------------------------------------------------------- render */

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="space-y-4">
        {/* input mode */}
        <div className="rounded-4xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-xl bg-cream-200/70 p-1" role="tablist" aria-label="Receipt input method">
              {(
                [
                  ["sample", "Sample receipt"],
                  ["paste", "Paste text"],
                  ["photo", "Photo"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => {
                    setMode(id);
                    setError(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-[0.82rem] font-semibold transition-colors ${
                    mode === id ? "bg-white text-forest-900 shadow-[var(--shadow-card)]" : "text-sage-500 hover:text-forest-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {parsed && (
              <button
                onClick={() => {
                  setParsed(null);
                  setEdits(new Map());
                  setError(null);
                }}
                className="text-[0.82rem] font-semibold text-sage-500 hover:text-forest-800"
              >
                Start over
              </button>
            )}
          </div>

          {mode === "sample" && (
            <div className="mt-5">
              <p className="text-[0.86rem] text-sage-600">
                Two transcribed Karachi receipts — the terse, inconsistent format real ones come in.
                Pick one:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {samples.map((sample) => (
                  <button
                    key={sample.store}
                    onClick={() => {
                      setText(sample.text);
                      void runParse(sample.text);
                    }}
                    className="rounded-xl border border-cream-300 bg-cream-50 px-4 py-2.5 text-left text-[0.84rem] font-medium text-forest-900 transition-colors hover:border-forest-400 hover:bg-cream-100"
                  >
                    {sample.store}
                    <span className="block text-[0.72rem] font-normal text-sage-500">
                      {sample.text.split("\n").filter((l) => l.trim()).length} printed lines
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "paste" && (
            <div className="mt-5">
              <label htmlFor="receipt-text" className="text-[0.86rem] font-medium text-ink">
                Receipt text
              </label>
              <textarea
                id="receipt-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={12}
                spellCheck={false}
                className="field mt-2 whitespace-pre font-mono text-[0.8rem] leading-relaxed"
                placeholder={"1  GUARD BASMATI RICE 5KG        2,745\n2  SUNFLOWER COOKING OIL 5L      2,890"}
              />
              <div className="mt-3 flex items-center gap-3">
                <Button onClick={() => void runParse(text)} disabled={!text.trim() || !!busy}>
                  Read receipt
                </Button>
                {text.trim() && (
                  <span className="text-[0.78rem] text-sage-500">
                    {pluralise(text.split(/\n/).filter((l) => l.trim()).length, "line")}
                  </span>
                )}
              </div>
            </div>
          )}

          {mode === "photo" && (
            <div className="mt-5">
              <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50/70 px-5 py-8 text-center">
                <span className="text-2xl" aria-hidden="true">
                  📷
                </span>
                <p className="mt-2 text-[0.9rem] font-medium text-forest-900">
                  Photograph the receipt, flat and in focus
                </p>
                <p className="mx-auto mt-1 max-w-md text-[0.82rem] leading-relaxed text-sage-600">
                  Text recognition runs in your browser. The image is never uploaded — only the text
                  it finds is sent to be matched against the catalogue.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void runOcr(file);
                    event.target.value = "";
                  }}
                />
                <Button className="mt-4" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                  Choose a photo
                </Button>
              </div>
            </div>
          )}

          {busy && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-cream-100 px-4 py-3 text-[0.84rem] text-sage-600">
              <motion.span
                className="h-2 w-2 shrink-0 rounded-full bg-forest-500"
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              />
              {busy}
              {ocr !== null && (
                <span className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-cream-300">
                  <motion.span
                    className="block h-full rounded-full bg-forest-500"
                    animate={{ width: `${Math.round(ocr * 100)}%` }}
                  />
                </span>
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-spend/25 bg-spend-soft px-4 py-3 text-[0.84rem] leading-relaxed text-spend">
              {error}
            </p>
          )}
        </div>

        {/* review */}
        <AnimatePresence mode="wait">
          {parsed && (
            <motion.section
              key="review"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-4xl border border-cream-200 bg-white shadow-[var(--shadow-card)]"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="font-display text-[1.1rem] font-semibold text-forest-950">
                    {parsed.storeGuess ? `Read as ${parsed.storeGuess}` : "Receipt read"}
                  </h2>
                  <p className="text-[0.8rem] text-sage-500">
                    {pluralise(matchedCount, "item")} matched
                    {reviewCount > 0 && `, ${pluralise(reviewCount, "line")} to check`}
                    {parsed.skipped.length > 0 && ` · ${parsed.skipped.length} header/total lines ignored`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {reviewCount === 0 ? (
                    <Tag tone="save">all matched</Tag>
                  ) : (
                    <Tag tone="warn">{reviewCount} to check</Tag>
                  )}
                </div>
              </header>

              <ul className="divide-y divide-cream-200">
                {lines.map((line) => {
                  const options = candidates.get(line.lineNumber) ?? [];
                  const tone =
                    line.confidence >= 0.8 ? "save" : line.confidence >= 0.62 ? "warn" : "spend";
                  return (
                    <li
                      key={line.lineNumber}
                      className={`flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors sm:px-6 ${
                        line.include ? "" : "bg-cream-50/60 opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={line.include}
                        onChange={(event) => patch(line.lineNumber, { include: event.target.checked })}
                        aria-label={`Include ${line.raw}`}
                        className="h-4 w-4 shrink-0 accent-forest-600"
                      />

                      <div className="min-w-[9rem] flex-1">
                        <p className="truncate font-mono text-[0.76rem] text-sage-500" title={line.raw}>
                          {line.raw}
                        </p>
                        {line.product ? (
                          <p className="text-[0.9rem] font-medium text-ink">
                            {line.product.glyph} {line.product.name}
                            <span className="ml-1.5 text-[0.76rem] font-normal text-sage-500">
                              {line.reason}
                            </span>
                          </p>
                        ) : (
                          <p className="text-[0.9rem] font-medium text-spend">Not matched</p>
                        )}
                      </div>

                      <span
                        className={`hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-cream-200 sm:block`}
                        title={`Confidence ${Math.round(line.confidence * 100)}%`}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(6, Math.round(line.confidence * 100))}%`,
                            background:
                              tone === "save"
                                ? "var(--color-save)"
                                : tone === "warn"
                                  ? "var(--color-warn)"
                                  : "var(--color-spend)",
                          }}
                        />
                      </span>

                      {options.length > 0 && (
                        <label className="flex items-center gap-1.5 text-[0.76rem] text-sage-500">
                          <span className="sr-only">Change product for line {line.lineNumber}</span>
                          <select
                            value={line.canonicalId ?? ""}
                            onChange={(event) => {
                              const id = event.target.value || null;
                              const product = id ? products.get(id) : null;
                              patch(line.lineNumber, {
                                canonicalId: id,
                                quantity: product?.defaultQuantity ?? 1,
                                include: !!id,
                              });
                            }}
                            className="field h-9 max-w-[10rem] py-0 text-[0.8rem]"
                          >
                            <option value="">— none —</option>
                            {options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {line.canonicalId && line.product && (
                        <label className="flex items-center gap-1.5 text-[0.78rem] text-sage-600">
                          <span className="sr-only">Quantity for line {line.lineNumber}</span>
                          <input
                            type="number"
                            min={0}
                            step={line.product.defaultQuantity > 1 ? 1 : 0.5}
                            value={line.quantity}
                            onChange={(event) =>
                              patch(line.lineNumber, { quantity: Number(event.target.value) || 0 })
                            }
                            className="field tabular h-9 w-20 py-0 text-right text-[0.84rem]"
                          />
                          <span className="w-10 text-sage-500">
                            {unitOf(line.product.unit, line.quantity)}
                          </span>
                        </label>
                      )}

                      {line.printedPrice !== null && (
                        <span className="tabular w-[5.5rem] text-right text-[0.84rem] text-sage-600">
                          {formatPKR(line.printedPrice)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* summary rail */}
      <aside className="lg:sticky lg:top-20">
        {!parsed ? (
          <div className="rounded-4xl border border-dashed border-cream-300 bg-cream-50/60 p-6 text-[0.86rem] leading-relaxed text-sage-600">
            <p className="font-display text-[1.05rem] text-forest-900">What happens here</p>
            <ol className="mt-3 space-y-2">
              <li>1. The receipt is read line by line — quantity, pack size, price.</li>
              <li>2. Each line is matched to a product in the catalogue, with a confidence.</li>
              <li>3. You fix what it got wrong, then the basket is priced at all nine stores.</li>
            </ol>
            <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-[0.78rem] text-warn">
              Nothing is uploaded except the text. Photos stay in the browser.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-4xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)]">
              <h3 className="font-display text-[1rem] font-semibold text-forest-950">
                {pluralise(selected.length, "item")} selected
              </h3>
              <dl className="mt-3 space-y-2 text-[0.84rem]">
                {parsed.printedTotal !== null && (
                  <Row label="Printed on receipt" value={formatPKR(parsed.printedTotal)} />
                )}
                {plan && (
                  <Row
                    label={`Kartly's cheapest for ${pluralise(selected.length, "line")}`}
                    value={formatPKR(plan.savings.bestTotal)}
                    tone="save"
                  />
                )}
                {parsed.printedTotal !== null &&
                  plan &&
                  unmatchedValue === 0 &&
                  (plan.savings.bestTotal <= parsed.printedTotal ? (
                    <Row
                      label="You could have saved"
                      value={formatPKR(parsed.printedTotal - plan.savings.bestTotal)}
                      tone="save"
                    />
                  ) : (
                    <Row
                      label="You beat every store"
                      value={formatPKR(plan.savings.bestTotal - parsed.printedTotal)}
                      tone="muted"
                    />
                  ))}
                {plan?.bestPlan && plan.bestPlan.storeCount > 1 && (
                  <Row
                    label={`Cheapest across ${plan.bestPlan.storeCount} shops`}
                    value={plan.bestPlan.orders.map((order) => STORE_MAP[order.storeId]?.name ?? order.store.name).join(" + ")}
                    tone="muted"
                  />
                )}
              </dl>
              {unmatchedValue > 0 && (
                <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[0.76rem] leading-relaxed text-warn">
                  {formatPKR(unmatchedValue)} across {pluralise(unmatchedLines, "line")} is not
                  matched yet, so the two totals above are not like for like. Fix the flagged lines
                  to compare the whole bill.
                </p>
              )}
              {catalogueLoading && <p className="mt-3 text-[0.78rem] text-sage-500">Loading prices…</p>}
              <p className="mt-3 text-[0.74rem] leading-relaxed text-sage-500">
                The receipt total is what you paid at one store. Kartly&apos;s figure is the same list
                bought the cheapest way, delivery included.
              </p>
            </div>

            <div className="rounded-4xl border border-cream-200 bg-forest-900 p-5 text-cream-50">
              <p className="text-[0.72rem] uppercase tracking-[0.1em] text-lime-400">Next</p>
              <p className="mt-1 text-[0.86rem] leading-relaxed text-cream-200">
                Load these into your basket and Kartly will price them at all nine supermarkets.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button variant="accent" onClick={() => addToBasket(true)} disabled={!selected.length}>
                  Replace basket with {selected.length} items
                </Button>
                <Button variant="outline" onClick={() => addToBasket(false)} disabled={!selected.length}>
                  Add to current basket
                </Button>
              </div>
              <Link
                href="/basket"
                className="mt-3 inline-block text-[0.8rem] font-semibold text-lime-400 hover:underline"
              >
                Open basket →
              </Link>
            </div>

            <LinkButton href="/search" variant="quiet" size="sm">
              Can&apos;t find something? Search products
            </LinkButton>
          </div>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "save" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sage-600">{label}</dt>
      <dd
        className={`tabular font-semibold ${
          tone === "save" ? "text-save" : tone === "muted" ? "text-sage-500" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function unitOf(unit: Unit, quantity: number): string {
  return formatQuantity(quantity, unit).replace(/^[\d.,]+\s*/, "");
}
