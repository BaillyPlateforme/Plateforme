import type { NomIcone } from "./icones";

/*
 * Le menu de l'app interne : un seul pour le CRM et pour les sections venues
 * de l'espace équipe (sous /dashboard : demandes, espace client, une partie
 * des réglages).
 */

export type Entree = {
  href: string;
  label: string;
  icone: NomIcone;
  /** Quand l'entrée est-elle la page courante ? Par défaut : l'adresse ou ses sous-pages. */
  actif?: (chemin: string) => boolean;
  /** Une pastille de compte (demandes nouvelles…), remplie par la coque. */
  compteur?: "nouvelles";
};

export type Groupe = { titre: string; entrees: Entree[] };

const sous = (href: string) => (c: string) => c === href || c.startsWith(`${href}/`);

/*
 * La simplification du 08/11/2026 (choix de David) : quatre rubriques et les
 * réglages, le Parcours au centre, plus de doublons. Chaque adresse ancienne
 * mène à sa page nouvelle (redirections dans les pages) ; les adresses
 * ci-dessous ne servent qu'à allumer la bonne entrée.
 */

/** Tout ce qui règle l'outil, rangé dans Réglages (une page, menu à gauche), quelle que soit son adresse. */
export const ADRESSES_REGLAGES = [
  "/reglages",
  "/dashboard/parametres",
  "/dashboard/configuration",
  "/dashboard/equipe",
  "/dashboard/envois",
  "/dashboard/espaces-pro",
  "/dashboard/simulateur",
  "/dashboard/campagne",
  "/dashboard/playground",
  "/dashboard/espace-client/reglages",
  "/dashboard/espace-client/destinations",
  "/dashboard/espace-client/journal",
  "/modeles",
  "/archives",
  "/devis/parametres",
  "/relances/configuration",
  "/relances/alertes",
];
const reglage = (c: string) => ADRESSES_REGLAGES.some((p) => sous(p)(c));
/**
 * Les pages des demandes du site (l'ancienne section Questionnaires, puis
 * « Demandes ») : la page d'une demande, l'historique d'un client, et les
 * anciennes adresses de la liste et de ses vues (/dashboard, rappels,
 * focus…), qui mènent au Parcours. Hors espace client, accueil et réglages.
 */
const demandes = (c: string) => sous("/dashboard")(c) && !sous("/dashboard/espace-client")(c) && !sous("/dashboard/tableau-de-bord")(c) && !reglage(c);

export const GROUPES: Groupe[] = [
  {
    titre: "Accueil",
    entrees: [
      // Pilotage, tableau du jour et vue d'ensemble des demandes : une seule page.
      { href: "/", label: "Accueil", icone: "bord", actif: (c) => c === "/" || sous("/tableau-de-bord")(c) || sous("/dashboard/tableau-de-bord")(c) },
      // Commerciales et exploitation ; celles des demandes du site sont dans Parcours › Analyse des demandes.
      { href: "/statistiques", label: "Statistiques", icone: "stats", actif: (c) => sous("/statistiques")(c) && !sous("/statistiques/demandes")(c) },
      { href: "/copilote", label: "Copilote", icone: "copilote" },
    ],
  },
  {
    titre: "Dossiers",
    entrees: [
      // Le Parcours, un seul (unification du 08/11/2026) : de la demande du site à la facture — le tableau, la
      // liste et l'analyse des demandes —, chaque dossier, et chaque demande, sa première étape.
      {
        href: "/parcours",
        label: "Parcours",
        icone: "parcours",
        actif: (c) => sous("/parcours")(c) || sous("/dossiers")(c) || sous("/kanban")(c) || sous("/commandes")(c) || sous("/statistiques/demandes")(c) || demandes(c),
        compteur: "nouvelles",
      },
      // Rendez-vous commerciaux et visites techniques : un seul planning.
      { href: "/planning", label: "Planning", icone: "calendrier", actif: (c) => sous("/planning")(c) || sous("/visites")(c) },
      { href: "/devis", label: "Devis", icone: "devis", actif: (c) => sous("/devis")(c) && !reglage(c) },
      { href: "/factures", label: "Factures", icone: "facture" },
      { href: "/relances", label: "Relances", icone: "horloge", actif: (c) => sous("/relances")(c) && !reglage(c) },
    ],
  },
  {
    titre: "Exploitation",
    entrees: [
      { href: "/exploitation", label: "Planning", icone: "grille" },
      { href: "/lettres-de-voiture", label: "Lettres de voiture", icone: "camion" },
      { href: "/garde-meuble", label: "Garde-meuble", icone: "entrepot" },
      // Le dispatch international est un onglet des conteneurs.
      { href: "/conteneurs", label: "Conteneurs", icone: "bateau" },
      // Déménageurs (outil terrain) et sous-traitants : un seul annuaire.
      {
        href: "/partenaires",
        label: "Partenaires",
        icone: "partenaires",
        actif: (c) => sous("/partenaires")(c) || sous("/demenageurs")(c) || sous("/sous-traitants")(c),
      },
      { href: "/litiges", label: "Litiges", icone: "litige" },
    ],
  },
  {
    titre: "Espace client",
    entrees: [
      { href: "/dashboard/espace-client", label: "Espace client", icone: "dossierClient", actif: (c) => sous("/dashboard/espace-client")(c) && !reglage(c) },
    ],
  },
  {
    // Tout ce qui se fait, au fil du temps : les clients, l'équipe, les envois (demande de David, 08/11/2026).
    titre: "Feed",
    entrees: [{ href: "/feed", label: "Feed", icone: "fil" }],
  },
  {
    titre: "Réglages",
    entrees: [{ href: "/reglages", label: "Réglages", icone: "reglages", actif: reglage }],
  },
];

/** Les réglages : l'entrée unique de la rubrique « Réglages ». */
export const REGLAGES: Entree = GROUPES[GROUPES.length - 1].entrees[0];

/** La rubrique de la page courante (celle dont une page est active), « Accueil » à défaut. */
export function groupeDe(chemin: string): Groupe {
  return GROUPES.find((g) => g.entrees.some((e) => estActif(e, chemin))) ?? GROUPES[0];
}

export function estActif(e: Entree, chemin: string) {
  return e.actif ? e.actif(chemin) : sous(e.href)(chemin);
}

/**
 * Le dossier ouvert : celui de l'adresse (sa fiche, un devis, son parcours),
 * sinon celui du filtre `?dossier=` d'une liste. Rien hors d'un dossier.
 */
export function dossierDe(chemin: string, filtre?: string | null): number | null {
  const m = chemin.match(/^\/(?:dossiers|parcours)\/(\d+)/);
  if (m) return Number(m[1]);
  return filtre && /^\d+$/.test(filtre) ? Number(filtre) : null;
}

/**
 * L'adresse d'une page du menu quand un dossier est ouvert : on reste sur ce
 * dossier (exigence de David). Le Parcours s'ouvre sur sa page, les listes
 * (devis, factures, relances) se filtrent sur lui.
 */
export function hrefPour(e: Entree, dossier: number | null, chemin = ""): string {
  if (!dossier) return e.href;
  // Le Parcours d'un dossier, c'est sa page ; depuis cette page même, « Parcours » ramène à tous les dossiers.
  if (e.href === "/parcours") return chemin.startsWith(`/dossiers/${dossier}`) ? "/parcours" : `/dossiers/${dossier}`;
  if (["/devis", "/factures", "/relances"].includes(e.href)) return `${e.href}?dossier=${dossier}`;
  return e.href;
}
