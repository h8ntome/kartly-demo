import { clockLabel } from "./store";

/**
 * The delivery choices offered at checkout.
 *
 * Two of them are windows — a window is priced against the moment it opens —
 * and one of them is the shopper's own clock. Keeping the model here, rather
 * than inside the page, is what lets the checkout promise a time and the order
 * screen repeat exactly that time: both call `etaFor` with the same slot.
 */

/**
 * "As soon as possible" is a real choice at checkout, not a re-labelled window:
 * the order starts the moment it is placed and this is how long the demo allows
 * for hand-over from there. Scheduled windows ignore it.
 */
export const ASAP_SLOT_ID = "asap";
export const ASAP_LEAD_MS = 45 * 60 * 1000;

export interface Slot {
  id: string;
  label: string;
  hint: string;
  /** When the choice starts: a window opening, or "now" for ASAP. */
  startAt: number;
  /** How long after `startAt` the order is estimated to land. */
  leadMs: number;
}

/** A scheduled window is quoted half an hour into itself. */
export const SLOT_LEAD_MS = 30 * 60 * 1000;

/**
 * The shopper's "right now" option, built from their live clock. The hint is
 * the promise; `etaFor` is the same promise an order keeps, so the checkout
 * chip and the tracking screen can never disagree by more than the minute the
 * clock ticked between them.
 */
export function asapSlot(now: Date): Slot {
  const at = now.getTime();
  return {
    id: ASAP_SLOT_ID,
    label: "ASAP",
    hint: `now, ~by ${clockLabel(at + ASAP_LEAD_MS)}`,
    startAt: at,
    leadMs: ASAP_LEAD_MS,
  };
}

/**
 * Two-hour windows from the shopper's own clock: the next one that still fits
 * today, the one after that, then tomorrow morning. Nothing is invented — the
 * windows are the shopper's choice, and the order stores when the chosen one
 * opens so the tracking screen agrees with it.
 */
export function buildSlots(now: Date): Slot[] {
  const slots: Slot[] = [];
  const at = now.getTime();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const firstHour = Math.min(22, Math.ceil((now.getHours() + 1) / 2) * 2);

  const push = (dayOffset: number, hour: number, hint: string) => {
    const start = dayStart + dayOffset * 86_400_000 + hour * 3_600_000;
    slots.push({
      id: `${dayOffset}-${hour}`,
      label: `${dayOffset === 0 ? "Today" : dayOffset === 1 ? "Tomorrow" : "In 2 days"} ${formatHour(
        hour,
      )}–${formatHour(hour + 2)}`,
      hint,
      startAt: start,
      leadMs: SLOT_LEAD_MS,
    });
  };

  // Late enough that today's last window has already closed, and the only
  // honest windows left are tomorrow's.
  if (dayStart + firstHour * 3_600_000 > at) {
    push(0, firstHour, "Next window");
    if (firstHour + 2 <= 22) push(0, firstHour + 2, "Same delivery fee");
  }
  push(1, 10, "Morning drop");
  if (slots.length < 3) push(1, 12, "Same delivery fee");
  if (slots.length < 3) push(2, 10, "Same delivery fee");
  return slots.slice(0, 3);
}

/**
 * The rail the checkout renders, in the order it should be rendered.
 *
 * This is the only place the list is assembled, and the first element is always
 * ASAP: the demo has no store-hours data, so whenever a shop can take an order
 * at all it can take one now. A page that builds its own list can quietly drop
 * the live option — a page that calls this one cannot.
 */
export function deliveryChoices(now: Date): Slot[] {
  return [asapSlot(now), ...buildSlots(now)];
}

/** A window whose opening time has passed can no longer be chosen honestly. */
export function isClosed(slot: Slot, at: number): boolean {
  return slot.id !== ASAP_SLOT_ID && slot.startAt <= at;
}

/**
 * When an order for this slot should be estimated to arrive. ASAP counts from
 * the moment the order is actually placed; a window counts from when it opens —
 * unless it has already opened while the page sat open, in which case counting
 * from its start would promise a time in the past, so it counts from now.
 */
export function etaFor(slot: Slot, placedAt: number): number {
  const base = slot.id === ASAP_SLOT_ID ? placedAt : Math.max(slot.startAt, placedAt);
  return base + slot.leadMs;
}

export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}
