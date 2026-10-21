"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Primitives";
import { useBasket } from "@/lib/basket/store";

/**
 * The one thing the home page asks of a first-time visitor: put a real basket in
 * and watch the numbers move. It loads the same example basket the basket page
 * offers, so the figures on the landing screen and the figures you land on are
 * the same figures.
 */
export function LoadBasketCta({
  rows,
  label,
  variant = "accent",
  size = "lg",
}: {
  rows: Array<{ canonicalId: string; quantity: number }>;
  label: string;
  variant?: "primary" | "accent" | "outline";
  size?: "md" | "lg";
}) {
  const { replaceAll, clear } = useBasket();
  const router = useRouter();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => {
        // Replace, don't merge: this is "start from this example", not "add to
        // whatever I already had".
        clear();
        replaceAll(rows.map((row) => ({ canonicalId: row.canonicalId, quantity: row.quantity })));
        router.push("/basket");
      }}
    >
      {label}
    </Button>
  );
}
