import type { NomIcone } from "@/ui/icones";

/*
 * Réglages (simplification du 08/11/2026, choix de David) : tout ce qui règle
 * l'outil, rangé dans UNE section, avec UN menu à gauche. Chaque page garde
 * son adresse (pages du CRM comme pages venues de l'espace équipe) ; ce
 * fichier est la seule liste : le menu, la vue d'ensemble (/reglages) et le
 * surtitre du bandeau (« Réglages · groupe ») en viennent.
 *
 * Les phrases reprennent celles que les pages portaient déjà (bandeau, en-tête
 * de section) ; aucune n'est nouvelle sauf mention contraire.
 */

export type PageReglage = {
  href: string;
  /** Le libellé du menu. */
  label: string;
  /** Le titre du bandeau, quand il diffère du libellé. */
  titre?: string;
  /** La phrase du bandeau et de la carte de la vue d'ensemble. */
  texte: string;
  icone: NomIcone;
};

export type GroupeReglages = { titre: string; pages: PageReglage[] };

export const GROUPES_REGLAGES: GroupeReglages[] = [
  {
    titre: "Entreprise",
    pages: [
      { href: "/dashboard/parametres", label: "Paramètres", texte: "Entreprise, devis, envois", icone: "reglages" },
      { href: "/dashboard/equipe", label: "Équipe", texte: "Profils et accès", icone: "equipe" },
      { href: "/dashboard/espaces-pro", label: "Espaces pro", texte: "Un lien et un parcours par entreprise", icone: "badge" },
    ],
  },
  {
    titre: "Documents",
    pages: [
      {
        href: "/devis/parametres",
        label: "Devis",
        titre: "Paramètres du devis",
        texte: "Ce que Bailly fournit une fois pour tous les devis : CGV, taux, formulations proposées à la saisie.",
        icone: "devis",
      },
      {
        href: "/dashboard/parametres/facturation",
        label: "Facturation",
        titre: "Mentions et conditions",
        texte: "Imprimées sur les factures et les avoirs dès qu'elles sont renseignées.",
        icone: "facture",
      },
      { href: "/modeles", label: "Courriers et SMS", texte: "Tous les messages de la plateforme, une carte par type d'action.", icone: "courrier" },
    ],
  },
  {
    titre: "Relances et alertes",
    pages: [
      // Phrases tirées des pages elles-mêmes (circuit d'une relance ; cartes « Qui reçoit quoi »).
      { href: "/relances/configuration", label: "Règles des relances", texte: "Délai, repère, nombre, canaux, jours et heures, exclusions.", icone: "horloge" },
      { href: "/relances/alertes", label: "Alertes de l'équipe", titre: "Alertes de l’équipe", texte: "Qui reçoit quoi : les destinataires, une alerte par événement, les abonnements.", icone: "cloche" },
    ],
  },
  {
    titre: "Espace client",
    pages: [
      { href: "/dashboard/espace-client/reglages", label: "Réglages", titre: "Réglages de l'espace client", texte: "Les conseillers présentés aux clients, les tutos et les services de l'espace.", icone: "dossierClient" },
      { href: "/dashboard/espace-client/destinations", label: "Pièces à fournir", texte: "Les pièces à fournir, par destination et par segment.", icone: "commande" },
      { href: "/dashboard/espace-client/journal", label: "Journal des messages", texte: "Chaque e-mail et chaque SMS, envoyé ou non, avec son aperçu.", icone: "questionnaires" },
    ],
  },
  {
    titre: "Outils",
    pages: [
      { href: "/dashboard/configuration", label: "Configuration", texte: "Grille, photos, analyse d'image, qualification", icone: "grille" },
      { href: "/dashboard/envois", label: "Envois et veille", texte: "Ce qui part vraiment, et la tâche de la veille", icone: "tendance" },
      { href: "/archives", label: "Archivage", texte: "Les dossiers clos, terminés ou perdus : rangés à part, consultables et restaurables.", icone: "archive" },
      { href: "/dashboard/simulateur", label: "Simulateur", titre: "Simulateur de chiffrage", texte: "Le moteur qui chiffre les demandes, en direct", icone: "euro" },
      { href: "/dashboard/campagne", label: "Campagne de test", texte: "Tirer des devis au hasard et vérifier ce que la grille produit", icone: "etoile" },
      { href: "/dashboard/playground", label: "Playground", titre: "Playground & Lab", texte: "Analyse d'image et chaîne complète, en test", icone: "copilote" },
    ],
  },
];

/** Toutes les pages de Réglages, dans l'ordre du menu. */
export const PAGES_REGLAGES: PageReglage[] = GROUPES_REGLAGES.flatMap((g) => g.pages);

/**
 * La page de Réglages d'une adresse, et son groupe : celle dont l'adresse est
 * le plus long préfixe (/dashboard/parametres/facturation relève de
 * Facturation, pas de Paramètres). Rien pour la vue d'ensemble.
 */
export function pageReglageDe(chemin: string): { groupe: GroupeReglages; page: PageReglage } | null {
  let trouve: { groupe: GroupeReglages; page: PageReglage } | null = null;
  for (const groupe of GROUPES_REGLAGES)
    for (const page of groupe.pages)
      if ((chemin === page.href || chemin.startsWith(`${page.href}/`)) && (!trouve || page.href.length > trouve.page.href.length)) trouve = { groupe, page };
  return trouve;
}

/** Le surtitre du bandeau d'une page de Réglages : « Réglages · groupe ». */
export function surtitreReglages(chemin: string): string {
  const r = pageReglageDe(chemin);
  return r ? `Réglages · ${r.groupe.titre}` : "Réglages";
}
