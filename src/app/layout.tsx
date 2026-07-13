import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Display : grotesque contemporaine à caractère, pour les titres.
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// UI / corps : grotesque neutre et précise.
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
