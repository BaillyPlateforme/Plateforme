// La distance d'un trajet, calculée à partir des villes.
//
// Le formulaire la calcule dans le navigateur — mais seulement quand la ville a
// été choisie dans la liste de suggestions : c'est elle qui apporte les
// coordonnées. Une ville tapée puis laissée telle quelle partait sans
// distance, et le moteur chiffrait alors un Paris → Lyon comme un
// déménagement de quartier (tranche « 0 à 50 km »). Ce module sert des deux
// côtés : le navigateur s'en sert pour situer une ville tapée, le serveur pour
// ne jamais chiffrer sans distance.

export type Point = { lat: number; lon: number };
type Lieu = { ville?: string | null; code_postal?: string | null; adresse?: string | null };

const ATTENTE = 4500;

async function lireJson(adresse: string): Promise<unknown> {
  const r = await fetch(adresse, { signal: AbortSignal.timeout(ATTENTE) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/** Où se trouve une ville, d'après la Base Adresse Nationale. Rien si elle est inconnue. */
export async function situerVille(ville: string, codePostal?: string | null): Promise<Point | null> {
  const q = [codePostal, ville].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  if (q.length < 2) return null;
  try {
    const j = (await lireJson(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&type=municipality&limit=1`,
    )) as { features?: { geometry?: { coordinates?: [number, number] } }[] };
    const c = j.features?.[0]?.geometry?.coordinates;
    return c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? { lat: c[1], lon: c[0] } : null;
  } catch {
    return null;
  }
}

export function volOiseauKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * La distance par la route. Si le calcul d'itinéraire ne répond pas, la
 * distance à vol d'oiseau majorée d'un quart : une route n'est jamais droite,
 * et la sous-estimer ferait tomber le prix dans la tranche d'en dessous.
 */
export async function distanceRoutiereKm(a: Point, b: Point): Promise<number> {
  try {
    const j = (await lireJson(
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,
    )) as { routes?: { distance?: number }[] };
    const m = j.routes?.[0]?.distance;
    if (typeof m === "number" && m > 0) return Math.round(m / 1000);
  } catch {
    /* repli ci-dessous */
  }
  return Math.round(volOiseauKm(a, b) * 1.25);
}

/** La distance entre deux lieux connus par leur ville — ou rien si l'un des deux reste introuvable. */
export async function distanceEntreVilles(depart: Lieu, arrivee: Lieu): Promise<number | null> {
  if (!depart.ville || !arrivee.ville) return null;
  const [a, b] = await Promise.all([
    situerVille(depart.ville, depart.code_postal),
    situerVille(arrivee.ville, arrivee.code_postal),
  ]);
  if (!a || !b) return null;
  return distanceRoutiereKm(a, b);
}
