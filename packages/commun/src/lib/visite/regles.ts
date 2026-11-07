/*
 * La visite technique (cahier des charges, §3.2) : ce que partagent le CRM,
 * la tablette du commercial et l'espace client. Fonctions pures, sans
 * secret : le fichier part aussi dans le code du navigateur.
 *
 * - les formats d'heure, toujours à l'heure de Paris (un serveur réglé en
 *   UTC ne doit pas décaler une visite) ;
 * - le vocabulaire des accès, repris du questionnaire des conditions de
 *   livraison de l'espace client (mêmes clés, libellés tournés vers le
 *   commercial) ;
 * - la forme du compte-rendu signé et la mise en forme canonique de son
 *   contenu, dont le serveur tire l'empreinte ;
 * - les opérations de la saisie, que la tablette envoie au serveur.
 */

import { ESCALIER, MONTE_MEUBLE } from "../espace-client/libelles";

const PARIS = "Europe/Paris";

/** « 10 h » ou « 10 h 30 », à l'heure de Paris. */
export function heureParis(iso: string | Date) {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso))
    .split(":");
  return m === "00" ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

/** Le jour à Paris, AAAA-MM-JJ. */
export function jourParis(iso: string | Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return p.slice(0, 10);
}

/** L'écart de Paris à UTC à cet instant, en minutes (60 l'hiver, 120 l'été). */
function decalageParis(t: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: PARIS, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return (Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - Math.floor(t / 60_000) * 60_000) / 60_000;
}

/** L'instant d'une heure de Paris : « 2026-11-12 », « 10:30 » → 2026-11-12T09:30:00Z. */
export function instantParis(jour: string, hhmm: string): Date {
  const [a, mo, j] = jour.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const naif = Date.UTC(a, mo - 1, j, h, mi);
  let t = naif - decalageParis(naif) * 60_000;
  // Au changement d'heure, l'écart lu au premier essai peut être celui de l'autre côté.
  t = naif - decalageParis(t) * 60_000;
  return new Date(t);
}

/** Le jour qui suit, AAAA-MM-JJ. */
export function lendemain(jour: string, n = 1) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le jour de la semaine d'un jour AAAA-MM-JJ : 0 dimanche … 6 samedi. */
export const jourSemaine = (jour: string) => new Date(`${jour}T12:00:00Z`).getUTCDay();

/** « 10:30 » à Paris, pour un champ de formulaire. */
export const hhmmParis = (iso: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** « jeudi 12 novembre » */
export function jourVisite(iso: string | Date, annee = false) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long", ...(annee ? { year: "numeric" } : {}) }).format(new Date(iso));
}

/** « jeudi 12 novembre à 10 h 30 » */
export const momentVisite = (iso: string | Date, annee = false) => `${jourVisite(iso, annee)} à ${heureParis(iso)}`;

/** « 10 h – 11 h 30 » */
export const plageVisite = (iso: string | Date, dureeMin: number) =>
  `${heureParis(iso)} – ${heureParis(new Date(new Date(iso).getTime() + dureeMin * 60_000))}`;

