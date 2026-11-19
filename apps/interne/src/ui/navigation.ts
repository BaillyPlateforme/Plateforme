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

export type Groupe = {
  titre: string;
  entrees: Entree[];
  /** Une rubrique hors de la barre du haut (Réglages, ouverts depuis le menu du compte) : elle n'allume que la sous-barre de ses pages. */
  horsBarre?: boolean;
};

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
 * Les pages des demandes du site (l'ancienne section Questionnaires) : leurs
 * vues (/demandes), la page d'une demande et l'historique d'un client (sous
 * /dashboard), et les anciennes adresses de la liste et de ses vues
 * (/dashboard, rappels, focus…, /statistiques/demandes), qui mènent à
 * Demandes. Hors espace client, accueil et réglages.
 */
const demandes = (c: string) =>
  sous("/demandes")(c) || sous("/statistiques/demandes")(c) || (sous("/dashboard")(c) && !sous("/dashboard/espace-client")(c) && !sous("/dashboard/tableau-de-bord")(c) && !reglage(c));

export const GROUPES: Groupe[] = [
  {
    titre: "Accueil",
    entrees: [
      // Pilotage, tableau du jour et vue d'ensemble des demandes : une seule page.
      { href: "/", label: "Accueil", icone: "bord", actif: (c) => c === "/" || sous("/tableau-de-bord")(c) || sous("/dashboard/tableau-de-bord")(c) },
      { href: "/a-la-une", label: "À la une", icone: "etoile" },
      // Commerciales et exploitation ; celles des demandes du site sont dans Demandes › Statistiques.
      { href: "/statistiques", label: "Statistiques", icone: "stats", actif: (c) => sous("/statistiques")(c) && !sous("/statistiques/demandes")(c) },
      { href: "/copilote", label: "Copilote", icone: "copilote" },
      // Tout ce qui se fait, au fil du temps : les clients, l'équipe, les envois (demande de David, 08/11/2026) ; dans l'Accueil depuis le 19/11.
      { href: "/feed", label: "Feed", icone: "fil" },
    ],
  },
  {
    // Les demandes du site, de près (demande de David, 08/11/2026) : le Kanban de leurs étapes détaillées jusqu'au
    // dossier, leur Feed, Top demandes, et leur analyse ; chaque demande (sa page, sous /dashboard). Une rubrique de
    // la barre du haut depuis le 19/11/2026 (David : « mets demandes en haut »).
    titre: "Demandes",
    entrees: [{ href: "/demandes", label: "Demandes", icone: "questionnaires", actif: demandes, compteur: "nouvelles" }],
  },
  {
    titre: "Dossiers",
    entrees: [
      // Le Parcours : de la demande du site à la facture (Tableau et Liste), et chaque dossier.
      {
        href: "/parcours",
        label: "Parcours",
        icone: "parcours",
        actif: (c) => sous("/parcours")(c) || sous("/dossiers")(c) || sous("/kanban")(c) || sous("/commandes")(c),
      },
      // Rendez-vous commerciaux et visites techniques : un seul planning.
      { href: "/planning", label: "Planning", icone: "calendrier", actif: (c) => sous("/planning")(c) || sous("/visites")(c) },
      { href: "/devis", label: "Devis", icone: "devis", actif: (c) => sous("/devis")(c) && !reglage(c) },
      { href: "/factures", label: "Factures", icone: "facture" },
      { href: "/relances", label: "Relances", icone: "horloge", actif: (c) => sous("/relances")(c) && !reglage(c) },
    ],
  },
  {
    // Les clients, pour eux-mêmes : la liste et la fiche de chacun, tous ses dossiers (demande de David, 08/11/2026),
    // et leur espace client, réunis dans une rubrique le 19/11/2026 (David : « regroupe client et espace client »).
    titre: "Clients",
    entrees: [
      { href: "/clients", label: "Clients", icone: "clients" },
      { href: "/dashboard/espace-client", label: "Espace client", icone: "dossierClient", actif: (c) => sous("/dashboard/espace-client")(c) && !reglage(c) },
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
    // Hors de la barre depuis le 19/11/2026 (David : « réglage ne sert à rien » en haut) : on les ouvre depuis le menu
    // du compte ; sur une page de réglage, la sous-barre les rappelle.
    titre: "Réglages",
    horsBarre: true,
    entrees: [{ href: "/reglages", label: "Réglages", icone: "reglages", actif: reglage }],
  },
];

/** Les rubriques de la barre du haut. */
export const enBarre = (groupes: Groupe[]) => groupes.filter((g) => !g.horsBarre);

/** Les réglages : l'entrée unique de la rubrique « Réglages ». */
export const REGLAGES: Entree = GROUPES.find((g) => g.titre === "Réglages")!.entrees[0];

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
