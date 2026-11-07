import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

// La famille de la marque : le site de Bailly compose en Roboto, titres en
// 600 et texte courant en 400. Une seule déclaration pour toute
// l'application — voir charte-graphique/README.md.
const roboto = Roboto({
  variable: "--font-rail",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bailly Déménagement",
  description: "Devis et pilotage — déménagement sur mesure.",
};

/**
 * Le thème est posé sur <html> avant la peinture : sans ce script, une page
 * en sombre s'afficherait d'abord en clair le temps que React démarre.
 *
 * Le sombre n'appartient qu'à l'espace équipe. Le choix est retenu dans le
 * navigateur : un membre de l'équipe qui l'avait activé voyait aussi le site
 * public et le formulaire de devis en sombre — et croyait à un défaut.
 */
const THEME = `(function(){try{if(location.pathname.indexOf("/dashboard")!==0)return;var t=localStorage.getItem("bailly-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${roboto.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="flex min-h-full flex-col font-sans text-ink">{children}</body>
    </html>
  );
}
