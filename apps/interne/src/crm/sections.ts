/*
 * Les sections du CRM qui viennent de l'ancien espace équipe : les pages des
 * demandes du site (dans le Parcours), l'espace client vu de l'équipe, et les
 * réglages. Leurs pages vivent sous /dashboard, dans la coque du CRM ; ce
 * fichier dit, pour chacune, son nom, ses onglets, et à quelle section une
 * adresse appartient — le rail, l'en-tête et les onglets s'en servent.
 */

import { ADRESSES_REGLAGES } from "@/ui/navigation";
import { PAGES_REGLAGES } from "./reglages/pages";

export type Onglet = { href: string; label: string; /** Actif aussi sur les sous-pages. */ prefixe?: boolean };

export type Section = {
  cle: "parcours" | "espace-client" | "reglages";
  nom: string;
  accueil: string;
  /** Le menu vertical de la section ; vide : pas de menu, la page prend toute la largeur. */
  onglets: Onglet[];
  /** Rangés derrière « Plus » : utiles, mais moins fréquents. */
  plus?: Onglet[];
};

/*
 * Les vues d'une page vont dans le menu vertical à gauche, jamais dans le
 * bandeau (décision de David du 08/11/2026) ; le bandeau ne garde que les
 * filtres. Celles de l'espace client sont trois pages : les dossiers, les
 * cartons du samedi et le SAV. Tout ce qui règle l'outil est dans Réglages,
 * un seul menu vertical.
 *
 * Les demandes du site n'ont plus de section à elles (unification du
 * 08/11/2026) : leur liste et ses vues sont dans le Parcours (/parcours,
 * Analyse des demandes) ; restent sous /dashboard la page d'une demande et
 * l'historique d'un client, pleine largeur comme la page d'un dossier — sans
 * menu de gauche.
 */
export const SECTIONS: Section[] = [
  {
    cle: "parcours",
    nom: "Parcours",
    accueil: "/parcours",
    onglets: [],
  },
  {
    cle: "espace-client",
    nom: "Espace client",
    accueil: "/dashboard/espace-client",
    onglets: [
      { href: "/dashboard/espace-client", label: "Dossiers" },
      { href: "/dashboard/espace-client/cartons", label: "Cartons du samedi" },
      { href: "/dashboard/espace-client/sav", label: "SAV" },
    ],
  },
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
  // La fiche d'un dossier client relève des Dossiers.
  if (o.href === "/dashboard/espace-client") return chemin.startsWith("/dashboard/espace-client/dossiers/");
  return false;
}

/**
 * L'onglet actif d'une section, compte tenu de la vue demandée : un onglet
 * qui nomme une vue de sa page (« /page?vue=… ») l'emporte quand l'adresse
 * est la sienne ; sinon, l'onglet de l'adresse, s'il y en a un.
 */
export function ongletActifDe(section: Section, chemin: string, vue: string | null): Onglet | undefined {
  const onglets = [...section.onglets, ...(section.plus ?? [])];
  const parVue = onglets.find((o) => {
    const [base, recherche] = o.href.split("?");
    return recherche !== undefined && base === chemin && new URLSearchParams(recherche).get("vue") === vue;
  });
  return parVue ?? onglets.find((o) => !o.href.includes("?") && ongletActif(o, chemin));
}
