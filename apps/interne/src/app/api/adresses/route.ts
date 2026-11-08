import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import type { GenreAdresse, SuggestionAdresse } from "@/ui/adresses";

export const dynamic = "force-dynamic";

/*
 * Les suggestions d'adresses des champs du CRM (src/ui/ChampAdresse.tsx).
 *
 * La Base Adresse Nationale, interrogée par le service de géocodage de l'IGN
 * (Géoplateforme), qui remplace api-adresse.data.gouv.fr ; l'ancienne adresse
 * sert de repli si la première ne répond pas. Les deux sont gratuites et sans
 * clé. Passer par ici évite au navigateur un appel vers un autre domaine (ni
 * CSP ni CORS à régler) et garde une seule façon de faire.
 *
 * GET /api/adresses?q=12 rue de la paix&type=adresse|ville
 * → { suggestions: SuggestionAdresse[] }. Réservé à l'équipe.
 */

const SOURCES = ["https://data.geopf.fr/geocodage/search", "https://api-adresse.data.gouv.fr/search/"];
const DELAI_MS = 2500;
const NOMBRE = 6;
/** Le classement favorise ce qui est proche du dépôt (Île-de-France) ; une autre ville tapée en toutes lettres reste devant. */
const PROCHE = { lat: 48.8157, lon: 2.3849 };

/** Un petit cache en mémoire : la même frappe revient souvent (retour arrière, deux champs, deux collègues). */
const CACHE = new Map<string, { t: number; suggestions: SuggestionAdresse[] }>();
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

type Feature = {
  properties: Record<string, string | number | undefined>;
  geometry?: { coordinates?: [number, number] };
};

/** La Base Adresse refuse moins de trois caractères, et un début qui n'est ni lettre ni chiffre. */
function nettoyer(q: string | null): string | null {
  const t = (q ?? "").replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+/u, "").trim().slice(0, 200);
  return t.length >= 3 ? t : null;
}

/** « Paris 15e Arrondissement » s'écrit « Paris » sur une enveloppe : le code postal porte l'arrondissement. */
const villePostale = (v: string) => v.replace(/^(Paris|Lyon|Marseille) \d+(?:er|e) Arrondissement$/i, "$1");

/** Réduit un libellé à sa forme comparable : sans accent, sans ponctuation. */
const aplatir = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function suggestion(f: Feature): SuggestionAdresse | null {
  const p = f.properties ?? {};
  const type = String(p.type ?? "");
  if (!["housenumber", "street", "locality", "municipality"].includes(type)) return null;
  const nom = String(p.name ?? "").trim();
  const commune = String(p.city ?? p.municipality ?? nom).trim();
  const ville = villePostale(commune);
  const codePostal = String(p.postcode ?? "").trim();
  const voie = type === "municipality" ? "" : nom;
  // L'écriture du CRM : « 12 Rue de la Paix, 75002 Paris » (la ville après la dernière virgule).
  const libelle = type === "municipality" ? ville : [voie, [codePostal, ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const [numero, departement] = String(p.context ?? "").split(",").map((x) => x.trim());
  const [lon, lat] = f.geometry?.coordinates ?? [NaN, NaN];
  return {
    libelle,
    titre: type === "municipality" ? commune : libelle,
    voie,
    codePostal,
    ville,
    departement: departement ? `${departement} (${numero})` : numero ?? "",
    genre: type as GenreAdresse,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

async function interroger(source: string, q: string, ville: boolean): Promise<Feature[] | null> {
  const url = new URL(source);
  url.searchParams.set("q", q);
  // On demande large et on dédoublonne ensuite : sur un code postal, la même commune revient jusqu'à sept fois.
  url.searchParams.set("limit", "12");
  url.searchParams.set("lat", String(PROCHE.lat));
  url.searchParams.set("lon", String(PROCHE.lon));
  if (ville) url.searchParams.set("type", "municipality");
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(DELAI_MS), cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as { features?: Feature[] };
    return Array.isArray(j.features) ? j.features : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    await currentUser();
  } catch {
    return NextResponse.json({ erreur: "Réservé à l'équipe Bailly." }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const q = nettoyer(params.get("q"));
  const ville = params.get("type") === "ville" || params.get("type") === "municipality";
  if (!q) return NextResponse.json({ suggestions: [] });

  const cle = `${ville ? "v" : "a"}|${aplatir(q)}`;
  const enCache = CACHE.get(cle);
  if (enCache && Date.now() - enCache.t < CACHE_MS) return NextResponse.json({ suggestions: enCache.suggestions });

  let brut: Feature[] | null = null;
  for (const source of SOURCES) {
    brut = await interroger(source, q, ville);
    if (brut) break;
  }
  if (!brut) return NextResponse.json({ suggestions: [], erreur: "Le service d'adresses ne répond pas." }, { status: 502 });

  // Deux lignes identiques à l'œil sont un doublon, quoi qu'en dise l'API.
  const vues = new Set<string>();
  const suggestions = brut
    .map(suggestion)
    .filter((s): s is SuggestionAdresse => {
      if (!s) return false;
      const k = [aplatir(s.titre), s.codePostal, aplatir(s.departement)].join("|");
      if (vues.has(k)) return false;
      vues.add(k);
      return true;
    })
    .slice(0, NOMBRE);

  CACHE.delete(cle);
  CACHE.set(cle, { t: Date.now(), suggestions });
  while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value!);
  return NextResponse.json({ suggestions });
}
