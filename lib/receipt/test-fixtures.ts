/**
 * Shared receipt fixtures. Split out so the test harness and the browser page
 * read from exactly the same bills — no drift between what is tested and what
 * is shown.
 */

export { parseReceiptText } from "@/lib/receipt/parse";
export { EXAMPLE_RECEIPTS as EXAMPLE_RECEIPTS_FOR_TEST } from "@/lib/catalog/dataset";
