import type { Teinte } from "@/crm/kanban/etapes";

/*
 * Les clients du CRM (crm.clients), vus pour eux-mêmes : la liste /clients et
 * la fiche /clients/<id>. Ce module est pur (ni base ni navigateur) : les
 * vues de la liste, ses tris, la recherche et l'état d'un espace client, lus
 * par la page (serveur) et par les filtres de la bande (navigateur).
 */

/** Les vues de la liste, au menu (quatre au plus : le menu reste compact). */
export const VUES = [
  { cle: "tous", label: "Tous", icone: "clients" },
  { cle: "en_cours", label: "Avec un dossier en cours", icone: "parcours" },
  { cle: "a_relancer", label: "À relancer · reste à payer", icone: "horloge" },
  { cle: "sans_dossier", label: "Sans dossier", icone: "dossierClient" },
] as const;
export type Vue = (typeof VUES)[number]["cle"];
export const estVue = (v: unknown): v is Vue => VUES.some((x) => x.cle === v);

/** Les tris de la liste. « Par département » : les CIMOB/DICOM, rangés par département d'outre-mer (Céline, 17/11/2026). */
export const TRIS = [
  { cle: "recents", label: "Les plus récents" },
  { cle: "az", label: "De A à Z" },
  { cle: "ca", label: "Par CA signé" },
  { cle: "departement", label: "Par département (CIMOB/DICOM)" },
] as const;
export type Tri = (typeof TRIS)[number]["cle"];
export const estTri = (v: unknown): v is Tri => TRIS.some((x) => x.cle === v);

/** Les lignes d'une page de la liste. */
export const PAR_PAGE = 40;

/** Sans accents ni majuscules : « Benoît » se trouve en tapant « benoit ». */
export const normaliser = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Le texte où cherche la recherche des clients : nom, société, e-mail,
 * téléphones, références et adresses des dossiers, numéro du client, et le
 * matricule d'un CIMOB/DICOM (Céline, 17/11/2026).
 */
export function texteRecherche(r: {
  id: number; prenom?: string | null; nom?: string | null; societe?: string | null; email?: string | null; telephone?: string | null;
  telephone2?: string | null; refs?: string | null; adresses?: string | null; matricule?: string | null;
}): string {
  return normaliser(
    [r.prenom, r.nom, r.societe, r.email, r.telephone, r.telephone2, r.refs, r.adresses, `n° ${r.id}`, r.matricule ? `matricule ${r.matricule}` : null].filter(Boolean).join(" "),
  );
}

/** Les chiffres d'un numéro, à la française : « +33 6 12… » et « 06 12… » se valent. */
export function chiffresTelephone(t: string | null | undefined): string {
  const c = (t ?? "").replace(/[^0-9]/g, "");
  if (c.startsWith("0033")) return `0${c.slice(4)}`;
  if (c.startsWith("33") && c.length === 11) return `0${c.slice(2)}`;
  return c;
}

/**
 * Une recherche dans une ligne : chaque mot tapé doit s'y trouver (nom,
 * société, e-mail, téléphones, villes, références des dossiers). Un mot fait
 * de chiffres se cherche aussi dans les téléphones, espaces et indicatif
 * mis à part.
 */
export function correspond(q: string, texte: string, telephones: string): boolean {
  const mots = normaliser(q).split(/\s+/).filter(Boolean);
  if (!mots.length) return true;
  const tout = q.replace(/[\s.+-]/g, "");
  // Rien que des chiffres (« 06 12 34 56 78 », « +33 6… », « 2026-0147 ») : un numéro, comparé chiffre à
  // chiffre, ou une référence de dossier, telle que tapée — jamais chaque paire de chiffres à part.
  if (/^\d{4,}$/.test(tout)) return telephones.includes(chiffresTelephone(tout)) || texte.includes(normaliser(q).trim());
  return mots.every((m) => texte.includes(m) || (/^\d{4,}$/.test(m) && telephones.includes(chiffresTelephone(m))));
}

/** Un numéro lisible, par paires (« 06 12 34 56 78 ») ; tel quel s'il n'a pas la forme d'un numéro français. */
export function telephoneLisible(t: string | null | undefined): string | null {
  if (!t?.trim()) return null;
  const c = chiffresTelephone(t);
  if (/^0\d{9}$/.test(c)) return c.replace(/(\d{2})(?=\d)/g, "$1 ");
  return t.trim();
}
/** L'adresse d'un appel (tel:), quand le numéro en est un. */
export function lienTelephone(t: string | null | undefined): string | null {
  const c = (t ?? "").replace(/[^0-9+]/g, "");
  return c.replace(/\D/g, "").length >= 6 ? `tel:${c}` : null;
}
/** Une adresse e-mail qui en a la forme (les fiches importées en ont de fausses). */
export const emailValide = (e: string | null | undefined): e is string => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

/** L'état de l'espace client d'un client : ouvert (vu ou jamais connecté), ou pas d'espace. */
export type EtatEspace = { cle: "vu" | "jamais" | "aucun"; label: string; teinte: Teinte };
export function etatEspace(espaces: number, derniereConnexion: string | null, jour: (d: string) => string): EtatEspace {
  if (!espaces) return { cle: "aucun", label: "Pas d’espace", teinte: "gris" };
  if (derniereConnexion) return { cle: "vu", label: `Vu le ${jour(derniereConnexion)}`, teinte: "vert" };
  return { cle: "jamais", label: "Jamais connecté", teinte: "ambre" };
}

/** Une ligne de la liste, telle que la page l'affiche. */
export interface LigneClient {
  id: number;
  type: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  societe: string | null;
  email: string | null;
  telephone: string | null;
  telephone2: string | null;
  creeLe: string;
  nbDossiers: number;
  enCours: number;
  ca: number;
  reste: number;
  dernier: { id: number; ref: string; statut: string; commercialId: number | null; commercial: { id: number; nom: string; initiales: string } | null } | null;
  villes: string[];
  espaces: number;
  derniereConnexion: string | null;
  activite: string;
  /** Une relance attend (en retard ou du jour) sur un de ses dossiers. */
  aRelancer: boolean;
  /** L'entreprise (espace pro) à laquelle le client est rattaché, ou rien. */
  entreprise: string | null;
  /** CIMOB/DICOM : son matricule, et les départements d'outre-mer de ses adresses (codes, dans l'ordre). */
  matricule: string | null;
  departements: string[];
  /** Pour la recherche : le texte normalisé, et les chiffres de ses téléphones. */
  texte: string;
  telephones: string;
}

/** Une ligne garde-t-elle sa place dans une vue ? */
export function dansVue(l: LigneClient, v: Vue): boolean {
  if (v === "en_cours") return l.enCours > 0;
  if (v === "a_relancer") return l.reste > 0.5 || l.aRelancer;
  if (v === "sans_dossier") return l.nbDossiers === 0;
  return true;
}

/** Le nom affiché d'un client : sa société, sinon prénom et nom. */
export const nomAffiche = (c: { societe?: string | null; prenom?: string | null; nom?: string | null }) =>
  c.societe?.trim() || [c.prenom, c.nom].filter((x) => x?.trim()).join(" ") || "Sans nom";

/** Une teinte par type de client : l'avatar et la pastille du type. */
export const TEINTE_TYPE: Record<string, Teinte> = {
  particulier: "indigo",
  compte: "ciel",
  militaire: "vert",
  partenaire: "violet",
  logement_social: "ambre",
};
