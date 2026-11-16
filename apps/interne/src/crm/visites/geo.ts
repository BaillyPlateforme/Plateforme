import "server-only";
import type { Point } from "./proximite";

/*
 * Situer une adresse et mesurer la route, pour placer les visites
 * (proximite.ts). Deux services publics, gratuits et sans clé, déjà ceux de
 * la plateforme :
 *   - la Base Adresse Nationale, par le géocodeur de l'IGN (Géoplateforme),
 *     api-adresse.data.gouv.fr en repli — comme /api/adresses ;
 *   - OSRM (OpenStreetMap), pour la distance par la route — comme
 *     l'estimation du prix (lib/trajet.ts). Un seul appel par planning : la
 *     table des distances de chaque visite jusqu'au client.
 * Un service qui ne répond pas ne bloque rien : sans coordonnées, pas de
 * distance ; sans OSRM, la distance est estimée (« ≈ », proximite.ts).
 *
 * Les adresses situées restent en mémoire une journée (une adresse ne bouge
 * pas) ; une adresse introuvable, dix minutes.
 */

const GEOCODEURS = ["https://data.geopf.fr/geocodage/search", "https://api-adresse.data.gouv.fr/search/"];
const OSRM = "https://router.project-osrm.org/table/v1/driving";
const DELAI_MS = 3000;
/** Sous ce score, la Base Adresse a deviné : mieux vaut ne pas situer que situer faux. */
const SCORE_MIN = 0.4;
/** OSRM limite la taille d'une table : au-delà, les distances sont estimées. */
const OSRM_MAX = 90;
const EN_PARALLELE = 6;

const g = globalThis as typeof globalThis & { __crmGeo?: Map<string, { t: number; point: Point | null }> };
const CACHE = (g.__crmGeo ??= new Map());
const GARDE_MS = 24 * 3_600_000;
const GARDE_ECHEC_MS = 10 * 60_000;
const CACHE_MAX = 2000;

const cle = (adresse: string) =>
  adresse
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Reponse = { features?: { geometry?: { coordinates?: [number, number] }; properties?: { score?: number } }[] };

async function interroger(source: string, q: string): Promise<Point | null | undefined> {
  const url = new URL(source);
  url.searchParams.set("q", q.slice(0, 200));
  url.searchParams.set("limit", "1");
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(DELAI_MS), cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) return undefined;
    const f = ((await r.json()) as Reponse).features?.[0];
    const c = f?.geometry?.coordinates;
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || (f?.properties?.score ?? 1) < SCORE_MIN) return null;
    return { lat: c[1], lon: c[0] };
  } catch {
    return undefined;
  }
}

/** Les coordonnées d'une adresse (ou d'une ville), ou null si la Base Adresse ne la trouve pas. */
export async function situer(adresse: string | null | undefined): Promise<Point | null> {
  const q = (adresse ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 3) return null;
  const k = cle(q);
  const connu = CACHE.get(k);
  if (connu && Date.now() - connu.t < (connu.point ? GARDE_MS : GARDE_ECHEC_MS)) return connu.point;
  let point: Point | null = null;
  for (const source of GEOCODEURS) {
    const r = await interroger(source, q);
    if (r === undefined) continue; // le service ne répond pas : le suivant
    point = r;
    break;
  }
  CACHE.delete(k);
  CACHE.set(k, { t: Date.now(), point });
  while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value!);
  return point;
}

/** Plusieurs adresses à la fois, six par six : une Map de l'adresse à ses coordonnées. */
export async function situerTout(adresses: string[]): Promise<Map<string, Point | null>> {
  const uniques = [...new Set(adresses.filter(Boolean))];
  const out = new Map<string, Point | null>();
  for (let i = 0; i < uniques.length; i += EN_PARALLELE) {
    const lot = uniques.slice(i, i + EN_PARALLELE);
    const points = await Promise.all(lot.map((a) => situer(a)));
    lot.forEach((a, j) => out.set(a, points[j]));
  }
  return out;
}

/**
 * La distance par la route de chaque point de `depuis` jusqu'à `vers`, en
 * kilomètres, par OSRM ; null pour chacun si OSRM ne répond pas (ou au-delà
 * de la taille d'une table).
 */
export async function distancesParLaRoute(depuis: Point[], vers: Point): Promise<(number | null)[]> {
  if (!depuis.length) return [];
  if (depuis.length > OSRM_MAX) return depuis.map(() => null);
  const coords = [vers, ...depuis].map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const sources = depuis.map((_, i) => i + 1).join(";");
  try {
    const r = await fetch(`${OSRM}/${coords}?sources=${sources}&destinations=0&annotations=distance`, {
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
      headers: { accept: "application/json", "User-Agent": "BaillyPlateforme/1.0 (+https://www.demenagements-bailly.com)" },
    });
    if (!r.ok) return depuis.map(() => null);
    const j = (await r.json()) as { code?: string; distances?: (number | null)[][] };
    if (j.code !== "Ok" || !Array.isArray(j.distances)) return depuis.map(() => null);
    return depuis.map((_, i) => {
      const m = j.distances?.[i]?.[0];
      return typeof m === "number" && Number.isFinite(m) && m >= 0 ? m / 1000 : null;
    });
  } catch {
    return depuis.map(() => null);
  }
}
