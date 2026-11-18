import "server-only";
import { q } from "@/crm/lib/db";
import { situerVille, territoire, volOiseauKm, type Commune, type Point } from "@/lib/trajet";
import { trouverPort } from "@/lib/ports";
import { cpVilleDe } from "./commun";
import { SANS_KM, cotesDuTrajet, type Kilometres } from "./kilometres";

/*
 * Les kilomètres d'un trajet (retours de Céline, 16/11/2026 : « il faut que
 * les km apparaissent, calculés automatiquement »), d'une adresse à la
 * suivante dans l'ordre du dossier : les chargements, puis les livraisons.
 *
 * Rien que des services publics et sans clé, ceux que la plateforme emploie
 * déjà : la Base Adresse Nationale pour situer une adresse (la Géoplateforme
 * de l'IGN, et api-adresse.data.gouv.fr en repli, comme /api/adresses), la
 * ville seule en dernier recours (lib/trajet.ts) ; le calcul d'itinéraire
 * public d'OSRM pour la route, avec le repli de lib/trajet.ts : la distance à
 * vol d'oiseau majorée d'un quart.
 *
 * Un trajet qu'on ne sait pas situer en entier n'a pas de kilomètres : rien
 * plutôt qu'un chiffre faux.
 *
 * Par la mer (Céline, 18/11/2026) : une case Port sur les adresses de départ
 * et de livraison. La route se compte alors de l'adresse de départ au port de
 * départ, et du port d'arrivée à la livraison ; d'un port à l'autre, à vol
 * d'oiseau (distancesTrajet, ./kilometres.ts). Un port du référentiel
 * (lib/ports.ts) a ses coordonnées ; un port saisi librement se situe comme
 * une adresse s'il porte un code postal, sinon comme une commune, avec les
 * exigences de lib/trajet.ts ; introuvable, son tronçon n'a pas de
 * kilomètres.
 */

export interface PointTrajet {
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  lat?: number | null;
  lon?: number | null;
  /** depart, garde_meuble, autre ou arrivee : il sépare les deux côtés de la mer. */
  genre?: string | null;
  /** La case Port d'un chargement ou d'une livraison. */
  port?: string | null;
}

const ATTENTE = 3500;
const GEOCODEURS = ["https://data.geopf.fr/geocodage/search", "https://api-adresse.data.gouv.fr/search/"];

/** Les réponses déjà obtenues, le temps du serveur : la même adresse revient (écran, fiche, impression). */
const g = globalThis as unknown as { __crmSitues?: Map<string, Point | null>; __crmRoutes?: Map<string, number | null> };
const situes = (g.__crmSitues ??= new Map());
const routes = (g.__crmRoutes ??= new Map());
const retenir = <T>(m: Map<string, T>, k: string, v: T) => {
  if (m.size > 2000) m.clear();
  m.set(k, v);
  return v;
};

async function lireJson(url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ATTENTE), cache: "no-store", headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Une étape a-t-elle de quoi être située ? */
const utile = (e: PointTrajet) => !!((e.adresse ?? "").trim() || (e.ville ?? "").trim() || (typeof e.lat === "number" && typeof e.lon === "number"));

/** Une adresse tapée, située par la Base Adresse ; sinon sa ville ; sinon rien. */
async function situer(p: PointTrajet): Promise<Point | null> {
  if (typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { lat: p.lat, lon: p.lon };
  const texte = [p.adresse, p.code_postal && !(p.adresse ?? "").includes(p.code_postal) ? p.code_postal : null, p.ville && !(p.adresse ?? "").toLowerCase().includes(p.ville.toLowerCase()) ? p.ville : null]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 200);
  if (texte.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return null;
  const cle = texte.toLowerCase();
  if (situes.has(cle)) return situes.get(cle) ?? null;
  let repondu = false;
  for (const source of GEOCODEURS) {
    try {
      const j = (await lireJson(`${source}?q=${encodeURIComponent(texte)}&limit=1`)) as { features?: { geometry?: { coordinates?: [number, number] } }[] };
      const c = j.features?.[0]?.geometry?.coordinates;
      if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) return retenir(situes, cle, { lat: c[1], lon: c[0] });
      // La source a répondu sans rien trouver : l'autre n'en saura pas plus.
      repondu = true;
      break;
    } catch {
      /* Source muette : la suivante. */
    }
  }
  const ville = p.ville?.trim();
  const point = ville ? await situerVille(ville, p.code_postal) : null;
  // Une panne des services ne se retient pas : la prochaine demande réessaiera.
  return point || repondu ? retenir(situes, cle, point) : null;
}

