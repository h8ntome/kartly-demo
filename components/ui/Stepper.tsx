"use client";

import { motion } from "motion/react";
import { MinusIcon, PlusIcon } from "@/components/ui/Icons";
import { formatQuantityInput } from "@/lib/engine/format";

/**
 * Quantity stepper sized for a thumb.
 *
 * 40px hit targets, no text selection, and the number is the product's own unit
 * so "2 kg" means the same thing here as it does on a paper list.
 */
export function Stepper({
  value,
  step,
  min = 0,
  max = 999,
  unit,
  label,
  onChange,
  size = "md",
}: {
  value: number;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  onChange: (next: number) => void;
  size?: "sm" | "md";
}) {
  const hit = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const atMin = value - step < min - 1e-9;
  const atMax = value + step > max + 1e-9;

  return (
    <div
      className={`flex items-center gap-0.5 rounded-full border border-cream-300 bg-white p-1 ${
        size === "sm" ? "" : "shadow-[var(--shadow-card)]"
      }`}
    >
      <StepButton
        label={atMin ? `Remove ${label}` : `Decrease ${label}`}
        className={hit}
        disabled={atMin}
        onClick={() => onChange(atMin ? 0 : +(value - step).toFixed(3))}
      >
        {atMin ? <MinusIcon className="h-4 w-4" /> : <MinusIcon className="h-4 w-4" />}
      </StepButton>
      <span
        className={`tabular text-center font-semibold text-ink ${
          size === "sm" ? "min-w-[1.9rem] text-[0.8rem]" : "min-w-[3.6rem] text-[0.9rem]"
        }`}
      >
        {formatQuantityInput(value)}
        {unit ? <span className="ml-0.5 font-normal text-sage-500">{unit}</span> : null}
      </span>
      <StepButton
        label={`Increase ${label}`}
        className={hit}
        disabled={atMax}
        onClick={() => onChange(+(value + step).toFixed(3))}
      >
        <PlusIcon className="h-4 w-4" />
      </StepButton>
    </div>
  );
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
  className = "h-10 w-10",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.88 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid place-items-center rounded-full text-forest-800 transition-colors hover:bg-cream-100 disabled:opacity-30 ${className}`}
    >
      {children}
    </motion.button>
  );
}

/** Round add-to-basket button, as used on product tiles. */
export function AddPill({
  onClick,
  label,
  className = "",
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      aria-label={label}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-forest-800 px-3.5 text-[0.82rem] font-semibold text-cream-50 shadow-[0_8px_18px_-10px_rgba(7,37,26,0.8)] transition-colors hover:bg-forest-700 ${className}`}
    >
      <PlusIcon className="h-4 w-4" />
      Add
    </motion.button>
  );
}
