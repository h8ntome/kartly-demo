"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { CheckIcon } from "@/components/ui/Icons";

/**
 * One toast surface for the whole app.
 *
 * Every mutation in a shopping flow (add, remove, quantity, order placed) needs
 * a word of feedback. Without one the app looks frozen; with a page-blocking
 * dialog it feels like a form. This is the middle option: a transient strip
 * docked above the tab bar, dismissible, announced politely to screen readers.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  title: string;
  detail?: string;
  glyph?: string;
  action?: ToastAction;
  tone?: "default" | "save";
}

interface ToastRecord extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      // Only ever show the newest two: a fast shopper adding six items should
      // not end up with a stack of receipts to wave away.
      setItems((current) => [...current.slice(-1), { ...input, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 3600),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-b)+0.5rem)] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-forest-900 px-3.5 py-3 text-cream-50 shadow-[var(--shadow-lift)]"
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  item.tone === "save" ? "bg-lime-500 text-forest-900" : "bg-forest-700 text-lime-400"
                }`}
                aria-hidden="true"
              >
                {item.glyph ? <span className="text-base">{item.glyph}</span> : <CheckIcon className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.86rem] font-semibold">{item.title}</span>
                {item.detail && (
                  <span className="block truncate text-[0.76rem] text-cream-200">{item.detail}</span>
                )}
              </span>
              {item.action && (
                <button
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="shrink-0 rounded-lg bg-forest-700 px-2.5 py-1.5 text-[0.78rem] font-semibold text-lime-300 transition-colors hover:bg-forest-600"
                >
                  {item.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-lg px-1.5 py-1 text-cream-200/70 transition-colors hover:text-cream-50"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
