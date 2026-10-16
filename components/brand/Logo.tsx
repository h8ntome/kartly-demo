import { STORE_MAP } from "@/lib/catalog/stores";
import type { StoreId } from "@/lib/types";

/**
 * Kartly's mark: a shopping bag whose side panel drops into a price arrow.
 * The arrow is the whole product — a bag that is also a price going down.
 */
export function LogoMark({
  className = "h-9 w-9",
  tone = "forest",
}: {
  className?: string;
  tone?: "forest" | "cream";
}) {
  const body = tone === "forest" ? "var(--color-forest-800)" : "var(--color-cream-50)";
  const accent = "var(--color-lime-500)";
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Kartly">
      <rect x="1" y="1" width="38" height="38" rx="12" fill={body} />
      <path
        d="M12.5 15.5h15l-1.6 13.2a2.4 2.4 0 0 1-2.39 2.1h-7.02a2.4 2.4 0 0 1-2.39-2.1L12.5 15.5Z"
        fill={tone === "forest" ? "var(--color-cream-50)" : "var(--color-forest-900)"}
      />
      <path
        d="M16.4 15.5v-2.2a3.6 3.6 0 0 1 7.2 0v2.2"
        fill="none"
        stroke={tone === "forest" ? "var(--color-cream-50)" : "var(--color-forest-900)"}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path d="M19.1 20.4h1.9v4.1h4.1v1.9h-4.1v4.1h-1.9v-4.1h-4.1v-1.9h4.1v-4.1Z" fill={accent} transform="rotate(45 21 26)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-8 w-8" />
      <span className="font-display text-[1.35rem] font-semibold tracking-[-0.03em] text-forest-900">
        Kartly
      </span>
    </span>
  );
}

/** Store chip: initials on the store's own colour, so a row is scannable. */
export function StoreBadge({
  storeId,
  size = "md",
  showName = false,
}: {
  storeId: StoreId;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}) {
  const store = STORE_MAP[storeId];
  if (!store) return null;
  const dims =
    size === "sm"
      ? "h-6 w-6 text-[10px]"
      : size === "lg"
        ? "h-11 w-11 text-[15px]"
        : "h-8 w-8 text-xs";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-tight text-white ${dims}`}
        style={{ background: store.accent }}
        title={store.name}
      >
        {store.initials}
      </span>
      {showName && <span className="text-sm font-medium text-ink-soft">{store.name}</span>}
    </span>
  );
}

export function StoreWordmark({ storeId, className = "" }: { storeId: StoreId; className?: string }) {
  const store = STORE_MAP[storeId];
  if (!store) return null;
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 ${className}`}
      style={{ color: store.accent }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
        style={{ background: store.accent }}
      />
      <span className="font-display text-[0.95rem] font-semibold tracking-tight">{store.name}</span>
    </span>
  );
}
