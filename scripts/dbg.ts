import { sampleProvider } from "@/lib/api/providers/sample";
import { compareBasket, toBasketItems } from "@/lib/engine/plan";
import { TEASER_BASKET } from "@/lib/catalog/sample/generate";
import type { ProductDetail } from "@/lib/types";
async function main(){
const snap = await sampleProvider.load();
const products = new Map<string, ProductDetail>(snap.products.map(p=>[p.id,p]));
const rows = TEASER_BASKET.map((e,i)=>({id:`l${i}`,canonicalId:e.canonicalId,quantity:e.quantity}));
const items = toBasketItems(rows, products);
const plan = compareBasket(items, products, snap.stores);
for (const q of plan.quotes) {
  console.log(`\n${q.store.name} sub=${q.subtotal} del=${q.delivery} total=${q.total} complete=${q.complete} eligible=${q.eligible} belowMin=${q.belowMinOrder}`);
  for (const l of q.lines) console.log(`   ${l.glyph} ${l.name} req=${l.requested}${l.unit} -> ${l.packs}x ${l.offer.packLabel} (${l.offer.brand}) = ${l.cost}`);
  for (const m of q.missing) console.log(`   MISSING ${m.name} ${m.reason} ${m.detail??''}`);
}
console.log('\nSPLIT', plan.split && {p:plan.split.primaryStoreId,s:plan.split.secondaryStoreId,total:plan.split.total,pl:plan.split.primary.lines.length,sl:plan.split.secondary.lines.length});
}
main();
