import type { CleEtapeDemande } from "@/crm/kanban/etapes";

/*
 * Ce que le Copilote échange avec la page : les éléments du CRM qu'un outil a
 * lus (dossiers, devis, rendez-vous, demandes, chiffres), sous une forme que
 * la page sait mettre en cartes, et les événements du flux de la réponse.
 *
 * Le modèle ne recopie pas ces éléments : il les désigne par leur clé
 * (« [[dossier:12]] »), et la page affiche la carte correspondante. Une clé
 * qu'aucun outil n'a renvoyée n'affiche rien : le Copilote ne peut montrer
 * que ce que le CRM lui a donné.
 *
 * Module pur : le serveur le remplit, le navigateur le lit.
 */

/** Ce qu'il faut faire maintenant sur un dossier (src/crm/parcours/prochaine.ts), et la page qui le fait. */
export type ProchaineEtape = {
  titre: string;
  detail: string;
  ton: "faire" | "attendre" | "fini" | "perdu";
  action: { label: string; href: string } | null;
};

export type EntiteDossier = {
  genre: "dossier";
  cle: string;
  id: number;
  ref: string;
  client: string;
  /** particulier, compte, militaire… */
  segment: string | null;
  statut: string;
  depart: string | null;
  arrivee: string | null;
  /** AAAA-MM-JJ. */
  chargement: string | null;
  volume: number | null;
  commercial: string | null;
  /** Le devis signé, sinon le dernier envoyé. */
  montant: number | null;
  prochaine: ProchaineEtape | null;
  /** La fiche complète, quand l'outil « dossier » l'a lue. */
  fiche?: {
    telephone: string | null;
    email: string | null;
    periode: string | null;
    observations: string | null;
    devis: { numero: string; formule: string; montant: number; statut: string; envoyeLe: string | null; signeLe: string | null }[];
    rdv: { type: string; titre: string; debut: string; commercial: string }[];
    argent: { du: number; encaisse: number; reste: number };
    activite: { quoi: string; quand: string; qui: string | null }[];
  };
};

export type EntiteDevis = {
  genre: "devis";
  cle: string;
  id: number;
  dossierId: number;
  ref: string;
  client: string;
  numero: string;
  formule: string;
  montant: number;
  envoyeLe: string | null;
  /** Jours sans réponse. */
  jours: number;
};

export type EntiteRdv = {
  genre: "rdv";
  cle: string;
  id: number;
  /** phys, visio, tache, perso. */
  type: string;
  titre: string;
  lieu: string | null;
  debut: string;
  dureeMin: number | null;
  termine: boolean;
  commercial: string;
  dossierId: number | null;
  ref: string | null;
  client: string | null;
};

export type EntiteDemande = {
  genre: "demande";
  cle: string;
  id: string;
  client: string;
  etape: CleEtapeDemande;
  recueLe: string;
  depart: string | null;
  arrivee: string | null;
  volume: number | null;
  dateSouhaitee: string | null;
  source: string;
  potentiel: number | null;
  estimation: number | null;
};

export type ValeurChiffre = { libelle: string; valeur: number; format: "eur" | "nombre" | "pct"; fort?: boolean };

export type EntiteChiffre = {
  genre: "chiffre";
  cle: string;
  titre: string;
  sous?: string;
  valeurs: ValeurChiffre[];
  /** L'écart du premier chiffre sur le second, en pour cent. */
  evolution?: number | null;
  /** Une série (le CA mois par mois) : une barre par point. */
  serie?: { libelle: string; valeur: number; courant: boolean }[];
};

export type Entite = EntiteDossier | EntiteDevis | EntiteRdv | EntiteDemande | EntiteChiffre;

/** Un outil consulté pendant la réponse : son nom, ce qu'il a cherché, ce qu'il a trouvé. */
export type Consultation = {
  id: string;
  outil: string;
  libelle: string;
  fini: boolean;
  /** Le nombre d'éléments trouvés. */
  n?: number;
  cles?: string[];
  erreur?: boolean;
};

/** Les événements du flux de /api/copilote, une ligne JSON chacun. */
export type Evenement =
  | { t: "debut" }
  | { t: "outil"; id: string; outil: string; libelle: string }
  | { t: "resultat"; id: string; n: number; entites: Entite[]; erreur?: boolean }
  | { t: "texte"; d: string }
  /** Le texte écrit avant un appel d'outil n'était qu'un préambule : on le retire. */
  | { t: "efface" }
  | { t: "fin"; texte: string; suites: string[] }
  | { t: "erreur"; message: string };

/** Les sources, telles que la page les nomme. */
export const SOURCES: Record<string, { libelle: string; icone: string }> = {
  chercher_dossiers: { libelle: "Dossiers", icone: "dossierClient" },
  dossier: { libelle: "Fiche dossier", icone: "dossierClient" },
  agenda: { libelle: "Agenda", icone: "calendrier" },
  demenagements_a_venir: { libelle: "Déménagements", icone: "camion" },
  devis_a_relancer: { libelle: "Devis", icone: "devis" },
  chiffres: { libelle: "Chiffres", icone: "euro" },
  demandes_du_site: { libelle: "Demandes du site", icone: "questionnaires" },
};

/** Les clés écrites par le modèle : [[dossier:12]], [[chiffre:ca]], [[demande:<uuid>]]… */
export const MOTIF_CLE = /\[\[\s*(dossier|devis|rdv|demande|chiffre)\s*:\s*([\w-]+)\s*\]\]/g;

/** La ligne des questions suivantes, à la fin de la réponse : [[suites: … | … ]]. */
const MOTIF_SUITES = /\[\[\s*suites?\s*:([\s\S]*?)(?:\]\]|$)/i;

/** Sépare la réponse de ses questions suivantes. */
export function separerSuites(texte: string): { texte: string; suites: string[] } {
  const m = texte.match(MOTIF_SUITES);
  if (!m || m.index === undefined) return { texte: texte.trim(), suites: [] };
  const suites = m[1]
    .split("|")
    .map((s) => s.replace(/^[\s"«»“”-]+|[\s"«»“”]+$/g, "").trim())
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .filter((s) => s.length > 2 && s.length < 140)
    .slice(0, 3);
  return { texte: (texte.slice(0, m.index) + texte.slice(m.index + m[0].length)).trim(), suites };
}

/**
 * Le texte affichable pendant le flux : sans la ligne des suites qui
 * s'écrit, ni une clé dont les crochets ne sont pas encore fermés.
 */
export function texteEnCours(texte: string): string {
  let t = texte;
  const suites = t.search(/\[\[\s*s(?:u(?:i(?:t(?:e)?)?)?)?/i);
  if (suites >= 0) t = t.slice(0, suites);
  const ouvert = t.lastIndexOf("[[");
  if (ouvert >= 0 && t.indexOf("]]", ouvert) < 0) t = t.slice(0, ouvert);
  // Un crochet seul en fin de flux annonce peut-être une clé.
  return t.replace(/\[$/, "");
}
