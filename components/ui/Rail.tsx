"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/Icons";

/**
 * A horizontal rail of cards.
 *
 * On a phone it is the native pattern: swipe sideways, cards bleed to the edge.
 * On a tablet or a laptop it stays a rail rather than collapsing into a grid —
 * a grid of five cards across 1300px is four cards and a lonely one, and it
 * reads like a website that gave up. Instead the cards get wider, the rail
 * keeps its edge alignment, and real arrows appear for anyone with a mouse.
 */
export function Rail({
  title,
  hint,
  href,
  linkLabel,
  tight = false,
  className = "",
  children,
}: {
  title?: string;
  hint?: string;
  href?: string;
  linkLabel?: string;
  /** Narrower cards, for the "same product, different shop" style of tile. */
  tight?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ atStart: true, atEnd: false, still: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setState({
      atStart: el.scrollLeft <= 4,
      atEnd: el.scrollLeft >= max - 4,
      still: max <= 8,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const nudge = (direction: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className={className}>
      {(title || href) && (
        <div className="mb-3.5 flex items-end justify-between gap-3 px-0.5">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-[1.35rem] font-semibold leading-tight text-forest-950 sm:text-[1.6rem]">
                {title}
              </h2>
            )}
            {hint && <p className="mt-1 text-[0.8rem] text-sage-500">{hint}</p>}
          </div>
          {href && linkLabel && (
            <Link
              href={href}
              className="inline-flex shrink-0 items-center gap-1 text-[0.82rem] font-semibold text-forest-700 hover:text-forest-900"
            >
              {linkLabel}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      <div className="rail-shell" data-static={state.still ? "true" : "false"}>
        <button
          type="button"
          onClick={() => nudge(-1)}
          data-edge={state.atStart ? "true" : "false"}
          className="rail-nav rail-nav-prev"
          aria-label="Scroll left"
          tabIndex={state.still ? -1 : 0}
        >
          <ChevronRightIcon className="h-5 w-5 rotate-180" />
        </button>
        <div ref={track} className={`rail${tight ? " rail-tight" : ""}`} onScroll={measure}>
          {children}
        </div>
        <button
          type="button"
          onClick={() => nudge(1)}
          data-edge={state.atEnd ? "true" : "false"}
          className="rail-nav rail-nav-next"
          aria-label="Scroll right"
          tabIndex={state.still ? -1 : 0}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
