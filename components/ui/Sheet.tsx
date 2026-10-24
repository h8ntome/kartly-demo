"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { CloseIcon } from "@/components/ui/Icons";

/**
 * Bottom sheet on a phone, centred card on a desktop.
 *
 * Filters, sort options and confirmations belong in a sheet in a mobile app:
 * they are reachable with a thumb and they never navigate away from the list the
 * shopper is still looking at.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Drag-to-dismiss is a touch affordance; a mouse user gets the close button.
  const [draggable, setDraggable] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setDraggable(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-forest-950/45 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            drag={draggable ? "y" : false}
            dragConstraints={{ top: 0, bottom: 90 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 650) onClose();
            }}
            className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col rounded-t-[1.75rem] bg-cream-50 shadow-[var(--shadow-lift)] md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[30rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
          >
            <div className="flex justify-center pt-2.5 md:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-cream-300" />
            </div>
            <header className="flex items-start gap-3 px-5 pb-3 pt-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[1.15rem] font-semibold text-forest-950">{title}</h2>
                {description && <p className="mt-1 text-[0.82rem] text-sage-600">{description}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream-200 text-sage-600 transition-colors hover:bg-cream-300 hover:text-ink"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && (
              <div className="border-t border-cream-200 bg-white px-5 py-3.5 pb-[calc(0.875rem+var(--safe-b))] md:pb-3.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