/** La route entre des points, dans l'ordre (un seul appel pour tout le trajet) ; à défaut, le vol d'oiseau majoré d'un quart. */
async function route(points: Point[]): Promise<number> {
  const coords = points.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const connue = routes.get(coords);
  if (connue != null) return connue;
  try {
    const j = (await lireJson(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`)) as { routes?: { distance?: number }[] };
    const m = j.routes?.[0]?.distance;
    if (typeof m === "number" && m >= 0) return retenir(routes, coords, Math.round(m / 1000));
  } catch {
    /* Repli ci-dessous. */
  }
  let vol = 0;
  for (let i = 1; i < points.length; i++) vol += volOiseauKm(points[i - 1], points[i]);
  return Math.round(vol * 1.25);
}

/** Les kilomètres d'un trajet, d'une adresse à la suivante ; rien si une adresse reste introuvable ou s'il n'y en a qu'une. */
export async function distanceTrajet(etapes: PointTrajet[]): Promise<number | null> {
  const utiles = etapes.filter(utile);
  if (utiles.length < 2) return null;
  const points = await Promise.all(utiles.map(situer));
  if (points.some((p) => !p)) return null;
  const km = await route(points as Point[]);
  return km >= 0 && km <= 40_000 ? km : null;
}

/* ---------- par la mer : les ports ---------- */

/** Un port situé, et son territoire (lib/trajet.ts : « metropole », un code d'outre-mer, ou « hors-metropole » faute de mieux). */
export type PortSitue = Point & { territoire: string | null };

/**
 * « Port de Saint-Malo » → « Saint-Malo », « Port du Havre » → « Le Havre »,
 * « Port de La Turballe » → « La Turballe » : la commune d'un port saisi
 * librement, son article rendu. « Port-Vendres », sans « de », est une
 * commune et reste tel quel.
 */
export function communeDuPort(texte: string): string {
  const t = texte.trim();
  const m = t.match(/^(?:grand port maritime|port autonome|port|terminal|gare maritime)\s+(de\s+la\s+|de\s+l['’]\s*|des\s+|du\s+|de\s+|d['’]\s*)(.+)$/i);
  if (!m) return t;
  const lien = m[1].toLowerCase().replace(/\s+/g, " ").trim();
  const article = lien === "du" ? "Le " : lien === "des" ? "Les " : lien === "de la" ? "La " : /^de l/.test(lien) ? "L'" : "";
  return `${article}${m[2].trim()}`;
}

/**
 * Où est un port. Celui du référentiel : ses coordonnées. Un port saisi
 * librement : avec un code postal, comme une adresse ; sinon comme une
 * commune, que la base doit rendre sous ce nom exactement (lib/trajet.ts). La
 * Base Adresse rend toujours quelque chose de proche du texte : le 18/11/2026,
 * « Port 2000 Le Havre » y donnait une rue du Havre au Port (La Réunion),
 * « Port de Toulon » une rue de Granville, « Anvers » un lieu-dit de
 * Haute-Vienne. Un port étranger reste donc introuvable : pas de kilomètres
 * plutôt que des kilomètres faux.
 */
export async function situerPort(texte: string): Promise<PortSitue | null> {
  const connu = trouverPort(texte);
  if (connu) return { lat: connu.lat, lon: connu.lon, territoire: connu.territoire };
  const t = texte.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t) return null;
  const cle = `port:${t.toLowerCase()}`;
  const deja = situes.get(cle) as Commune | null | undefined;
  if (deja !== undefined) return deja ? { lat: deja.lat, lon: deja.lon, territoire: territoire(deja) } : null;
  const cp = t.match(/\b\d{5}\b/)?.[0] ?? null;
  const p: Commune | null = cp ? await situer({ adresse: t }) : await situerVille(communeDuPort(t));
  // Un échec ne se retient pas : il peut venir d'une panne des services.
  if (!p) return null;
  const point: Commune = { lat: p.lat, lon: p.lon, ...((cp ?? p.code_postal) ? { code_postal: cp ?? p.code_postal } : {}) };
  retenir(situes, cle, point);
  return { lat: point.lat, lon: point.lon, territoire: territoire(point) };
}

/**
 * Deux territoires que la route relie ? Le même, ou un qu'on ne connaît pas.
 * « hors-metropole » (un point hors du cadre de la France continentale, sans
 * code postal) ne contredit qu'un lieu de métropole.
 */
export function memeRive(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return true;
  if (a === "hors-metropole" || b === "hors-metropole") return a !== "metropole" && b !== "metropole";
  return false;
}

/**
 * Un tronçon par la route entre un port et les adresses de son côté de la
 * mer, dans l'ordre. Rien s'il n'y a aucune adresse, si l'une reste
 * introuvable, ou si l'une est de l'autre côté de la mer (un port de
 * Martinique noté au départ de Paris) : la route ne traverse pas l'océan.
 */
async function tronconRoutier(adresses: PointTrajet[], port: PortSitue, sens: "vers" | "depuis"): Promise<number | null> {
  const utiles = adresses.filter(utile);
  if (!utiles.length) return null;
  const situees = await Promise.all(utiles.map(situer));
  if (situees.some((p) => !p)) return null;
  const points = situees as Point[];
  for (const [i, p] of points.entries()) {
    const cp = (utiles[i].code_postal ?? "").trim() || cpVilleDe(utiles[i].adresse)?.code_postal || undefined;
    if (!memeRive(territoire({ ...p, code_postal: cp }), port.territoire)) return null;
  }
  const km = await route(sens === "vers" ? [...points, port] : [port, ...points]);
  return km >= 0 && km <= 40_000 ? km : null;
}

/**
 * Tous les kilomètres d'un trajet (./kilometres.ts). Sans port : ceux de
 * distanceTrajet, comme avant. Avec des ports : des chargements au port de
 * départ, et du port d'arrivée aux livraisons, par la route ; d'un port à
 * l'autre, à vol d'oiseau ; la route en tout seulement si ses deux tronçons
 * sont connus. Un seul port : ce qu'il permet de calculer, rien de plus.
 */
export async function distancesTrajet(etapes: PointTrajet[]): Promise<Kilometres> {
  const { avant, apres, portDepart, portArrivee } = cotesDuTrajet(etapes);
  if (!portDepart && !portArrivee) return { ...SANS_KM, km: await distanceTrajet(etapes) };
  const [pd, pa] = await Promise.all([portDepart ? situerPort(portDepart) : null, portArrivee ? situerPort(portArrivee) : null]);
  const [versPort, depuisPort] = await Promise.all([pd ? tronconRoutier(avant, pd, "vers") : null, pa ? tronconRoutier(apres, pa, "depuis") : null]);
  const mer = pd && pa ? Math.round(volOiseauKm(pd, pa)) : null;
  const km = versPort != null && depuisPort != null && versPort + depuisPort <= 40_000 ? versPort + depuisPort : null;
  return { km, versPort, mer, depuisPort };
}

/**
 * Recalcule et enregistre les kilomètres d'un dossier, d'après ses étapes en
 * base (après l'enregistrement des adresses sur la fiche). Jamais bloquant :
 * une erreur laisse la valeur d'avant.
 */
export async function majDistanceDossier(dossierId: number): Promise<number | null> {
  try {
    const etapes = await q<PointTrajet>("select genre, adresse, code_postal, ville, port from etapes_trajet where dossier_id=$1 order by ordre, id", [dossierId]);
    const k = await distancesTrajet(etapes);
    await q("update dossiers set distance_km=$2, distance_vers_port_km=$3, distance_mer_km=$4, distance_depuis_port_km=$5 where id=$1", [dossierId, k.km, k.versPort, k.mer, k.depuisPort]);
    return k.km;
  } catch (e) {
    console.error("Dossier : calcul des kilomètres impossible", e instanceof Error ? e.message : e);
    return null;
  }
}
