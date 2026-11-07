import type { Metadata } from "next";
import { jakarta } from "@/polices";
import "./globals.css";
import "./theme-fusion.css";

/*
 * La mise en page racine des sections issues de l'espace équipe : les
 * questionnaires, l'espace client vu de l'équipe, les réglages. Elles vivent
 * à côté du CRM (qui a sa propre racine et sa propre feuille), dans le même
 * design : la police et la palette « Fusion », et la même coque (menu,
 * barre du haut), posée par dashboard/layout.tsx.
 */
export const metadata: Metadata = {
  title: { default: "BaillyCRM", template: "%s — BaillyCRM" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-ink">{children}</body>
    </html>
  );
}
