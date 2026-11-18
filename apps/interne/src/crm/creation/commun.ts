import { departementOm } from "@/crm/cimob/commun";

/*
 * La création de dossier rapide : ce que partagent l'écran (navigateur) et le
 * serveur. Les libellés, la forme d'une « reprise », et le calcul du dossier
 * passé le plus proche. Rien ici ne lit la base : ce module se charge des deux
 * côtés.
 */

/**
 * Les segments (type de client), dans l'ordre de l'écran. Libellés de l'ancien formulaire de création, sauf
 * « CIMOB/DICOM » (ex-« Militaire ») et « Client compte » (ex-« Compte entreprise ») : les mots de Céline
 * (16/11/2026). Les valeurs en base ne changent pas (militaire, compte).
 */
export const SEGMENTS: [string, string][] = [
  ["particulier", "Particulier"],
  ["militaire", "CIMOB/DICOM"],
  ["logement_social", "Logement social"],
  ["compte", "Client compte"],
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
  /** Le reste de la fiche du premier appel, quand le dossier passé l'avait (lu par creation/donnees.ts). */
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
  ascenseur_taille?: string | null;
  monte_meuble?: string | null;
  transbordement?: boolean;
  portage?: boolean;
  code_acces?: string | null;
  surface_m2?: number | null;
  acces_camion?: string | null;
  /** CIMOB/DICOM : le département d'outre-mer de l'adresse (cimob/commun.ts). */
  departement_om?: string | null;
}

/* ---------- les adresses de la fiche du premier appel ---------- */

/**
 * Une adresse de chargement ou de livraison, telle que l'équipe la note dès
 * le premier appel (retours de Céline, 16/11/2026, d'après la fiche de visite
 * de Créagidem). Chaque champ a sa colonne dans crm.etapes_trajet :
 * adresse (le complément devant, à la française), code_postal, ville, pays,
 * etage, ascenseur, ascenseur_taille, monte_meuble ('oui' / 'non'),
 * transbordement, portage, code_acces, surface_m2 (au départ seulement),
 * acces_camion, acces (les précisions reprises d'un dossier passé).
 */
export interface AdresseSaisie {
  adresse: string;
  /** La deuxième ligne de l'adresse : bâtiment, résidence, escalier… */
  complement: string;
  code_postal: string;
  ville: string;
  pays: string;
  /** Connus quand l'adresse a été choisie dans les suggestions : ils servent au calcul des kilomètres. */
  lat: number | null;
  lon: number | null;
  etage: string;
  ascenseur: boolean;
  /** La taille de l'ascenseur, en nombre de personnes (texte libre : « 4 », « 2 à 3 »). */
  ascenseur_taille: string;
  monte_meuble: boolean;
  transbordement: boolean;
  portage: boolean;
  /** Les codes et/ou l'interphone. */
  code_acces: string;
  /** La surface habitable, en m² (adresse de départ). */
  surface: string;
  acces_camion: string;
  acces: string;
  /** CIMOB/DICOM (Céline, 17/11/2026) : le département d'outre-mer, par son code (971…988) ; vide par défaut. */
  departement_om: string;
}

/** « Accès en camion » : la mention écrite d'office, modifiable (Céline : « automatiquement notée facile aux poids lourds »). */
export const ACCES_CAMION_DEFAUT = "Facile aux poids lourds";

export const ADRESSE_VIDE: AdresseSaisie = {
  adresse: "", complement: "", code_postal: "", ville: "", pays: "", lat: null, lon: null,
  etage: "", ascenseur: false, ascenseur_taille: "", monte_meuble: false, transbordement: false, portage: false,
  code_acces: "", surface: "", acces_camion: ACCES_CAMION_DEFAUT, acces: "", departement_om: "",
};

/** Au plus, par genre : un déménagement à dix adresses de chargement se saisit sur la fiche. */
export const ADRESSES_MAX = 6;

/** Une étape d'un dossier passé, en adresse de la fiche du premier appel. */
export function adresseDepuisEtape(e: EtapeReprise, depart: boolean): AdresseSaisie {
  return {
    ...ADRESSE_VIDE,
    adresse: e.adresse ?? "",
    code_postal: e.code_postal ?? "",
    ville: e.ville ?? "",
    pays: e.pays ?? "",
    etage: e.etage ?? "",
    ascenseur: !!e.ascenseur,
    ascenseur_taille: e.ascenseur_taille ?? "",
    monte_meuble: e.monte_meuble === "oui",
    transbordement: !!e.transbordement,
    portage: !!e.portage,
    code_acces: e.code_acces ?? "",
    surface: depart && e.surface_m2 != null ? String(e.surface_m2) : "",
    acces_camion: e.acces_camion ?? ACCES_CAMION_DEFAUT,
    acces: e.acces ?? "",
    departement_om: departementOm(e.departement_om) ?? "",
  };
}

