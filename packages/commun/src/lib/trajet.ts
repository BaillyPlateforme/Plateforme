// La distance d'un trajet, calculée à partir des villes.
//
// Le formulaire la calcule dans le navigateur — mais seulement quand la ville a
// été choisie dans la liste de suggestions : c'est elle qui apporte les
// coordonnées. Une ville tapée puis laissée telle quelle partait sans
// distance, et le moteur chiffrait alors un Paris → Lyon comme un
// déménagement de quartier (tranche « 0 à 50 km »). Ce module sert des deux
// côtés : le navigateur s'en sert pour situer une ville tapée, le serveur pour
// ne jamais chiffrer sans distance.
//
// Pas de prix du tout plutôt qu'un prix faux (campagne du 18/11/2026) : la
// Base Adresse Nationale rend toujours la commune française la plus proche du
// texte tapé — « Berlin » donnait Berling (Moselle), « Barcelone » Barcelonne
// (Drôme), « Londres » Saint-Martin-de-Londres, « Montréal » Montréal (Aude) —,
// et le service d'itinéraires public rapproche un point d'outre-mer d'une
// route d'Europe (Paris → Fort-de-France : 1 940 km ; La Réunion → Seine-Saint-
// Denis : 0 km). D'où trois règles :
//   - une ville n'est située que si la base rend VRAIMENT cette commune (même
//     nom, même département quand le code postal est donné, et sans homonyme
//     qui la vaille) ;
//   - une adresse hors de France n'est jamais cherchée dans la base (elle ne
//     connaît que la France), et n'a pas de distance automatique : la grille ne
//     vaut que pour la France ;
//   - l'outre-mer n'a pas de distance routière vers ailleurs que son propre
//     territoire, et une distance par la route plus courte que le vol d'oiseau,
//     ou démesurée par rapport à lui, est écartée.

export type Point = { lat: number; lon: number };
/** Une commune située : ses coordonnées, et son code postal quand la base le donne. */
export type Commune = Point & { code_postal?: string };
export type Lieu = { ville?: string | null; code_postal?: string | null; adresse?: string | null; pays?: string | null };

const ATTENTE = 4500;
/** Le score minimal d'une réponse de la Base Adresse Nationale (de 0 à 1) ; le nom doit de toute façon être le même. */
const SCORE_MIN = 0.4;
/** Des homonymes sans code postal : la commune la plus peuplée ne l'emporte que si elle l'est dix fois plus. */
const ECART_HOMONYMES = 10;

