import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { BasketProvider } from "@/lib/basket/store";
import { SiteHeader } from "@/components/layout/Header";
import { SiteFooter } from "@/components/layout/Footer";
import { getDataStatus } from "@/lib/api/status";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  // Fraunces is a variable font. next/font only accepts custom axes when the
  // weight is the whole variable range, so the optical-size-ish SOFT/WONK axes
  // are requested alongside a variable wght rather than four static cuts.
  weight: "variable",
  axes: ["SOFT", "WONK"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Kartly — your shopping list, at the lowest possible cost",
    template: "%s · Kartly",
  },
  description:
    "Kartly compares grocery prices across nine Karachi supermarkets and works out the cheapest way to buy your whole shopping list — prices, pack sizes, offers, stock and delivery included.",
  applicationName: "Kartly",
  keywords: [
    "grocery price comparison Pakistan",
    "Karachi groceries",
    "cheapest grocery basket",
    "Imtiaz Naheed Carrefour prices",
  ],
  openGraph: {
    title: "Kartly — your shopping list, at the lowest possible cost",
    description:
      "Compare nine Karachi supermarkets on your entire basket, not one product at a time. Kartly finds the cheapest single store, or the two-store split that beats it.",
    type: "website",
    locale: "en_PK",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b3527",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once per render so the header badge reflects the configured source.
  const status = await getDataStatus();

  return (
    <html lang="en-PK" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh antialiased">
        <BasketProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-forest-800 focus:px-4 focus:py-2 focus:text-cream-50"
          >
            Skip to content
          </a>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader status={status} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </BasketProvider>
      </body>
    </html>
  );
}
