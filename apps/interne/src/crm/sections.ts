/*
 * Les sections du CRM qui viennent de l'ancien espace équipe : les
 * demandes du site, l'espace client vu de l'équipe, et les réglages. Leurs pages vivent sous /dashboard, dans la coque du CRM ; ce
 * fichier dit, pour chacune, son nom, ses onglets, et à quelle section une
 * adresse appartient — le rail, l'en-tête et les onglets s'en servent.
 */

import { ADRESSES_REGLAGES } from "@/ui/navigation";
import { PAGES_REGLAGES } from "./reglages/pages";

export type Onglet = { href: string; label: string; /** Actif aussi sur les sous-pages. */ prefixe?: boolean };

export type Section = {
  cle: "demandes" | "espace-client" | "reglages";
  nom: string;
  accueil: string;
  /** Le menu vertical de la section ; vide : pas de menu, la page prend toute la largeur. */
  onglets: Onglet[];
  /** Rangés derrière « Plus » : utiles, mais moins fréquents. */
  plus?: Onglet[];
};

/*
 * Simplification du 08/11/2026 : les demandes et l'espace client n'ont plus
 * de sous-onglets (leurs vues sont des filtres dans le bandeau) ; tout ce qui
 * règle l'outil est dans Réglages, un seul menu vertical.
 */
export const SECTIONS: Section[] = [
  { cle: "demandes", nom: "Demandes", accueil: "/dashboard", onglets: [] },
  { cle: "espace-client", nom: "Espace client", accueil: "/dashboard/espace-client", onglets: [] },
  {
    cle: "reglages",
    nom: "Réglages",
    accueil: "/reglages",
    // Toutes les pages de Réglages, du CRM comme de l'espace équipe ; le menu les range en groupes (MenuReglages).
    onglets: PAGES_REGLAGES.map((p) => ({ href: p.href, label: p.label })),
  },
];

/** Les adresses de Réglages : la liste de la navigation, seule source. */
export { ADRESSES_REGLAGES };

/**
 * Les pages qui posent elles-mêmes l'en-tête de la section (bandeau puis
 * onglets), avec leur propre contenu : la vue d'ensemble et ses chiffres, la
 * fiche d'une demande, la fiche d'un dossier client. La mise en page des
 * sections ne le pose pas pour elles.
 */
export function aEnTetePropre(chemin: string): boolean {
  return (
    chemin === "/dashboard/tableau-de-bord" ||
    /^\/dashboard\/[0-9a-f]{8}-[0-9a-f-]{27,}\/?$/.test(chemin) ||
    chemin.startsWith("/dashboard/espace-client/dossiers/")
  );
}

/** La section d'une adresse sous /dashboard, ou rien pour une page du CRM. */
export function sectionDe(chemin: string): Section | null {
  if (!chemin.startsWith("/dashboard")) return null;
  if (ADRESSES_REGLAGES.some((p) => chemin === p || chemin.startsWith(`${p}/`))) return SECTIONS[2];
  if (chemin.startsWith("/dashboard/espace-client")) return SECTIONS[1];
  return SECTIONS[0];
}

/** L'onglet actif : l'adresse exacte, ou un préfixe pour les onglets qui ont des sous-pages. */
export function ongletActif(o: Onglet, chemin: string): boolean {
  if (chemin === o.href) return true;
  if (o.prefixe && chemin.startsWith(`${o.href}/`)) return true;
  // La fiche d'une demande (/dashboard/<uuid>) et les vues Kanban et Focus relèvent des Demandes.
  if (o.href === "/dashboard") return /^\/dashboard\/([0-9a-f-]{8,}|kanban|focus)(\/|$)/.test(chemin);
  // La fiche d'un dossier client relève des Dossiers.
  if (o.href === "/dashboard/espace-client") return chemin.startsWith("/dashboard/espace-client/dossiers/");
  return false;
}
