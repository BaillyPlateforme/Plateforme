import { portDe, trouverPort } from "@/lib/ports";
import { enFrance, estOutreMer } from "@/lib/trajet";
import { cpVilleDe, portSaisi } from "./commun";

/*
 * Les kilomètres d'un dossier quand le trajet passe par la mer (Céline,
 * 18/11/2026 : « dans adresse départ, il faut ajouter une case port et que le
 * km se calcule entre l'adresse de départ et le port mentionné… idem dans
 * adresse de livraison ; le kilométrage du port de départ et celui d'arrivée
 * calculé à vol d'oiseau »). Ce que partagent l'écran de création, la fiche,
 * ses impressions et le serveur : rien ici ne lit la base ni le réseau.
 *
 * Trois distances distinctes, jamais additionnées entre elles (choix de David,
 * 18/11/2026) : l'adresse de départ jusqu'au port de départ, par la route ;
 * d'un port à l'autre, à vol d'oiseau ; le port d'arrivée jusqu'à la
 * livraison, par la route. dossiers.distance_km garde son sens, « les km par
 * la route » : avec deux ports, la somme des deux tronçons routiers ; avec un
 * seul, rien (l'autre côté de la mer n'est pas connu). Sans port, rien ne
 * change (crm/creation/distance.ts, distanceTrajet).
 */

/** Les kilomètres d'un dossier, chacun à sa place (colonnes de crm.dossiers : distance_km, distance_vers_port_km, distance_mer_km, distance_depuis_port_km). */
export interface Kilometres {
  /** Par la route : tout le trajet sans port ; avec deux ports, la somme des deux tronçons routiers ; sinon rien. */
  km: number | null;
  /** De l'adresse de départ (les chargements, dans l'ordre) au port de départ, par la route. */
  versPort: number | null;
  /** Du port de départ au port d'arrivée, à vol d'oiseau. */
  mer: number | null;
  /** Du port d'arrivée à la livraison (les livraisons, dans l'ordre), par la route. */
  depuisPort: number | null;
}

export const SANS_KM: Kilometres = { km: null, versPort: null, mer: null, depuisPort: null };

/** Une distance reçue d'un formulaire ou d'un calcul : un nombre entier de 0 à 40 000 km, sinon rien. */
export function kmRecevable(v: unknown): number | null {
  const n = typeof v === "string" ? (v.trim() === "" ? Number.NaN : Number(v)) : typeof v === "number" ? v : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= 40_000 ? n : null;
}

/** Les kilomètres enregistrés d'un dossier (une ligne de crm.dossiers). */
export function kilometresDuDossier(d: Record<string, unknown>): Kilometres {
  return {
    km: kmRecevable(d.distance_km),
    versPort: kmRecevable(d.distance_vers_port_km),
    mer: kmRecevable(d.distance_mer_km),
    depuisPort: kmRecevable(d.distance_depuis_port_km),
  };
}

/* ---------- les ports d'un trajet ---------- */

/** Ce qu'il faut savoir d'une étape pour ses ports : son genre (depart, garde_meuble, autre, arrivee) et sa case Port. */
export interface EtapeAvecPort {
  genre?: string | null;
  port?: string | null;
}

/**
 * Les deux côtés de la mer, dans l'ordre du dossier. Le côté départ : tout ce
 * qui précède la première livraison (les chargements, un garde-meuble ou une
 * étape entre les deux) ; le côté arrivée : la première livraison et ce qui
 * suit. Le port de départ est celui du dernier chargement qui en note un — le
 * plus proche du bateau —, le port d'arrivée celui de la première livraison
 * qui en note un. Une case Port ne se montre que sur un chargement ou une
 * livraison.
 */
export function cotesDuTrajet<T extends EtapeAvecPort>(etapes: T[]): { avant: T[]; apres: T[]; portDepart: string | null; portArrivee: string | null } {
  const i = etapes.findIndex((e) => e.genre === "arrivee");
  const avant = i < 0 ? etapes : etapes.slice(0, i);
  const apres = i < 0 ? [] : etapes.slice(i);
  const portDepart = [...avant].reverse().map((e) => portSaisi(e.port)).find(Boolean) ?? null;
  const portArrivee = apres.map((e) => portSaisi(e.port)).find(Boolean) ?? null;
  return { avant, apres, portDepart, portArrivee };
}

