import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Big_Shoulders_Stencil, League_Gothic, Newsreader, Poiret_One } from "next/font/google";
import "./globals.css";

/* The exchange's signage: a Parisian Deco geometric, used large. */
const poiret = Poiret_One({ weight: "400", subsets: ["latin"], variable: "--font-deco", display: "swap" });

/* Labels, keys and the census: a condensed 1920s city sans. */
const shoulders = Big_Shoulders({ subsets: ["latin"], variable: "--font-sign", display: "swap", axes: ["opsz"], adjustFontFallback: false });

/* Numerals stamped into the switchboard's nickel plates. */
const stencil = Big_Shoulders_Stencil({ subsets: ["latin"], variable: "--font-stencil", display: "swap", weight: ["600", "700"], adjustFontFallback: false });

/* The evening paper's headlines: Alternate Gothic's descendant. */
const gothic = League_Gothic({ subsets: ["latin"], variable: "--font-head", display: "swap" });

/* The log, the directory, the conversations: a sturdy news text face. */
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-text", display: "swap", style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Halcyon Exchange",
  description:
    "Every call in the city of Halcyon passes through one switchboard. It is 1929, and the city never stops talking. A living city of a few hundred people, running in your browser, on your clock.",
  openGraph: {
    title: "Halcyon Exchange",
    description: "Every call in the city of Halcyon passes through one switchboard. It is 1929, and the city never stops talking.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a2226",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poiret.variable} ${shoulders.variable} ${stencil.variable} ${gothic.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