async function lireJson(adresse: string): Promise<unknown> {
  const r = await fetch(adresse, { signal: AbortSignal.timeout(ATTENTE) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/* ───────────────────────── Les noms et les codes ───────────────────────── */

/** Un nom de lieu sous sa forme comparable : sans accent, sans ponctuation, « St » pour « Saint », sans « Cedex ». */
export function aplatirNom(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bste\b/g, "sainte")
    .replace(/\bst\b/g, "saint")
    .replace(/\s*\bcedex\b(\s+\d+)?$/, "")
    .trim();
}

/** Paris, Lyon et Marseille, entiers ou par arrondissement (« Paris », « Paris 15 », « Paris 15e Arrondissement »). */
const ARRONDISSEMENT = /^(paris|lyon|marseille)(?:\s+(\d{1,2})\s*(?:e|er|eme|ieme)?(?:\s+arrondissement)?)?$/;

/**
 * La même commune ? Le nom saisi et celui de la base, aux accents, à la
 * ponctuation et aux arrondissements près — et rien de plus : « Berlin »
 * n'est pas « Berling », ni « Londres » « Saint-Martin-de-Londres ».
 */
export function memeCommune(saisie: string, nom: string): boolean {
  const a = aplatirNom(saisie), b = aplatirNom(nom);
  if (!a || !b) return false;
  if (a === b) return true;
  const ma = a.match(ARRONDISSEMENT), mb = b.match(ARRONDISSEMENT);
  // La ville entière vaut pour chacun de ses arrondissements ; deux arrondissements nommés doivent être le même.
  return !!ma && !!mb && ma[1] === mb[1] && (!ma[2] || !mb[2] || Number(ma[2]) === Number(mb[2]));
}

/** Le département d'un code postal français : deux chiffres, trois en outre-mer (97x, 98x) ; rien pour un autre code. */
export function departementDuCodePostal(cp: string | null | undefined): string | null {
  const c = (cp ?? "").replace(/\s+/g, "");
  if (!/^\d{5}$/.test(c)) return null;
  return /^9[78]/.test(c) ? c.slice(0, 3) : c.slice(0, 2);
}

/** Le pays est-il la France — ou n'est-il pas dit (la liste de suggestions ne propose que des communes françaises) ? */
export function enFrance(pays: unknown): boolean {
  if (pays == null) return true;
  if (typeof pays !== "string") return false;
  const p = aplatirNom(pays);
  return p === "" || p === "france";
}

/**
 * Les départements et collectivités d'outre-mer : 971 à 976 (Saint-Pierre-et-
 * Miquelon, 975, compris), Saint-Barthélemy (977) et Saint-Martin (978) — qui
 * ont gardé un code postal de la Guadeloupe —, puis 986 à 988.
 */
const OUTRE_MER = new Set(["971", "972", "973", "974", "975", "976", "977", "978", "986", "987", "988"]);

/** Le territoire d'un code postal français : « metropole » (Corse comprise), un code d'outre-mer, ou rien (inconnu, Monaco). */
export function territoireDuCodePostal(cp: string | null | undefined): string | null {
  const c = (cp ?? "").replace(/\s+/g, "");
  if (!/^\d{5}$/.test(c)) return null;
  if (c === "97133") return "977";
  if (c === "97150") return "978";
  if (/^9[78]/.test(c)) return OUTRE_MER.has(c.slice(0, 3)) ? c.slice(0, 3) : null;
  return "metropole";
}

/** Une adresse en outre-mer, d'après son code postal ? */
export const estOutreMer = (cp: string | null | undefined) => {
  const t = territoireDuCodePostal(cp);
  return t != null && t !== "metropole";
};

/** Le territoire d'un point sans code postal : la France continentale et la Corse tiennent dans ce cadre. */
function territoireDuPoint(p: Point): string {
  return p.lat > 41.2 && p.lat < 51.3 && p.lon > -5.6 && p.lon < 9.8 ? "metropole" : "hors-metropole";
}

/** Le territoire d'une commune située : par son code postal, sinon par sa position. */
export function territoire(c: Partial<Commune>): string | null {
  const parCode = territoireDuCodePostal(c.code_postal);
  if (parCode) return parCode;
  return typeof c.lat === "number" && typeof c.lon === "number" && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? territoireDuPoint(c as Point) : null;
}

/* ───────────────────────── Situer une ville ───────────────────────── */

type Reponse = { properties?: { name?: unknown; city?: unknown; postcode?: unknown; score?: unknown; population?: unknown }; geometry?: { coordinates?: unknown } };

/** Ce que la recherche d'une ville a donné : la commune, une ville introuvable, des homonymes à départager, ou des services muets. */
export type Recherche = { commune: Commune } | { introuvable: true } | { homonymes: true } | { panne: true };

/**
 * La commune demandée parmi les réponses de la Base Adresse Nationale — ou la
 * raison pour laquelle aucune ne convient. Une réponse ne compte que si son
 * nom est celui qui a été tapé (score suffisant) et, quand un code postal est
 * donné, si elle est dans son département. Plusieurs homonymes dans des
 * départements différents, sans code postal pour trancher : aucune, sauf si
 * l'une est bien plus peuplée que les autres (Valence, Drôme).
 */
export function communeDemandee(reponses: unknown, ville: string, codePostal?: string | null): Exclude<Recherche, { panne: true }> {
  const liste = Array.isArray(reponses) ? (reponses as Reponse[]) : [];
  const departement = departementDuCodePostal(codePostal);
  const retenues: { commune: Commune; departement: string | null; population: number | null }[] = [];
  for (const f of liste) {
    const p = f?.properties ?? {};
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number" || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    // La base donne toujours son score ; un score trop faible écarte la réponse, quel que soit son nom.
    if (typeof p.score === "number" && p.score < SCORE_MIN) continue;
    const nom = typeof p.name === "string" ? p.name : "";
    const ville2 = typeof p.city === "string" ? p.city : "";
    if (!memeCommune(ville, nom) && !memeCommune(ville, ville2)) continue;
    const cp = typeof p.postcode === "string" ? p.postcode : "";
    const dep = departementDuCodePostal(cp);
    if (departement && dep !== departement) continue;
    retenues.push({ commune: { lat: c[1], lon: c[0], ...(cp ? { code_postal: cp } : {}) }, departement: dep, population: typeof p.population === "number" ? p.population : null });
  }
  if (!retenues.length) return { introuvable: true };
  const [premiere, ...autres] = retenues;
  const rivales = autres.filter((r) => r.departement !== premiere.departement);
  if (rivales.length && !departement) {
    const plusPeuplee = Math.max(...rivales.map((r) => r.population ?? Number.POSITIVE_INFINITY));
    if (premiere.population == null || !(premiere.population >= plusPeuplee * ECART_HOMONYMES)) return { homonymes: true };
  }
  return { commune: premiere.commune };
}

/**
 * La Base Adresse Nationale, interrogée par la Géoplateforme de l'IGN, qui
 * remplace api-adresse.data.gouv.fr ; l'ancienne adresse en repli — comme le
 * CRM (apps/interne : /api/adresses, crm/creation/distance.ts). Le 18/11/2026,
 * l'ancienne ne répondait plus du tout pendant des heures.
 */
const BASES_ADRESSES = ["https://data.geopf.fr/geocodage/search", "https://api-adresse.data.gouv.fr/search/"];

/**
 * Où se trouve une ville, d'après la Base Adresse Nationale. Si elle ne répond
 * pas (le 11/11/2026, elle renvoyait une page « sorry » : plus aucune
 * distance, donc plus aucune estimation), on se replie sur OpenStreetMap
 * (Nominatim), en France, avec la même exigence sur le nom. Une ville que la
 * base ne connaît pas reste inconnue : le repli ne sert qu'à la panne.
 */
export async function chercherVille(ville: string, codePostal?: string | null): Promise<Recherche> {
  const nom = ville.trim();
  // Un code postal qui n'est pas français ne dit rien à la base : il n'entre pas dans la recherche.
  const cp = departementDuCodePostal(codePostal) ? (codePostal ?? "").replace(/\s+/g, "") : "";
  const q = [cp, nom].filter(Boolean).join(" ");
  if (q.length < 2 || aplatirNom(nom).length < 1) return { introuvable: true };
  for (const base of BASES_ADRESSES) {
    let j: { features?: unknown };
    try {
      j = (await lireJson(`${base}?q=${encodeURIComponent(q)}&type=municipality&limit=5`)) as { features?: unknown };
    } catch {
      continue; // Muette : la suivante.
    }
    // Une base qui a répondu, même sans rien trouver : l'autre n'en saura pas plus.
    return communeDemandee(j?.features, nom, cp);
  }
  const p = await situerVilleOsm(nom, cp);
  return p ? { commune: p } : { panne: true };
}

/** La ville située, ou rien (introuvable, homonymes, services muets). */
export async function situerVille(ville: string, codePostal?: string | null): Promise<Commune | null> {
  const r = await chercherVille(ville, codePostal);
  return "commune" in r ? r.commune : null;
}

/** Ce qu'OpenStreetMap appelle une commune (pas un hameau, ni un lieu-dit). */
const COMMUNES_OSM = new Set(["city", "town", "village", "municipality"]);

/** Le repli : Nominatim (OpenStreetMap), une requête par ville, identifiée comme le demande sa charte d'usage. */
async function situerVilleOsm(ville: string, codePostal?: string | null): Promise<Commune | null> {
  const params = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "fr", city: ville.trim() });
  if (codePostal?.trim()) params.set("postalcode", codePostal.trim());
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: AbortSignal.timeout(ATTENTE),
      // Côté serveur, l'application se nomme. Côté navigateur, aucun en-tête ajouté : Nominatim refuse alors la requête (CORS).
      headers: typeof window === "undefined" ? { "User-Agent": "BaillyPlateforme/1.0 (+https://www.demenagements-bailly.com)" } : undefined,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { lat?: string; lon?: string; name?: string; addresstype?: string }[];
    const lat = Number(j?.[0]?.lat), lon = Number(j?.[0]?.lon);
    // La même exigence que pour la base : le nom rendu doit être celui qui a été demandé, et une
    // commune — « Bruxelles » trouvait un hameau du Loiret.
    if (!memeCommune(ville, j?.[0]?.name ?? "")) return null;
    const genre = j?.[0]?.addresstype;
    if (genre && !COMMUNES_OSM.has(genre)) return null;
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, ...(codePostal?.trim() ? { code_postal: codePostal.trim() } : {}) } : null;
  } catch {
    return null;
  }
}

