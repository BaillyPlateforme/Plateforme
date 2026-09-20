import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

// Une seule famille, une seule déclaration : deux instances de Poppins
// faisaient charger deux fois les mêmes fichiers de fonte.
const poppins = Poppins({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Le rail a sa propre voix : une grotesque plus étroite et plus neutre que le
// Poppins de l'application, qui tient mieux une colonne de libellés courts.
const rail = Inter({
  variable: "--font-rail",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
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
      className={`${poppins.variable} ${rail.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