/** « 1 h 30 », « 45 min » */
export function duree(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Un volume en m³, à la française : « 12,4 m³ ». */
export const m3 = (n: number | null | undefined) => `${String(Math.round(Number(n ?? 0) * 10) / 10).replace(".", ",")} m³`;

/** Un volume unitaire, au centième : « 0,15 m³ ». */
export const m3Fin = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} m³`;

// --- Le mode et la formule --------------------------------------------------------------------------

export type TypeVisite = "phys" | "visio";
export const TYPE_VISITE: Record<TypeVisite, string> = { phys: "Visite sur place", visio: "Visio" };

/** Les trois formules du CRM et ce qui les distingue, tels que la fiche du dossier les présente. */
export const FORMULES = [
  { cle: "premium", nom: "Premium", sous: "Le client ne fait rien" },
  { cle: "standard", nom: "Standard", sous: "Emballe ce qui casse" },
  { cle: "economique", nom: "Économique", sous: "Le client fait tout" },
] as const;
export type CleFormule = (typeof FORMULES)[number]["cle"];
export const estFormule = (v: unknown): v is CleFormule => FORMULES.some((f) => f.cle === v);

// --- Les accès -----------------------------------------------------------------------------------------

export const GENRE_ETAPE: Record<string, string> = { depart: "Départ", garde_meuble: "Garde-meuble", arrivee: "Arrivée", autre: "Étape" };

export type Escalier = keyof typeof ESCALIER;
export type Stationnement = "facile" | "autorisation" | "reserve_client";
export type PoidsLourd = "oui" | "non" | "ne_sait_pas";
export type MonteMeuble = keyof typeof MONTE_MEUBLE;

export const ACCES_ESCALIER = ESCALIER;
export const ACCES_STATIONNEMENT: Record<Stationnement, string> = {
  facile: "Place facile devant l'immeuble",
  autorisation: "Autorisation de voirie nécessaire",
  reserve_client: "Réservé par le client",
};
export const ACCES_POIDS_LOURD: Record<PoidsLourd, string> = { oui: "Oui", non: "Non", ne_sait_pas: "À vérifier" };
export const ACCES_MONTE_MEUBLE = MONTE_MEUBLE;

/** L'étage tel qu'on le lit : « 4 », « RDC », « 0 ». */
export function libelleEtageTexte(e: string | null | undefined) {
  const t = String(e ?? "").trim();
  if (!t) return null;
  if (/^(rdc|0|rez)/i.test(t)) return "Rez-de-chaussée";
  return /^\d+$/.test(t) ? `${t}${t === "1" ? "er" : "e"} étage` : t;
}

/** Une étape du trajet et ses accès, comme la tablette les saisit. */
export interface EtapeAcces {
  id: number;
  genre: string;
  adresse: string | null;
  etage: string | null;
  ascenseur: boolean;
  escalier: Escalier | null;
  portage_m: number | null;
  stationnement: Stationnement | null;
  poids_lourd: PoidsLourd | null;
  monte_meuble: MonteMeuble | null;
  acces: string | null;
}

/** Les accès d'une étape, en une ligne : « 3e étage · ascenseur · portage 20 m · autorisation de voirie ». */
export function resumeAcces(e: Omit<EtapeAcces, "id" | "genre" | "adresse">) {
  return [
    libelleEtageTexte(e.etage),
    e.ascenseur ? "ascenseur" : e.etage && !/^(rdc|0|rez)/i.test(e.etage.trim()) ? "sans ascenseur" : null,
    e.escalier && e.escalier !== "aucun" ? `escalier ${ACCES_ESCALIER[e.escalier].toLowerCase()}` : null,
    e.portage_m != null ? `portage ${e.portage_m} m` : null,
    e.stationnement ? ACCES_STATIONNEMENT[e.stationnement].toLowerCase() : null,
    e.poids_lourd ? `poids lourd : ${ACCES_POIDS_LOURD[e.poids_lourd].toLowerCase()}` : null,
    e.monte_meuble && e.monte_meuble !== "non" ? `monte-meuble : ${ACCES_MONTE_MEUBLE[e.monte_meuble].toLowerCase()}` : null,
    e.acces?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// --- La saisie : pièces, objets, opérations --------------------------------------------------------------

export interface ObjetSaisi {
  cle: string;
  piece: string;
  libelle: string;
  quantite: number;
  volume: number;
  demontage: boolean;
  fragile: boolean;
  note: string | null;
}

export interface PieceSaisie {
  cle: string;
  nom: string;
  ordre: number;
  remarque: string | null;
}

export interface OptionSaisie {
  libelle: string;
  proposee: boolean;
}

/** Les plafonds de la saisie : le serveur les revérifie. */
export const PLAFONDS = { nom: 60, libelle: 90, note: 200, remarque: 1500, remarques: 4000, quantite: 999, volume: 99, acces: 300, signataire: 80 } as const;

/**
 * Une opération de la saisie. La tablette les garde en file (dans le
 * stockage de l'onglet) jusqu'à ce que le serveur les ait reçues : chacune
 * désigne son objet par une clé tirée sur la tablette, de sorte qu'une
 * opération rejouée (réponse perdue, onglet rouvert) ne fait jamais rien de
 * plus que la première fois.
 */
export type Operation =
  | { t: "piece"; cle: string; nom: string; ordre: number; remarque: string | null }
  | { t: "piece-"; cle: string }
  | ({ t: "objet" } & ObjetSaisi)
  | { t: "objet-"; cle: string }
  | { t: "visite"; remarques?: string | null; options?: OptionSaisie[]; formule?: CleFormule | null }
  | ({ t: "etape" } & Omit<EtapeAcces, "genre" | "adresse">);

export const volumeObjets = (objets: Pick<ObjetSaisi, "quantite" | "volume">[]) =>
  Math.round(objets.reduce((n, o) => n + o.quantite * o.volume, 0) * 100) / 100;

// --- Le compte-rendu -----------------------------------------------------------------------------------

/**
 * Le contenu du compte-rendu, figé à la signature : c'est lui que le client
 * relit sur la tablette, lui que l'empreinte scelle, lui que le PDF met en
 * page. Ce qui change ensuite dans le dossier (un objet ajouté au CRM, une
 * nouvelle visite) n'y touche plus.
 */
export interface ContenuCompteRendu {
  version: 1;
  dossier: { ref: string; client: string; contact: string | null; telephone: string | null; email: string | null };
  visite: { id: number; le: string; commercial: string; mode: "sur_place" | "visio" };
  trajet: (Omit<EtapeAcces, "id"> & { libelle: string })[];
  pieces: {
    cle: string;
    nom: string;
    remarque: string | null;
    volume: number;
    objets: { libelle: string; quantite: number; volume_unitaire: number; volume: number; demontage: boolean; fragile: boolean; note: string | null }[];
    photos: number;
  }[];
  volume: number;
  nb_objets: number;
  nb_photos: number;
  options: string[];
  formule: { cle: CleFormule; nom: string; sous: string } | null;
  remarques: string | null;
}

/**
 * Le texte canonique d'une valeur JSON : clés triées, sans espace. Deux
 * contenus égaux donnent le même texte, donc la même empreinte.
 */
export function jsonCanonique(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(jsonCanonique).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonCanonique(o[k])}`)
    .join(",")}}`;
}

/** L'empreinte en groupes de quatre, pour qu'un humain puisse la comparer : « 3fa2 91c0 … ». */
export const empreinteLisible = (e: string, groupes = 8) =>
  (e.match(/.{1,4}/g) ?? []).slice(0, groupes).join(" ") + (e.length > groupes * 4 ? " …" : "");