/* ───────────────────────── Les distances ───────────────────────── */

export function volOiseauKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Une distance par la route est-elle vraisemblable ? Jamais plus courte que le
 * vol d'oiseau (au kilomètre et aux points d'accès à la route près), jamais
 * démesurée par rapport à lui.
 */
export function routeVraisemblable(km: number, volOiseau: number): boolean {
  return Number.isFinite(km) && km >= 0 && km >= volOiseau * 0.95 - 1 && km <= volOiseau * 3 + 30;
}

/**
 * La distance par la route. Si le calcul d'itinéraire ne répond pas, la
 * distance à vol d'oiseau majorée d'un quart : une route n'est jamais droite,
 * et la sous-estimer ferait tomber le prix dans la tranche d'en dessous. Une
 * route invraisemblable au regard du vol d'oiseau : rien.
 */
export async function distanceRoutiereKm(a: Point, b: Point): Promise<number | null> {
  const vol = volOiseauKm(a, b);
  try {
    const j = (await lireJson(
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,
    )) as { routes?: { distance?: number }[] };
    const m = j.routes?.[0]?.distance;
    if (typeof m === "number" && m > 0) {
      const km = Math.round(m / 1000);
      return routeVraisemblable(km, vol) ? km : null;
    }
  } catch {
    /* repli ci-dessous */
  }
  return Math.round(vol * 1.25);
}

