/*
 * La création de dossier rapide : ce que partagent l'écran (navigateur) et le
 * serveur. Les libellés, la forme d'une « reprise », et le calcul du dossier
 * passé le plus proche. Rien ici ne lit la base : ce module se charge des deux
 * côtés.
 */

/** Les segments (type de client), dans l'ordre de l'écran. Libellés de l'ancien formulaire de création. */
export const SEGMENTS: [string, string][] = [
  ["particulier", "Particulier"],
  ["militaire", "Militaire"],
  ["logement_social", "Logement social"],
  ["compte", "Compte entreprise"],
  ["partenaire", "Partenaire / agent"],
];
/** Les segments dont le client est une société : on demande sa raison sociale et un contact. */
export const SEGMENTS_SOCIETE = ["compte", "partenaire"];

/** Les types de déménagement, avec les libellés de la fiche dossier. */
export const TYPES_DEMENAGEMENT: [string, string][] = [
  ["national", "National"],
  ["international", "International"],
  ["maritime", "Maritime"],
  ["aerien", "Aérien"],
  ["gm", "Garde-meuble"],
  ["bureau", "Bureau"],
];

export const libelleSegment = (k?: string | null) => SEGMENTS.find(([c]) => c === k)?.[1] ?? null;
export const libelleType = (k?: string | null) => TYPES_DEMENAGEMENT.find(([c]) => c === k)?.[1] ?? null;
export const segmentValide = (k: unknown): k is string => typeof k === "string" && SEGMENTS.some(([c]) => c === k);
export const typeValide = (k: unknown): k is string => typeof k === "string" && TYPES_DEMENAGEMENT.some(([c]) => c === k);

/**
 * Ce qu'une reprise peut recopier, quel que soit le client : segment, type de
 * déménagement, volume indicatif, options (garde-meuble, véhicule). Les
 * observations n'en font partie que pour un modèle ; celles d'un dossier
 * décrivent son client et ne suivent que s'il s'agit du même client.
 */
export interface Champs {
  type?: string;
  type_demenagement?: string;
  volume?: number | null;
  garde_meuble?: boolean;
  vehicule?: boolean;
  observations?: string | null;
}

/** Une étape d'un dossier passé : recopiée seulement pour le même client. */
export interface EtapeReprise {
  adresse: string | null;
  etage: string | null;
  ascenseur: boolean;
  acces: string | null;
}

/** Un dossier passé, tel que l'écran de création peut le reprendre. */
export interface SourceDossier {
  genre: "dossier";
  id: number;
  ref: string;
  clientId: number;
  client: string;
  statut: string;
  creeLe: string;
  auteur: string | null;
  volume: number;
  depart: EtapeReprise | null;
  arrivee: EtapeReprise | null;
  /** Ce qui se reprend pour n'importe quel client. */
  champs: Champs;
  /** Les observations du dossier : reprises seulement pour le même client. */
  observations: string | null;
}

/** Un modèle de dossier. */
export interface SourceModele {
  genre: "modele";
  id: number;
  nom: string;
  description: string | null;
  champs: Champs;
  utilisations: number;
  dernierUsage: string | null;
  demo: boolean;
  auteur: string | null;
  creeLe: string;
}

/** Un dossier passé proposé pendant la saisie, avec son score et ses raisons. */
export interface Proche {
  source: SourceDossier;
  score: number;
  raisons: string[];
}

/** Un client déjà connu (même e-mail ou même téléphone). */
export interface ClientConnu {
  id: number;
  type: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  societe: string | null;
  email: string | null;
  telephone: string | null;
  par: "email" | "telephone";
  nbDossiers: number;
  dernier: SourceDossier | null;
}

/** Un dossier récent qui ressemble à celui qu'on saisit : un doublon possible. */
export interface DoublonPossible {
  id: number;
  ref: string;
  client: string;
  statut: string;
  creeLe: string;
  arrivee: string | null;
  pourquoi: string;
}

export interface Reperes {
  client: ClientConnu | null;
  doublons: DoublonPossible[];
  proches: Proche[];
}

/** Ce que l'écran envoie pour obtenir ses repères. */
export interface Saisie {
  email?: string;
  telephone?: string;
  nom?: string;
  societe?: string;
  depart?: string;
  arrivee?: string;
  volume?: number | null;
  type?: string;
  type_demenagement?: string;
  clientId?: number | null;
}

/* ---------- téléphone, e-mail ---------- */

