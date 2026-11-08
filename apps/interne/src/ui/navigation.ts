import type { NomIcone } from "./icones";

/*
 * Le menu de l'app interne : un seul pour le CRM et pour les sections venues
 * de l'espace équipe. Les rubriques du CRM vivent à la racine ; les sections
 * « Questionnaires », « Espace client » et « Réglages », sous /dashboard.
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
/** Les adresses de la section Réglages (crm/sections.ts, ADRESSES_REGLAGES). */
const REGLAGES_ADRESSES = ["/dashboard/parametres", "/dashboard/configuration", "/dashboard/equipe", "/dashboard/envois"];
const questionnaires = (c: string) =>
  c.startsWith("/dashboard") &&
  !c.startsWith("/dashboard/espace-client") &&
  !REGLAGES_ADRESSES.some((p) => c.startsWith(p));

export const GROUPES: Groupe[] = [
  {
    titre: "Accueil",
    entrees: [
      { href: "/", label: "Pilotage", icone: "bord", actif: (c) => c === "/" },
      { href: "/tableau-de-bord", label: "Tableau de bord", icone: "accueil" },
      { href: "/copilote", label: "Copilote", icone: "copilote" },
    ],
  },
  {
    titre: "Site et leads",
    entrees: [
      { href: "/dashboard/tableau-de-bord", label: "Questionnaires", icone: "questionnaires", actif: questionnaires, compteur: "nouvelles" },
      { href: "/dashboard/espace-client", label: "Espace client", icone: "dossierClient", actif: sous("/dashboard/espace-client") },
    ],
  },
  {
    titre: "Commercial",
    entrees: [
      { href: "/planning", label: "Planning commercial", icone: "calendrier" },
      { href: "/visites", label: "Visites techniques", icone: "oeil" },
      { href: "/dossiers", label: "Clients et dossiers", icone: "clients" },
      { href: "/kanban", label: "Kanban", icone: "kanban" },
      { href: "/parcours", label: "Parcours", icone: "parcours" },
      { href: "/devis", label: "Devis", icone: "devis" },
      { href: "/factures", label: "Factures", icone: "facture" },
      { href: "/relances", label: "Relances", icone: "horloge" },
    ],
  },
  {
    titre: "Exploitation",
    entrees: [
      { href: "/commandes", label: "Commandes", icone: "commande" },
      { href: "/exploitation", label: "Planning d'exploitation", icone: "grille" },
      { href: "/lettres-de-voiture", label: "Lettres de voiture", icone: "camion" },
      { href: "/garde-meuble", label: "Garde-meuble", icone: "entrepot" },
      { href: "/conteneurs", label: "Conteneurs", icone: "bateau", actif: (c) => sous("/conteneurs")(c) && !sous("/conteneurs/dispatch")(c) },
      { href: "/conteneurs/dispatch", label: "Dispatch international", icone: "dispatch" },
      // Les comptes des déménageurs pour l'outil terrain (/terrain).
      { href: "/demenageurs", label: "Déménageurs", icone: "badge" },
    ],
  },
  {
    titre: "Réglages",
    entrees: [
      { href: "/modeles", label: "Courriers et SMS", icone: "courrier" },
      {
        href: "/dashboard/parametres",
        label: "Paramètres",
        icone: "reglages",
        actif: (c) => REGLAGES_ADRESSES.some((p) => c.startsWith(p)),
      },
    ],
  },
];

/** Les paramètres : la dernière page de « Réglages ». */
export const REGLAGES: Entree = GROUPES[GROUPES.length - 1].entrees[GROUPES[GROUPES.length - 1].entrees.length - 1];

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
 * dossier (exigence de David). La fiche et le parcours s'ouvrent sur lui, les
 * listes (devis, factures, relances, Kanban) se filtrent sur lui.
 */
export function hrefPour(e: Entree, dossier: number | null): string {
  if (!dossier) return e.href;
  if (e.href === "/dossiers") return `/dossiers/${dossier}`;
  if (e.href === "/parcours") return `/parcours/${dossier}`;
  if (["/devis", "/factures", "/relances", "/kanban"].includes(e.href)) return `${e.href}?dossier=${dossier}`;
  return e.href;
}
