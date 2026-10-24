"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button, EmptyState, LinkButton } from "@/components/ui/Primitives";
import { StoreBadge } from "@/components/brand/Logo";
import { SavingsRing } from "@/components/savings/SavingsVisual";
import {
  CardIcon,
  CashIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  NoteIcon,
  PhoneIcon,
  PinIcon,
  ShieldIcon,
  TruckIcon,
} from "@/components/ui/Icons";
import { useBasket } from "@/lib/basket/store";
import { useCatalog, usePlan } from "@/lib/basket/use-catalog";
import { useMounted, useNow, useOrders, type OrderShop } from "@/lib/orders/store";
import {
  ASAP_SLOT_ID,
  asapSlot,
  buildSlots,
  etaFor,
  type Slot,
} from "@/lib/orders/slots";
import { useToast } from "@/components/ui/Toast";
import { formatPKR, formatPKRShort, formatQuantityInput } from "@/lib/engine/format";
import { ListSkeleton } from "@/components/ui/Skeletons";

/**
 * Demo checkout.
 *
 * The whole point of this screen is to show what happens *after* the optimiser:
 * the cheapest plan becomes one order per shop, with its own delivery rule. It
 * is unmistakably a demo — nothing is sent anywhere, no payment is taken, and
 * the screen says so in one line rather than a paragraph of caveats.
 */

const ADDRESSES = [
  {
    id: "home",
    label: "Home",
    name: "Ayesha K.",
    phone: "0300 000 0000",
    line1: "Flat 4B, 12th Lane",
    area: "DHA Phase 6, Karachi",
  },
  {
    id: "office",
    label: "Office",
    name: "Ayesha K.",
    phone: "021 000 0000",
    line1: "Suite 9, Executive Tower",
    area: "I.I. Chundrigar Road, Karachi",
  },
];

const PAYMENTS = [
  { id: "cod", label: "Cash on delivery", hint: "Pay the rider at your door", Icon: CashIcon },
  { id: "card", label: "Card on delivery", hint: "Tap or insert with the rider", Icon: CardIcon },
];

