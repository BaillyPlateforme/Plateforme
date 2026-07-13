import type { Metadata } from "next";
import { Cormorant_Garamond, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Display : serif élégante haut de gamme (esprit Magnolia).
const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// UI / corps : grotesque neutre et lisible.
const sans = Hanken_Grotesk({
  variable: "--font-sans-ui",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bailly Déménagement",
  description: "Devis et pilotage — déménagement sur mesure.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
