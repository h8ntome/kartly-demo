/**
 * Shared receipt fixtures. Split out so the test harness and the browser demo
 * read from exactly the same sample receipts — no drift between what is tested
 * and what is shown.
 */

export { parseReceiptText } from "@/lib/receipt/parse";
export { SAMPLE_RECEIPTS as SAMPLE_RECEIPTS_FOR_TEST } from "@/lib/catalog/sample/generate";