/** Les ports d'un trajet, sans le reste. */
export function portsDuTrajet(etapes: EtapeAvecPort[]): { depart: string | null; arrivee: string | null } {
  const c = cotesDuTrajet(etapes);
  return { depart: c.portDepart, arrivee: c.portArrivee };
}

/* ---------- quand la case Port se montre ---------- */

/** Ce qu'il faut d'une adresse pour savoir si elle est outre-mer ou à l'étranger. */
export interface LieuPort {
  adresse?: string | null;
  code_postal?: string | null;
  pays?: string | null;
  departement_om?: string | null;
  port?: string | null;
}

/** Une adresse d'outre-mer (sa case département, ou un code postal en 97x / 98x) ou à l'étranger (un pays dit, autre que la France). */
export function horsMetropole(l: LieuPort): boolean {
  if ((l.departement_om ?? "").trim()) return true;
  const cp = (l.code_postal ?? "").trim() || cpVilleDe(l.adresse)?.code_postal || null;
  if (estOutreMer(cp)) return true;
  return !enFrance((l.pays ?? "").trim() || null);
}

/**
 * La case Port de chaque adresse se montre-t-elle ? Toujours pour un dossier
 * CIMOB/DICOM ; pour les autres, dès qu'une de ses adresses est outre-mer ou à
 * l'étranger ; et toujours quand une case est déjà remplie (choix de David,
 * 18/11/2026).
 */
export function casePortVisible(militaire: boolean, lieux: LieuPort[]): boolean {
  return militaire || lieux.some((l) => !!portSaisi(l.port) || horsMetropole(l));
}

/* ---------- l'affichage ---------- */

/** « 6 850 km ». */
export const kmLisibles = (n: number) => `${n.toLocaleString("fr-FR")} km`;

/** Le nom d'un port dans une distance : celui du référentiel, sinon tel qu'il a été saisi. */
export const nomDuPort = (texte: string) => trouverPort(texte)?.nom ?? texte.trim();

/**
 * Les kilomètres en bref, pour une ligne de résumé (le bandeau de la fiche) :
 * « 465 km » sans port, comme avant ; par la mer, la route et la mer côte à
 * côte, jamais additionnées.
 */
export function kmEnBref(k: Kilometres, ports: { depart: string | null; arrivee: string | null }): string[] {
  if (!ports.depart && !ports.arrivee) return k.km != null ? [kmLisibles(k.km)] : [];
  return [k.km != null ? `${kmLisibles(k.km)} par la route` : null, k.mer != null ? `${kmLisibles(k.mer)} par mer` : null].filter((x): x is string => !!x);
}

/**
 * Les distances d'un trajet qui passe par la mer, l'une sous l'autre :
 * « Départ → port du Havre : 210 km par la route », « Le Havre →
 * Fort-de-France : 6 850 km à vol d'oiseau », « Port de Fort-de-France →
 * livraison : 12 km par la route ». Ce qui manque le dit ; aucun total qui
 * mélangerait la route et la mer. Sans port, rien : l'affichage d'avant vaut.
 */
export function lignesKilometres(k: Kilometres, ports: { depart: string | null; arrivee: string | null }): string[] {
  const { depart, arrivee } = ports;
  if (!depart && !arrivee) return [];
  const route = (n: number | null) => (n != null ? `${kmLisibles(n)} par la route` : "km non calculés");
  const lignes: string[] = [];
  if (depart) lignes.push(`Départ → ${portDe(nomDuPort(depart))} : ${route(k.versPort)}`);
  if (depart && arrivee) lignes.push(`${nomDuPort(depart)} → ${nomDuPort(arrivee)} : ${k.mer != null ? `${kmLisibles(k.mer)} à vol d’oiseau` : "km non calculés"}`);
  else if (depart) lignes.push(`${nomDuPort(depart)} → port d’arrivée : à indiquer`);
  else if (arrivee) lignes.push(`Port de départ → ${nomDuPort(arrivee)} : à indiquer`);
  if (arrivee) lignes.push(`${portDe(nomDuPort(arrivee), true)} → livraison : ${route(k.depuisPort)}`);
  return lignes;
}
