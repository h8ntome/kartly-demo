"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { formatPKR } from "@/lib/engine/format";

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

const VARIANTS = {
  primary:
    "bg-forest-800 text-cream-50 hover:bg-forest-700 shadow-[0_10px_24px_-14px_rgba(7,37,26,0.9)]",
  accent:
    "bg-lime-500 text-forest-900 hover:bg-lime-400 shadow-[0_10px_24px_-14px_rgba(111,156,31,0.9)]",
  outline: "border border-forest-800/25 text-forest-900 hover:border-forest-800/60 hover:bg-cream-100",
  quiet: "text-sage-600 hover:text-forest-800 hover:bg-cream-100",
  danger: "text-spend hover:bg-spend-soft",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-[0.8rem] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[0.95rem] gap-2 rounded-xl",
} as const;

const base =
  "inline-flex select-none items-center justify-center font-medium transition-[background,color,border-color,transform,box-shadow] duration-200 ease-[var(--ease-out-expo)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}) {
  return <button className={`${base} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Small parts
 * ------------------------------------------------------------------ */

export function Chip({
  active = false,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[0.8rem] font-medium transition-colors duration-200 ${
        active
          ? "border-forest-800 bg-forest-800 text-cream-50"
          : "border-cream-300 bg-white text-sage-600 hover:border-sage-300 hover:text-forest-800"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Tag({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: "neutral" | "save" | "spend" | "warn" | "live";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-cream-100 text-sage-600 ring-cream-300",
    save: "bg-save-soft text-save ring-forest-300/40",
    spend: "bg-spend-soft text-spend ring-spend/20",
    warn: "bg-warn-soft text-warn ring-warn/20",
    live: "bg-forest-800 text-lime-400 ring-forest-700",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Price with tabular figures and an optional struck-through list price. */
export function Price({
  amount,
  list,
  size = "md",
  tone = "default",
  className = "",
}: {
  amount: number;
  list?: number;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "save" | "muted";
  className?: string;
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-[1.05rem]",
    lg: "text-2xl",
    xl: "text-[2.6rem] leading-[1.02]",
  } as const;
  const tones = {
    default: "text-ink",
    save: "text-save",
    muted: "text-sage-500",
  } as const;
  return (
    <span className={`tabular inline-flex items-baseline gap-2 whitespace-nowrap ${className}`}>
      <span className={`${sizes[size]} font-semibold tracking-tight ${tones[tone]}`}>
        {formatPKR(amount)}
      </span>
      {!!list && list > amount && (
        <span className="text-[0.8em] text-sage-400 line-through decoration-sage-300">
          {formatPKR(list)}
        </span>
      )}
    </span>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-md bg-cream-200 ${className}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  glyph,
  title,
  body,
  action,
}: {
  glyph: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-cream-300 bg-cream-50/60 px-6 py-14 text-center">
      <span className="text-3xl" aria-hidden="true">
        {glyph}
      </span>
      <h3 className="text-lg text-forest-900">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-sage-600">{body}</p>
      {action}
    </div>
  );
}

/** Section heading with an eyebrow, used across marketing and app pages. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
  id,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  id?: string;
}) {
  return (
    <header className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow && (
        <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-lime-700">
          {eyebrow}
        </p>
      )}
      <h2 id={id} className="text-[1.9rem] leading-[1.1] text-forest-950 sm:text-[2.4rem]">
        {title}
      </h2>
      {lead && <p className="mt-4 text-[1.02rem] leading-relaxed text-sage-600">{lead}</p>}
    </header>
  );
}