/**
 * La distance entre deux communes situées, ou rien : l'outre-mer n'a pas de
 * route vers un autre territoire — la métropole ou un autre département
 * d'outre-mer —, quoi qu'en dise le calcul d'itinéraire.
 */
export async function distanceEntrePoints(a: Partial<Commune>, b: Partial<Commune>): Promise<number | null> {
  const ta = territoire(a), tb = territoire(b);
  if (!ta || !tb || ta !== tb) return null;
  return distanceRoutiereKm(a as Point, b as Point);
}

/**
 * La distance que le formulaire a calculée — sauf quand le trajet n'en a pas
 * par la route : une adresse hors de France, ou l'outre-mer d'un côté et un
 * autre territoire de l'autre. Le formulaire n'en envoie plus dans ces cas ;
 * le serveur ne la croit pas sur parole pour autant.
 */
export function distanceRecevable(km: number | null | undefined, depart: Lieu, arrivee: Lieu): number | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (!enFrance(depart.pays) || !enFrance(arrivee.pays)) return null;
  const td = territoireDuCodePostal(depart.code_postal), ta = territoireDuCodePostal(arrivee.code_postal);
  if (td && ta && td !== ta) return null;
  return km;
}

/** La distance entre deux lieux connus par leur ville — ou rien si l'un des deux reste introuvable, hors de France, ou de l'autre côté d'un océan. */
export async function distanceEntreVilles(depart: Lieu, arrivee: Lieu): Promise<number | null> {
  if (!depart.ville || !arrivee.ville) return null;
  // Hors de France : la base ne connaît que la France, et la grille ne vaut que pour elle.
  if (!enFrance(depart.pays) || !enFrance(arrivee.pays)) return null;
  const [a, b] = await Promise.all([
    situerVille(depart.ville, depart.code_postal),
    situerVille(arrivee.ville, arrivee.code_postal),
  ]);
  if (!a || !b) return null;
  return distanceEntrePoints(a, b);
}

/* ───────────────────────── Le trajet d'une demande ───────────────────────── */

type DemandeSituee = {
  depart_ville?: string | null;
  depart_code_postal?: string | null;
  depart_adresse?: string | null;
  arrivee_ville?: string | null;
  arrivee_code_postal?: string | null;
  arrivee_adresse?: string | null;
  raw_payload?: unknown;
};

/** Le pays d'une adresse, tel que le formulaire l'a dit (details.depart.pays) ; rien s'il ne l'a pas dit. */
export function paysDeLAdresse(raw: unknown, cote: "depart" | "arrivee"): string | undefined {
  const details = raw && typeof raw === "object" ? (raw as Record<string, unknown>).details : undefined;
  const adresse = details && typeof details === "object" ? (details as Record<string, unknown>)[cote] : undefined;
  const pays = adresse && typeof adresse === "object" ? (adresse as Record<string, unknown>).pays : undefined;
  return typeof pays === "string" && pays.trim() ? pays.trim() : undefined;
}

/** Le départ et l'arrivée d'une demande enregistrée, avec leur pays. */
export function lieuxDeLaDemande(r: DemandeSituee): { depart: Lieu; arrivee: Lieu } {
  const pays = (cote: "depart" | "arrivee") => {
    const p = paysDeLAdresse(r.raw_payload, cote);
    return p ? { pays: p } : {};
  };
  return {
    depart: { ville: r.depart_ville, code_postal: r.depart_code_postal, adresse: r.depart_adresse, ...pays("depart") },
    arrivee: { ville: r.arrivee_ville, code_postal: r.arrivee_code_postal, adresse: r.arrivee_adresse, ...pays("arrivee") },
  };
}

/**
 * La distance d'une demande, calculée une seule fois quoi qu'on la demande
 * plusieurs fois : le chiffrage et la fiche Créagidem partent en même temps,
 * et chacun la calculait de son côté (584 km pour l'un, 588 pour l'autre).
 */
export function distanceUneFois(r: DemandeSituee): () => Promise<number | null> {
  let calcul: Promise<number | null> | null = null;
  return () => {
    if (!calcul) {
      const { depart, arrivee } = lieuxDeLaDemande(r);
      calcul = distanceEntreVilles(depart, arrivee).catch(() => null);
    }
    return calcul;
  };
}
