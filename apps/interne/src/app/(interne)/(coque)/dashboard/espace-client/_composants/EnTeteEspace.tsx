"use client";

import { Pilules } from "@/ui/Bandeau";
import EnTeteSection from "../../EnTeteSection";
import { usePorte } from "./socle";

/*
 * Le bandeau de l'espace client vu de l'équipe (simplification du
 * 08/11/2026) : une seule page, sans menu à gauche. Ses trois vues — les
 * dossiers, les cartons du samedi, le SAV — sont des pilules dans la rangée
 * basse ; « Ouvrir un espace » est le bouton du bandeau. Les pièces à
 * fournir, le journal des messages et les réglages de l'espace client
 * vivent désormais dans Réglages.
 *
 * Le cadre de démonstration sans connexion garde son propre en-tête et ses
 * onglets (BackOffice) : rien n'est posé ici pour lui.
 */
export type VueEspace = "dossiers" | "cartons" | "sav";

const VUES: { vue: VueEspace; label: string; chemin: string; titre: string }[] = [
  { vue: "dossiers", label: "Dossiers", chemin: "", titre: "Espace client" },
  { vue: "cartons", label: "Cartons du samedi", chemin: "/cartons", titre: "Cartons du samedi" },
  { vue: "sav", label: "SAV", chemin: "/sav", titre: "SAV" },
];

export function EnTeteEspace({ vue }: { vue: VueEspace }) {
  const { racine, demo } = usePorte();
  if (demo) return null;
  const courante = VUES.find((v) => v.vue === vue)!;
  return (
    <EnTeteSection
      propre
      surtitre="Espace client"
      titre={courante.titre}
      texte="Les dossiers de vos clients, de la visite au SAV"
      action={{ label: "Ouvrir un espace", href: `${racine}/nouveau`, icone: "plus" }}
      bas={<Pilules label="Vues de l'espace client" items={VUES.map((v) => ({ href: `${racine}${v.chemin}`, label: v.label, actif: v.vue === vue }))} />}
    />
  );
}
