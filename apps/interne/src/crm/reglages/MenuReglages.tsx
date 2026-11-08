"use client";

import { usePathname } from "next/navigation";
import MenuVertical from "@/ui/MenuVertical";
import { GROUPES_REGLAGES, pageReglageDe } from "./pages";

/*
 * Le menu de Réglages, à gauche de chaque page de réglage, qu'elle soit du
 * CRM (/modeles, /archives, /devis/parametres, /relances/configuration…) ou
 * venue de l'espace équipe (/dashboard/parametres…) : le même partout. La
 * page active est celle de l'adresse ; aucune sur la vue d'ensemble.
 */
export default function MenuReglages() {
  const chemin = usePathname();
  const active = pageReglageDe(chemin)?.page.href;
  return (
    <MenuVertical
      titre="Réglages"
      dense
      groupes={GROUPES_REGLAGES.map((g) => ({
        titre: g.titre,
        items: g.pages.map((p) => ({ href: p.href, label: p.label, icone: p.icone, actif: p.href === active })),
      }))}
    />
  );
}
