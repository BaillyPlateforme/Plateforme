"use client";

import EnTeteSection from "../../EnTeteSection";
import { usePorte } from "./socle";

/*
 * Le bandeau de l'espace client vu de l'équipe. Ses trois vues — les
 * dossiers, les cartons du samedi, le SAV — sont dans le menu de gauche de
 * la section (crm/sections.ts), jamais dans le bandeau (décision de David du
 * 08/11/2026) ; « Ouvrir un espace » est le bouton du bandeau. Les pièces à
 * fournir, le journal des messages et les réglages de l'espace client
 * vivent dans Réglages.
 *
 * Le cadre de démonstration sans connexion garde son propre en-tête et ses
 * onglets (BackOffice) : rien n'est posé ici pour lui.
 */
export type VueEspace = "dossiers" | "cartons" | "sav";

const TITRES: Record<VueEspace, string> = { dossiers: "Espace client", cartons: "Cartons du samedi", sav: "SAV" };

export function EnTeteEspace({ vue }: { vue: VueEspace }) {
  const { racine, demo } = usePorte();
  if (demo) return null;
  return (
    <EnTeteSection
      propre
      surtitre="Espace client"
      titre={TITRES[vue]}
      texte="Les dossiers de vos clients, de la visite au SAV"
      action={{ label: "Ouvrir un espace", href: `${racine}/nouveau`, icone: "plus" }}
    />
  );
}