/** Ce qui s'enregistre d'une adresse : une ligne de crm.etapes_trajet, bornée et nettoyée. */
export interface EtapeSaisie {
  genre: "depart" | "arrivee";
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  lat: number | null;
  lon: number | null;
  etage: string | null;
  ascenseur: boolean;
  ascenseur_taille: string | null;
  monte_meuble: "oui" | "non";
  transbordement: boolean;
  portage: boolean;
  code_acces: string | null;
  surface_m2: number | null;
  acces_camion: string | null;
  acces: string | null;
  departement_om: string | null;
}

const texteBorne = (v: unknown, max: number) => {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return t || null;
};
const coordonnee = (v: unknown, borne: number) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= borne ? v : null);

/** « 12 Rue de la Paix, 75002 Paris » : le code postal et la ville de la fin, quand l'adresse les porte. */
export function cpVilleDe(adresse: string | null | undefined): { code_postal: string; ville: string } | null {
  const fin = (adresse ?? "").split(",").pop()?.trim() ?? "";
  const m = fin.match(/^(\d{5})\s+(.+)$/);
  return m ? { code_postal: m[1], ville: m[2].trim() } : null;
}

/**
 * Les adresses reçues de l'écran de création (un champ caché, en JSON),
 * relues côté serveur : seuls les champs connus, aux valeurs bornées. Le
 * complément passe devant l'adresse (« Bât. B, 12 Rue de la Paix, 75002
 * Paris ») : tout ce qui lit l'adresse d'une étape la lit entière, et la
 * ville reste après la dernière virgule. Il y a toujours au moins un départ
 * et une arrivée, même vides : la fiche les montre à compléter.
 */
export function lireLieux(brut: unknown): EtapeSaisie[] {
  let liste: unknown = brut;
  if (typeof brut === "string") {
    try {
      liste = JSON.parse(brut);
    } catch {
      liste = [];
    }
  }
  const etapes: EtapeSaisie[] = [];
  const parGenre = { depart: 0, arrivee: 0 };
  for (const x of Array.isArray(liste) ? liste : []) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const genre = o.genre === "arrivee" ? "arrivee" : o.genre === "depart" ? "depart" : null;
    if (!genre || parGenre[genre] >= ADRESSES_MAX) continue;
    const complement = texteBorne(o.complement, 120);
    const ligne = texteBorne(o.adresse, 300);
    const adresse = [complement, ligne].filter(Boolean).join(", ") || null;
    // Une adresse de plus (« + ») laissée vide ne fait pas d'étape ; la première de chaque genre, si.
    if (parGenre[genre] > 0 && !adresse) continue;
    const lue = cpVilleDe(ligne);
    const surface = Number(String(o.surface ?? "").replace(",", "."));
    parGenre[genre]++;
    etapes.push({
      genre,
      adresse,
      code_postal: texteBorne(o.code_postal, 12) ?? lue?.code_postal ?? null,
      ville: texteBorne(o.ville, 80) ?? lue?.ville ?? null,
      pays: texteBorne(o.pays, 60),
      lat: coordonnee(o.lat, 90),
      lon: coordonnee(o.lon, 180),
      etage: texteBorne(o.etage, 40),
      ascenseur: o.ascenseur === true,
      ascenseur_taille: o.ascenseur === true ? texteBorne(o.ascenseur_taille, 40) : null,
      monte_meuble: o.monte_meuble === true ? "oui" : "non",
      transbordement: o.transbordement === true,
      portage: o.portage === true,
      code_acces: texteBorne(o.code_acces, 200),
      surface_m2: genre === "depart" && Number.isFinite(surface) && surface > 0 && surface < 100_000 ? Math.round(surface) : null,
      acces_camion: texteBorne(o.acces_camion, 200),
      acces: texteBorne(o.acces, 500),
      departement_om: departementOm(o.departement_om),
    });
  }
  const vide = (genre: "depart" | "arrivee"): EtapeSaisie => ({
    genre, adresse: null, code_postal: null, ville: null, pays: null, lat: null, lon: null, etage: null, ascenseur: false, ascenseur_taille: null,
    monte_meuble: "non", transbordement: false, portage: false, code_acces: null, surface_m2: null, acces_camion: null, acces: null, departement_om: null,
  });
  if (!parGenre.depart) etapes.unshift(vide("depart"));
  if (!parGenre.arrivee) etapes.push(vide("arrivee"));
  // Les départs d'abord, dans l'ordre de l'écran, puis les livraisons.
  return [...etapes.filter((e) => e.genre === "depart"), ...etapes.filter((e) => e.genre === "arrivee")];
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
  par: "email" | "telephone" | "matricule";
  nbDossiers: number;
  dernier: SourceDossier | null;
  /** CIMOB/DICOM : son matricule et sa situation de famille (cimob/commun.ts). */
  matricule?: string | null;
  situation_famille?: string | null;
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
  /** CIMOB/DICOM : le matricule saisi, qui reconnaît un client déjà connu. */
  matricule?: string;
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