export default function CheckoutPage() {
  const { rows, clear } = useBasket();
  const { loading } = useCatalog();
  const { plan } = usePlan(rows);
  const { place } = useOrders();
  const { toast } = useToast();
  const router = useRouter();

  const [addressId, setAddressId] = useState<string>(ADDRESSES[0].id);
  const [custom, setCustom] = useState({ name: "", phone: "", line1: "", area: "" });
  const [slotId, setSlotId] = useState<string>("");
  const [paymentId, setPaymentId] = useState<string>(PAYMENTS[0].id);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  // Delivery slots come from the shopper's clock, so they are only built once
  // the browser is the one rendering — a prerendered page would otherwise print
  // build-time hours and disagree with the client.
  const mounted = useMounted();
  const slots = useMemo(() => (mounted ? buildSlots(new Date()) : []), [mounted]);
  // Only the ASAP row needs a live clock; the scheduled windows are fixed once
  // the shopper sees them, so they are not rebuilt on every tick.
  const now = useNow(10_000);
  const choices = useMemo<Slot[]>(
    () => (mounted ? [asapSlot(new Date(now)), ...slots] : []),
    [mounted, now, slots],
  );
  const activeSlot =
    choices.find((entry) => entry.id === slotId)?.id ?? choices[0]?.id ?? "";
  const address =
    addressId === "custom"
      ? { name: custom.name, phone: custom.phone, line1: custom.line1, area: custom.area }
      : ADDRESSES.find((entry) => entry.id === addressId) ?? ADDRESSES[0];

  const addressReady =
    addressId !== "custom" ||
    (address.name.trim() && address.phone.trim() && address.line1.trim() && address.area.trim());
  const canPlace = !!plan?.bestPlan && addressReady && !placing;

  const shops: OrderShop[] = useMemo(() => {
    if (!plan?.bestPlan) return [];
    const itemsById = new Map(plan.items.map((item) => [item.id, item]));
    return plan.bestPlan.orders.map((order) => ({
      storeId: order.storeId,
      storeName: order.store.name,
      lines: order.lines.map((line) => {
        const item = itemsById.get(line.lineId);
        return {
          canonicalId: line.canonicalId,
          name: line.name,
          glyph: line.glyph,
          quantity: item?.quantity ?? line.choice.packs * line.choice.offer.quantity,
          unit: item?.unit ?? line.choice.offer.unit,
          packLabel: `${line.choice.packs > 1 ? `${line.choice.packs} × ` : ""}${line.choice.offer.packLabel}`,
          cost: line.choice.cost,
        };
      }),
      subtotal: order.subtotal,
      delivery: order.delivery,
      deliveryKnown: order.deliveryKnown,
      freeDelivery: order.freeDelivery,
    }));
  }, [plan]);

  if (!loading && rows.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[46rem] px-4 py-10 sm:px-6">
        <EmptyState
          glyph="🧺"
          title="Nothing to check out yet"
          body="Add a few products and the cheapest way to buy them will show up here."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <LinkButton href="/search">Browse products</LinkButton>
              <LinkButton href="/basket" variant="quiet">
                Back to basket →
              </LinkButton>
            </div>
          }
        />
      </div>
    );
  }

  const submit = () => {
    const best = plan?.bestPlan;
    if (!best || !canPlace) return;
    setPlacing(true);
    const slot = choices.find((entry) => entry.id === activeSlot) ?? choices[0];
    const slotLabel = slot?.label ?? "ASAP";
    // ASAP starts when the order is actually placed; a window starts when it opens.
    const paymentLabel = PAYMENTS.find((entry) => entry.id === paymentId)?.label ?? PAYMENTS[0].label;

    // A short, honest pause: the confirmation has to feel like something happened.
    setTimeout(() => {
      const order = place({
        address: {
          name: address.name,
          phone: address.phone,
          line1: address.line1,
          area: address.area,
        },
        slot: slotLabel,
        etaAt: etaFor(slot, Date.now()),
        payment: paymentLabel,
        shops,
        goods: best.subtotal,
        delivery: best.delivery,
        deliveryKnown: best.deliveryKnown,
        total: best.total,
        baseline: plan?.worstSingle?.total ?? best.total,
        saved: plan?.savings.bestVsWorst ?? 0,
        itemCount: plan?.items.length ?? 0,
      });
      clear();
      toast({
        title: "Demo order placed",
        detail: `${order.itemCount} items · ${formatPKR(order.total)}`,
        tone: "save",
      });
      router.push(`/order/${order.id}`);
    }, 900);
  };

  return (
    <div className="has-dock page max-w-[62rem] lg:pt-2">
      <header className="flex items-center gap-3 pt-6">
        <Link
          href="/basket"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cream-300 bg-white text-forest-800 transition-colors hover:bg-cream-100"
          aria-label="Back to basket"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-[1.6rem] font-semibold leading-tight text-forest-950">
            Checkout
          </h1>
          <p className="text-[0.8rem] text-sage-500">
            {plan?.bestPlan
              ? `${plan.bestPlan.storeCount} ${plan.bestPlan.storeCount === 1 ? "shop" : "shops"} · ${plan.items.length} items`
              : "Pricing your basket…"}
          </p>
        </div>
        {plan && plan.savings.bestVsWorst > 0 && (
          <span className="ml-auto rounded-full bg-save-soft px-3 py-1.5 text-[0.78rem] font-bold text-save">
            saving {formatPKRShort(plan.savings.bestVsWorst)}
          </span>
        )}
      </header>

      {plan && !plan.bestPlan ? (
        <div className="mt-6">
          <EmptyState
            glyph="🚫"
            title="No shop can fill this basket"
            body="At least one line is out of stock everywhere in the catalogue, so there is nothing to order yet. Remove it or swap it and the checkout opens up."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <LinkButton href="/basket">Back to basket</LinkButton>
              </div>
            }
          />
        </div>
      ) : !plan?.bestPlan ? (
        <div className="mt-6 rounded-3xl border border-cream-200 bg-white p-4">
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <div className="mt-5 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:items-start lg:gap-6 lg:space-y-0">
          <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-2xl bg-cream-100 px-4 py-3 text-[0.78rem] leading-relaxed text-sage-600">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-sage-500" />
            <p>
              This is a demo checkout. Nothing is sent to the stores and no payment is taken — the
              order and its progress are simulated on your device.
            </p>
          </div>

          {/* ------------------------------------------------ address */}
          <Section title="Where it&apos;s going" Icon={PinIcon}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              {ADDRESSES.map((entry) => (
                <Choice
                  key={entry.id}
                  active={addressId === entry.id}
                  onClick={() => setAddressId(entry.id)}
                  title={entry.label}
                  detail={`${entry.name} · ${entry.line1}, ${entry.area}`}
                />
              ))}
              <Choice
                active={addressId === "custom"}
                onClick={() => setAddressId("custom")}
                title="Another address"
                detail="Type it in for this order"
              />
            </div>

            <AnimatePresence initial={false}>
              {addressId === "custom" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      className="field"
                      placeholder="Name"
                      value={custom.name}
                      onChange={(event) => setCustom({ ...custom, name: event.target.value })}
                    />
                    <input
                      className="field"
                      placeholder="Phone"
                      inputMode="tel"
                      value={custom.phone}
                      onChange={(event) => setCustom({ ...custom, phone: event.target.value })}
                    />
                    <input
                      className="field sm:col-span-2"
                      placeholder="Address"
                      value={custom.line1}
                      onChange={(event) => setCustom({ ...custom, line1: event.target.value })}
                    />
                    <input
                      className="field sm:col-span-2"
                      placeholder="Area, city"
                      value={custom.area}
                      onChange={(event) => setCustom({ ...custom, area: event.target.value })}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* --------------------------------------------------- slot */}
          <Section title="When" Icon={ClockIcon}>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
              {choices.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => setSlotId(slot.id)}
                  aria-pressed={activeSlot === slot.id}
                  className={`shrink-0 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                    activeSlot === slot.id
                      ? "border-forest-700 bg-forest-800 text-cream-50"
                      : "border-cream-300 bg-white text-ink-soft hover:border-sage-300"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[0.86rem] font-semibold">
                    {slot.id === ASAP_SLOT_ID && (
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          activeSlot === slot.id ? "animate-ring bg-lime-400" : "bg-sage-400"
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    {slot.label}
                  </span>
                  <span
                    className={`block text-[0.72rem] ${
                      activeSlot === slot.id ? "text-cream-200" : "text-sage-500"
                    }`}
                  >
                    {slot.hint}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* ------------------------------------------------ payment */}
          <Section title="How you pay" Icon={CardIcon}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
              {PAYMENTS.map(({ id, label, hint, Icon }) => (
                <button
                  key={id}
                  onClick={() => setPaymentId(id)}
                  aria-pressed={paymentId === id}
                  className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                    paymentId === id
                      ? "border-forest-700 bg-save-soft"
                      : "border-cream-300 bg-white hover:border-sage-300"
                  }`}
                >
                  <Icon className="h-5 w-5 text-forest-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.88rem] font-semibold text-ink">{label}</span>
                    <span className="block text-[0.74rem] text-sage-500">{hint}</span>
                  </span>
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                      paymentId === id
                        ? "border-forest-700 bg-forest-800 text-lime-400"
                        : "border-cream-300 text-transparent"
                    }`}
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {/* -------------------------------------------------- notes */}
          <Section title="Notes for the shopper" Icon={NoteIcon}>
            <textarea
              className="field min-h-[4.5rem] resize-y"
              placeholder="e.g. leave with the building guard"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Section>
          </div>

          {/* -------------------------------------------------- order */}

          <div className="space-y-4 lg:sticky lg:top-24">
          <Section title="Your order" Icon={TruckIcon}>            <div className="space-y-3">
              {shops.map((shop, index) => (
                <div
                  key={shop.storeId}
                  className="overflow-hidden rounded-2xl border border-cream-200"
                >
                  <div className="flex items-center gap-2.5 bg-cream-50 px-3.5 py-2.5">
                    <StoreBadge storeId={shop.storeId} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.88rem] font-semibold text-ink">{shop.storeName}</p>
                      <p className="text-[0.72rem] text-sage-500">
                        Order {index + 1} of {shops.length} · {shop.lines.length}{" "}
                        {shop.lines.length === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <span className="tabular text-[0.86rem] font-semibold text-ink">
                      {formatPKR(shop.subtotal)}
                    </span>
                  </div>
                  <ul className="divide-y divide-cream-100 px-3.5">
                    {shop.lines.map((line) => (
                      <li key={line.canonicalId} className="flex items-center gap-2.5 py-2.5">
                        <span className="text-lg" aria-hidden="true">
                          {line.glyph}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.84rem] font-medium text-ink">
                            {line.name}
                          </span>
                          <span className="block text-[0.72rem] text-sage-500">
                            {formatQuantityInput(line.quantity)} {line.unit} · {line.packLabel}
                          </span>
                        </span>
                        <span className="tabular text-[0.84rem] font-semibold text-ink">
                          {formatPKR(line.cost)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-3 border-t border-cream-100 bg-cream-50/60 px-3.5 py-2 text-[0.78rem]">
                    <span className="text-sage-600">
                      {shop.deliveryKnown ? (
                        shop.freeDelivery ? (
                          <span className="font-semibold text-save">Free delivery</span>
                        ) : (
                          `${formatPKR(shop.delivery)} delivery`
                        )
                      ) : (
                        <span className="text-sage-500">Delivery not published</span>
                      )}
                    </span>
                    <span className="tabular font-semibold text-ink">
                      {formatPKR(shop.subtotal + (shop.deliveryKnown ? shop.delivery : 0))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

          </Section>

          {/* ------------------------------------------------- totals */}
          <Section title="Totals" Icon={CheckIcon}>
            <dl className="divide-y divide-cream-200 text-[0.88rem]">
              <Row label={`Goods (${plan.items.length} items)`} value={formatPKR(plan.bestPlan.subtotal)} />
              <Row
                label="Delivery"
                value={
                  plan.bestPlan.deliveryKnown
                    ? plan.bestPlan.delivery === 0
                      ? "Free"
                      : formatPKR(plan.bestPlan.delivery)
                    : "Not published"
                }
                tone={plan.bestPlan.deliveryKnown && plan.bestPlan.delivery === 0 ? "save" : "default"}
              />
              {plan.savings.promoValue > 0 && (
                <Row label="Offers applied" value={`−${formatPKR(plan.savings.promoValue)}`} tone="save" />
              )}
              <div className="flex items-center justify-between gap-4 pt-3">
                <dt className="font-display text-[1.05rem] font-semibold text-forest-950">
                  Total to pay
                </dt>
                <dd className="tabular font-display text-[1.5rem] font-semibold text-forest-900">
                  {formatPKR(plan.bestPlan.total)}
                </dd>
              </div>
            </dl>

            {plan.savings.bestVsWorst > 0 && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-save-soft px-4 py-3">
                <SavingsRing
                  saved={plan.savings.bestVsWorst}
                  baseline={plan.worstSingle?.total ?? 0}
                  certain={plan.savings.savingsCertain}
                />
                <p className="text-[0.82rem] leading-relaxed text-save">
                  <strong className="font-display text-[1.05rem]">
                    {formatPKR(plan.savings.bestVsWorst)}
                  </strong>{" "}
                  less than the same basket at {plan.worstSingle?.store.name}
                  {!plan.savings.savingsCertain && " (estimate — one shop has no published fee)"}
                </p>
              </div>
            )}
          </Section>

          {/* On a wide screen the summary column carries the call to action, so
              nobody has to reach for the bottom of the viewport. */}
          <Button
            variant="accent"
            size="lg"
            disabled={!canPlace}
            onClick={submit}
            className="hidden w-full lg:flex"
          >
            {placing ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest-900/30 border-t-forest-900" />
                Placing…
              </>
            ) : (
              <>
                Place demo order
                <ChevronRightIcon className="h-4 w-4" />
              </>
            )}
          </Button>
          </div>

          <div className="dock lg:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-sage-500">
                  Total to pay
                </p>
                <p className="tabular font-display text-[1.45rem] font-semibold leading-tight text-forest-950">
                  {formatPKR(plan.bestPlan.total)}
                </p>
              </div>
              <Button
                variant="accent"
                size="lg"
                disabled={!canPlace}
                onClick={submit}
                className="min-w-[10.5rem]"
              >
                {placing ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest-900/30 border-t-forest-900" />
                    Placing…
                  </>
                ) : (
                  <>
                    Place demo order
                    <ChevronRightIcon className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {!addressReady && addressId === "custom" && (
            <p className="pb-2 text-center text-[0.78rem] text-warn">
              Add a name, phone and address to place the order.
            </p>
          )}

          <p className="flex items-center justify-center gap-1.5 pb-2 pt-1 text-[0.74rem] text-sage-400">
            <PhoneIcon className="h-3.5 w-3.5" />
            Kartly is a price comparison demo — orders are simulated on your device.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-cream-200 bg-white p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-3 flex items-center gap-2 text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-sage-500">
        <Icon className="h-4 w-4 text-forest-700" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
        active ? "border-forest-700 bg-save-soft" : "border-cream-300 bg-white hover:border-sage-300"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.88rem] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[0.76rem] text-sage-500">{detail}</span>
      </span>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          active ? "border-forest-700 bg-forest-800 text-lime-400" : "border-cream-300 text-transparent"
        }`}
      >
        <CheckIcon className="h-3 w-3" />
      </span>
    </button>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "save";
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sage-600">{label}</dt>
      <dd className={`tabular font-semibold ${tone === "save" ? "text-save" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}
