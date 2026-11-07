/*
 * Les formes du dispatch des conteneurs, partagées par le serveur et les
 * composants du navigateur. Les dates voyagent en chaînes ISO : un composant
 * client les reçoit telles quelles, sans dépendre du fuseau du serveur.
 */

/** Ce que représente une colonne du Kanban. */
export type Genre = "conteneur" | "tournee" | "date" | "zone";
export type Taille = "20" | "40";

export const GENRES: Record<Genre, { nom: string; un: string; feuille: string }> = {
  conteneur: { nom: "Conteneur", un: "un conteneur", feuille: "Feuille de conteneur" },
  tournee: { nom: "Tournée", un: "une tournée", feuille: "Feuille de tournée" },
  date: { nom: "Date", un: "une date", feuille: "Feuille du jour" },
  zone: { nom: "Zone", un: "une zone", feuille: "Feuille de zone" },
};

export interface Ligne {
  id: number;
  colonneId: number | null;
  rang: number;
  client: string;
  ville: string | null;
  pays: string | null;
  volume: number;
  remarques: string | null;
  telephone: string | null;
  dossierId: number | null;
  dossierRef: string | null;
}

export interface Colonne {
  id: number;
  genre: Genre;
  libelle: string;
  taille: Taille | null;
  /** En m³ ; null : sans limite de volume. */
  capacite: number | null;
  zone: string | null;
  /** Date de départ, de tournée ou du jour (AAAA-MM-JJ). */
  jour: string | null;
  conteneurId: number | null;
  conteneur: { numero: string; statut: string; destination: string } | null;
  ordre: number;
  verrouilleeLe: string | null;
  verrouilleePar: string | null;
}

export interface Evenement {
  id: number;
  action: string;
  libelle: string;
  quand: string;
  qui: string | null;
  initiales: string | null;
  ligneId: number | null;
  colonneId: number | null;
}

/** Ce que le dispatcheur demande à la proposition de regroupement. */
export interface Parametres {
  methode: "ia" | "regles";
  /** Ce que l'on regroupe : en conteneurs, ou en tournées de livraison. */
  mode: "conteneur" | "tournee";
  /** Les clients que la proposition peut placer : ceux à répartir, ou aussi ceux des colonnes non verrouillées. */
  repartir: "non_places" | "tout";
  garderColonnes: boolean;
  nouvellesColonnes: boolean;
  capacite20: number;
  capacite40: number;
  /** Volume maximal d'une tournée (m³), facultatif. */
  capaciteTournee: number | null;
  contraintes: string;
}

export interface ColonneProposee {
  /** « c12 » : la colonne 12 existante ; « n1 », « n2 »… : une colonne à créer. */
  ref: string;
  colonneId: number | null;
  genre: Genre;
  libelle: string;
  taille: Taille | null;
  capacite: number | null;
  zone: string | null;
  /** Les clients placés, dans l'ordre. */
  lignes: number[];
  raison: string;
}

export interface ContenuProposition {
  resume: string;
  colonnes: ColonneProposee[];
  nonAffectees: { ligne: number; raison: string }[];
  alertes: string[];
}

export interface Proposition extends ContenuProposition {
  id: number;
  methode: "ia" | "regles";
  modele: string | null;
  /** Pourquoi les règles simples ont pris le relais de l'IA ; null si l'IA a répondu, ou si les règles ont été choisies. */
  repli: string | null;
  dureeMs: number | null;
  statut: "proposee" | "appliquee" | "ecartee";
  creeLe: string;
  parametres: Parametres;
}

export interface Plan {
  id: number;
  nom: string;
  sens: "export" | "import";
  port: string | null;
  dateReference: string | null;
  notes: string | null;
  capacite20: number;
  capacite40: number;
  demo: boolean;
  creeLe: string;
  majLe: string;
  colonnes: Colonne[];
  lignes: Ligne[];
  historique: Evenement[];
  proposition: Proposition | null;
}

export interface ConteneurCrm {
  id: number;
  numero: string;
  destination: string;
  taille: string;
  capacite: number;
  statut: string;
  departPrevu: string | null;
}

export interface DossierOption {
  id: number;
  ref: string;
  nom: string;
  arrivee: string | null;
}

/** Une ligne telle que l'import l'envoie : des chaînes, revalidées par le serveur. */
export interface LigneSaisie {
  client: string;
  ville: string;
  pays: string;
  volume: string;
  remarques: string;
  dossier: string;
  telephone: string;
}

export type Resultat<T = void> = { ok: true; donnees?: T } | { ok: false; erreur: string };
