import type { Metadata } from "next";
import { jakarta } from "@/polices";
import "./globals.css";
import "./theme-fusion.css";
import "./crm.css";

/*
 * La mise en page racine de l'app interne : le CRM et les sections venues de
 * l'espace équipe (questionnaires, espace client vu de l'équipe, réglages)
 * sous une seule racine. Deux racines faisaient recharger la page entière à
 * chaque passage de l'une à l'autre (Next le fait de lui-même entre deux
 * racines) : la barre du haut et les onglets des dossiers disparaissaient puis
 * revenaient. La tablette et l'outil terrain gardent leur propre racine.
 *
 * Les deux feuilles cohabitent : celle de l'équipe (Tailwind et la feuille
 * commune) et celle du CRM, rangée dans la couche « base » de Tailwind
 * (crm.css) pour que les classes utilitaires des pages de l'équipe gardent
 * toujours le dernier mot.
 */
export const metadata: Metadata = {
  title: { default: "BaillyCRM", template: "%s — BaillyCRM" },
  description: "Le CRM métier de Bailly Déménagement",
  robots: { index: false, follow: false },
};

export default function RacineInterne({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-ink">{children}</body>
    </html>
  );
}
