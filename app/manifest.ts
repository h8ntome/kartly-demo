import type { MetadataRoute } from "next";

/**
 * Installable-app metadata. The demo runs in a browser tab, but declaring this
 * means "Add to Home Screen" on a phone gives a Kartly-coloured splash and a
 * standalone window instead of a Safari chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kartly — your shopping list, at the lowest possible cost",
    short_name: "Kartly",
    description:
      "Price your whole grocery basket across Karachi supermarkets and buy it the cheapest way.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdfbf5",
    theme_color: "#0b3527",
    categories: ["shopping", "productivity"],
  };
}
