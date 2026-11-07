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
const questionnaires = (c: string) =>
  c.startsWith("/dashboard") &&
  !c.startsWith("/dashboard/espace-client") &&
  !["/dashboard/parametres", "/dashboard/configuration", "/dashboard/equipe"].some((p) => c.startsWith(p));

export const GROUPES: Groupe[] = [
  {
    titre: "Accueil",
    entrees: [
      { href: "/", label: "Tableau de bord", icone: "accueil", actif: (c) => c === "/" },
      { href: "/tableau-de-bord", label: "Pilotage", icone: "bord" },
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
      { href: "/devis", label: "Devis", icone: "devis" },
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
    titre: "Gestion",
    entrees: [
      { href: "/factures", label: "Factures", icone: "facture" },
      { href: "/modeles", label: "Courriers et SMS", icone: "courrier" },
      {
        href: "/dashboard/parametres",
        label: "Réglages",
        icone: "reglages",
        actif: (c) => ["/dashboard/parametres", "/dashboard/configuration", "/dashboard/equipe"].some((p) => c.startsWith(p)),
      },
    ],
  },
];

/** Les réglages : la dernière page de « Gestion ». */
export const REGLAGES: Entree = GROUPES[GROUPES.length - 1].entrees[GROUPES[GROUPES.length - 1].entrees.length - 1];

/** La rubrique de la page courante (celle dont une page est active), « Accueil » à défaut. */
export function groupeDe(chemin: string): Groupe {
  return GROUPES.find((g) => g.entrees.some((e) => estActif(e, chemin))) ?? GROUPES[0];
}

export function estActif(e: Entree, chemin: string) {
  return e.actif ? e.actif(chemin) : sous(e.href)(chemin);
}
