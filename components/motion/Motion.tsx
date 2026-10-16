"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { formatNumber, formatPKR, formatPKRShort } from "@/lib/engine/format";
import type { ReactNode } from "react";

/**
 * Motion layer.
 *
 * Everything here degrades to "appear immediately" under
 * prefers-reduced-motion, and the reveal animations are one-shot: they never
 * replay on scroll-up, because a price table that animates every time you scan
 * it is a price table you cannot read.
 */

export function Reveal({
  children,
  delay = 0,
  y = 18,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as] as typeof motion.div;
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Count-up that starts when scrolled into view.
 *
 * The format is a named style rather than a function on purpose: these numbers
 * are computed on the server and handed across the React boundary, and a
 * function prop would make that impossible to prerender.
 */
const FORMATTERS = {
  pkr: formatPKR,
  pkrShort: formatPKRShort,
  number: formatNumber,
} as const;

export type NumberFormat = keyof typeof FORMATTERS;

export function AnimatedNumber({
  value,
  format = "number",
  duration = 0.9,
  className = "",
}: {
  value: number;
  format?: NumberFormat;
  duration?: number;
  className?: string;
}) {
  const render = FORMATTERS[format];
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const spring = useSpring(0, { stiffness: 140, damping: 24, duration });
  // Seeded with the real figure so the prerendered HTML carries the number; the
  // spring starts at zero and overwrites it once the element is in view.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Under reduced motion nothing animates, so the target is printed straight
    // from state instead of being copied into it.
    if (reduced || !visible) return;
    spring.set(value);
    return spring.on("change", (latest) => setDisplay(latest));
  }, [value, visible, spring, reduced]);

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {/* Prerendered as the real figure: a stat that prints "Rs 0" in the HTML
          is a stat that is not in the HTML for anyone who does not run JS. */}
      {render(display)}
    </span>
  );
}

/**
 * Horizontal bar that grows to a share of the widest value. Used for the
 * store-by-store basket totals.
 */
export function GrowBar({
  ratio,
  color,
  className = "",
  delay = 0,
}: {
  ratio: number;
  color: string;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, ratio));
  const spring = useSpring(reduced ? clamped : 0, { stiffness: 90, damping: 20 });
  const width = useTransform(spring, (value) => `${value * 100}%`);

  useEffect(() => {
    if (reduced) {
      spring.set(clamped);
      return;
    }
    const timer = setTimeout(() => spring.set(clamped), delay * 1000);
    return () => clearTimeout(timer);
  }, [clamped, delay, reduced, spring]);

  return (
    <span className={`block h-1.5 w-full overflow-hidden rounded-full bg-cream-200 ${className}`}>
      <motion.span
        className="block h-full rounded-full"
        style={{ width, background: color }}
      />
    </span>
  );
}
