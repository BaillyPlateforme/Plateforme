import "server-only";
import { q } from "@/crm/lib/db";
import { situerVille, volOiseauKm, type Point } from "@/lib/trajet";

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
 */

export interface PointTrajet {
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  lat?: number | null;
  lon?: number | null;
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
  const utiles = etapes.filter((e) => (e.adresse ?? "").trim() || (e.ville ?? "").trim() || (typeof e.lat === "number" && typeof e.lon === "number"));
  if (utiles.length < 2) return null;
  const points = await Promise.all(utiles.map(situer));
  if (points.some((p) => !p)) return null;
  const km = await route(points as Point[]);
  return km >= 0 && km <= 40_000 ? km : null;
}

/**
 * Recalcule et enregistre les kilomètres d'un dossier, d'après ses étapes en
 * base (après l'enregistrement des adresses sur la fiche). Jamais bloquant :
 * une erreur laisse la valeur d'avant.
 */
export async function majDistanceDossier(dossierId: number): Promise<number | null> {
  try {
    const etapes = await q<PointTrajet>("select adresse, code_postal, ville from etapes_trajet where dossier_id=$1 order by ordre, id", [dossierId]);
    const km = await distanceTrajet(etapes);
    await q("update dossiers set distance_km=$2 where id=$1", [dossierId, km]);
    return km;
  } catch (e) {
    console.error("Dossier : calcul des kilomètres impossible", e instanceof Error ? e.message : e);
    return null;
  }
}