/** Les 9 derniers chiffres d'un numéro : « 06 12 34 56 78 » et « +33 6 12 34 56 78 » se rejoignent. */
export function cleTelephone(t?: string | null) {
  const c = (t ?? "").replace(/[^0-9]/g, "");
  return c.length >= 9 ? c.slice(-9) : null;
}
export function cleEmail(e?: string | null) {
  const v = (e ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(v) ? v : null;
}

/* ---------- lieux ---------- */

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Les mots qui ne désignent pas une ville : voies, articles, compléments. */
const VIDES = new Set([
  "rue", "avenue", "av", "ave", "bd", "boulevard", "place", "pl", "quai", "chemin", "allee", "impasse", "route", "rte", "cours",
  "square", "passage", "villa", "cite", "residence", "de", "du", "des", "la", "le", "les", "l", "d", "et", "sur", "sous", "en",
  "aux", "au", "centre", "ville", "cedex", "bis", "ter", "france",
]);
const VOIE = /\b(rue|avenue|av|bd|boulevard|place|quai|chemin|allee|impasse|route|cours|square|passage)\b/;
const mots = (s: string) =>
  s.split(/[\s,;'’/()]+/).map((m) => m.replace(/^-+|-+$/g, "")).filter((m) => m.length >= 2 && !/^\d/.test(m) && !VIDES.has(m));

export interface Lieu {
  /** Les mots de la ville (« bordeaux lac » → [bordeaux, lac]), sans l'arrondissement. */
  ville: string[];
  /** Le département, lu dans le code postal quand il y en a un. */
  departement: string | null;
}

/**
 * La ville et le département d'une adresse saisie à la main : « Lyon 6e »,
 * « 22 quai Saint-Vincent, Lyon 6e », « 5 place Bellecour, 69002 Lyon »,
 * « Papeete, Tahiti ». Une approximation assumée : elle sert à rapprocher des
 * dossiers, pas à géocoder.
 */
export function lieu(adresse?: string | null): Lieu | null {
  const a = sansAccents(adresse ?? "").replace(/\s+/g, " ").trim();
  if (!a) return null;
  const cp = a.match(/\b(\d{5})\b/);
  const departement = cp ? (/^9[78]/.test(cp[1]) ? cp[1].slice(0, 3) : cp[1].slice(0, 2)) : null;
  let ville = "";
  if (cp) {
    const apres = a.slice((cp.index ?? 0) + 5).split(",")[0];
    ville = apres.trim() || a.slice(0, cp.index).split(",").pop() || "";
  } else {
    const segments = a.split(",").map((x) => x.trim()).filter(Boolean);
    // Le premier segment qui n'est pas une voie (« 12 rue… ») est la ville ; à défaut, le dernier.
    ville = segments.find((x) => !/^\d/.test(x) && !VOIE.test(x)) ?? segments[segments.length - 1] ?? "";
  }
  const m = mots(ville.replace(/\b\d+\s*(e|er|eme|ème)\b/g, " "));
  if (!m.length && !departement) return null;
  return { ville: m, departement };
}

/** Même ville : les mots de l'une contiennent le premier mot de l'autre (« Bordeaux » et « Bordeaux Lac »). */
export function memeVille(a: Lieu | null, b: Lieu | null) {
  if (!a?.ville.length || !b?.ville.length) return false;
  return a.ville.includes(b.ville[0]) || b.ville.includes(a.ville[0]);
}
export const memeDepartement = (a: Lieu | null, b: Lieu | null) => !!a?.departement && a.departement === b?.departement;

/* ---------- le dossier passé le plus proche ---------- */

/**
 * Les poids du score, sur 100 : la destination compte le plus, puis le
 * volume, puis le départ, le segment et le type de déménagement. Le score
 * affiché est rapporté à ce que la saisie permet de comparer : avec la seule
 * destination tapée, un dossier de même destination, même segment et même
 * type obtient 100 %.
 */
export const POIDS = { destination: 35, volume: 20, depart: 15, segment: 15, type: 15 } as const;

export function scorer(saisie: Saisie, d: SourceDossier, lieux: { depart: Lieu | null; arrivee: Lieu | null }): Proche | null {
  const qa = lieu(saisie.arrivee), qd = lieu(saisie.depart);
  const vol = saisie.volume && saisie.volume > 0 ? saisie.volume : null;
  // Sans destination, départ ni volume, rien ne permet de parler de proximité.
  if (!qa && !qd && !vol) return null;
  let obtenu = 0, possible = 0, fort = false;
  const raisons: [number, string][] = [];
  if (qa) {
    possible += POIDS.destination;
    if (memeVille(qa, lieux.arrivee)) { obtenu += POIDS.destination; fort = true; raisons.push([POIDS.destination, "même destination"]); }
    else if (memeDepartement(qa, lieux.arrivee)) { obtenu += 18; fort = true; raisons.push([18, "même département d'arrivée"]); }
  }
  if (vol) {
    possible += POIDS.volume;
    if (d.volume > 0) {
      const ecart = Math.abs(vol - d.volume) / Math.max(vol, d.volume);
      const pts = Math.round(POIDS.volume * Math.max(0, 1 - ecart / 0.5));
      obtenu += pts;
      if (ecart <= 0.25) { fort = true; raisons.push([pts, `volume proche (${String(Math.round(d.volume * 10) / 10).replace(".", ",")}\u00a0m³)`]); }
    }
  }
  if (qd) {
    possible += POIDS.depart;
    if (memeVille(qd, lieux.depart)) { obtenu += POIDS.depart; fort = true; raisons.push([POIDS.depart, "même départ"]); }
    else if (memeDepartement(qd, lieux.depart)) { obtenu += 8; raisons.push([8, "même département de départ"]); }
  }
  possible += POIDS.segment + POIDS.type;
  if (saisie.type && d.champs.type === saisie.type) { obtenu += POIDS.segment; raisons.push([POIDS.segment - 0.5, "même segment"]); }
  if (saisie.type_demenagement && d.champs.type_demenagement === saisie.type_demenagement) {
    obtenu += POIDS.type; raisons.push([POIDS.type - 1, "même type de déménagement"]);
  }
  // Un dossier qui ne partage que le segment et le type n'est pas « proche ».
  if (!fort) return null;
  const score = Math.round((100 * obtenu) / possible);
  return { source: d, score, raisons: raisons.sort((x, y) => y[0] - x[0]).map((r) => r[1]) };
}

/* ---------- période et mois du chiffre d'affaires ---------- */

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Les douze prochains mois, proposés en saisie de la période (« Janvier 2027 »). */
export function moisAVenir(depuis = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(depuis.getFullYear(), depuis.getMonth() + i, 1);
    const m = MOIS[d.getMonth()];
    return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
  });
}

/**
 * Une période tapée en abrégé, développée à la validation : « janv » →
 * « Janvier 2027 », « mars 27 » → « Mars 2027 ». Sans année, c'est la
 * prochaine occurrence du mois. Toute autre saisie (« Fin janvier ») reste
 * telle quelle.
 */
export function developperPeriode(p: string, maintenant: number): string {
  const m = sansAccents(p.trim()).match(/^([a-z]{3,})\.?\s*(\d{2}|\d{4})?$/);
  if (!m) return p;
  const trouves = MOIS.map((x, i) => [sansAccents(x), i] as const).filter(([x]) => x.startsWith(m[1]));
  if (trouves.length !== 1) return p;
  const i = trouves[0][1];
  const auj = new Date(maintenant);
  const an = m[2] ? (m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])) : auj.getFullYear() + (i < auj.getMonth() ? 1 : 0);
  return `${MOIS[i].charAt(0).toUpperCase()}${MOIS[i].slice(1)} ${an}`;
}

/** « il y a 3 j », à partir d'un instant fixé par le serveur (le même au rendu et à l'hydratation). */
export function depuis(iso: string, maintenant: number) {
  const j = Math.floor((maintenant - new Date(iso).getTime()) / 86_400_000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return "hier";
  if (j < 45) return `il y a ${j} j`;
  return `il y a ${Math.round(j / 30)} mois`;
}

/** La fin d'une adresse, pour l'afficher court : « 12 rue de Rivoli, 75004 Paris » → « 75004 Paris ». */
export const court = (a?: string | null) => (a ? a.split(",").pop()!.trim() : "—");

/**
 * Le mois de rattachement du CA, lu dans la période quand elle nomme un mois
 * et une année (« Fin janvier 2027 » → 2027-01-01). Sinon, rien : il se
 * renseigne sur la fiche.
 */
export function moisDepuisPeriode(periode?: string | null): string | null {
  const p = sansAccents(periode ?? "");
  const an = p.match(/\b(20\d{2})\b/);
  if (!an) return null;
  const i = MOIS.map(sansAccents).findIndex((m) => new RegExp(`\\b${m}\\b`).test(p));
  return i < 0 ? null : `${an[1]}-${String(i + 1).padStart(2, "0")}-01`;
}
