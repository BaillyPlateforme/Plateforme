import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Une seule famille dans toute l'application, celle de la maquette : une
// grotesque géométrique, large et ronde, qui tient aussi bien un libellé de
// menu qu'un grand nombre.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-rail",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bailly Déménagement",
  description: "Devis et pilotage — déménagement sur mesure.",
};

/**
 * Le thème est posé sur <html> avant la peinture : sans ce script, une page
 * en sombre s'afficherait d'abord en clair le temps que React démarre.
 */
const THEME = `(function(){try{var t=localStorage.getItem("bailly-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="flex min-h-full flex-col font-sans text-ink">{children}</body>
    </html>
  );
}
