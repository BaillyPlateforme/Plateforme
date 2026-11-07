/*
 * Les sections du CRM qui viennent de l'ancien espace équipe : les
 * questionnaires (leads, demandes…), l'espace client vu de l'équipe, et les
 * réglages. Leurs pages vivent sous /dashboard, dans la coque du CRM ; ce
 * fichier dit, pour chacune, son nom, ses onglets, et à quelle section une
 * adresse appartient — le rail, l'en-tête et les onglets s'en servent.
 */

export type Onglet = { href: string; label: string; /** Actif aussi sur les sous-pages. */ prefixe?: boolean };

export type Section = {
  cle: "questionnaires" | "espace-client" | "reglages";
  nom: string;
  accueil: string;
  onglets: Onglet[];
  /** Rangés derrière « Plus » : utiles, mais moins fréquents. */
  plus?: Onglet[];
};

export const SECTIONS: Section[] = [
  {
    cle: "questionnaires",
    nom: "Questionnaires",
    accueil: "/dashboard/tableau-de-bord",
    onglets: [
      { href: "/dashboard/tableau-de-bord", label: "Vue d'ensemble" },
      { href: "/dashboard/leads", label: "Suivi des leads" },
      { href: "/dashboard", label: "Demandes" },
      { href: "/dashboard/rappels", label: "Rappels" },
      { href: "/dashboard/statistiques", label: "Statistiques", prefixe: true },
      { href: "/dashboard/espaces-pro", label: "Espaces pro", prefixe: true },
      { href: "/dashboard/messagerie", label: "Messagerie" },
    ],
    plus: [
      { href: "/dashboard/devis", label: "Devis du site" },
      { href: "/dashboard/clients", label: "Clients du site", prefixe: true },
      { href: "/dashboard/agenda", label: "Agenda" },
      { href: "/dashboard/workflow", label: "Workflow" },
      { href: "/dashboard/simulateur", label: "Simulateur" },
      { href: "/dashboard/campagne", label: "Campagne de test" },
      { href: "/dashboard/playground", label: "Playground" },
    ],
  },
  {
    cle: "espace-client",
    nom: "Espace client",
    accueil: "/dashboard/espace-client",
    onglets: [
      { href: "/dashboard/espace-client", label: "Dossiers" },
      { href: "/dashboard/espace-client/nouveau", label: "Nouveau dossier" },
      { href: "/dashboard/espace-client/cartons", label: "Cartons du samedi" },
      { href: "/dashboard/espace-client/sav", label: "SAV" },
      { href: "/dashboard/espace-client/destinations", label: "Pièces par destination" },
      { href: "/dashboard/espace-client/journal", label: "Journal des messages" },
      { href: "/dashboard/espace-client/reglages", label: "Réglages" },
    ],
  },
  {
    cle: "reglages",
    nom: "Réglages",
    accueil: "/dashboard/parametres",
    onglets: [
      { href: "/dashboard/parametres", label: "Paramètres" },
      { href: "/dashboard/configuration", label: "Configuration" },
      { href: "/dashboard/equipe", label: "Équipe" },
    ],
  },
];

/** Les pages qui portent déjà leur propre bandeau : la section n'en ajoute pas. */
export const SANS_BANDEAU = new Set(["/dashboard/tableau-de-bord"]);

/** La section d'une adresse sous /dashboard, ou rien pour une page du CRM. */
export function sectionDe(chemin: string): Section | null {
  if (!chemin.startsWith("/dashboard")) return null;
  if (chemin.startsWith("/dashboard/espace-client")) return SECTIONS[1];
  if (["/dashboard/parametres", "/dashboard/configuration", "/dashboard/equipe"].some((p) => chemin.startsWith(p))) return SECTIONS[2];
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
