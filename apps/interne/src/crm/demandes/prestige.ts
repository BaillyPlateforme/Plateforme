import "server-only";
import { q } from "@/crm/lib/db";
import type { Prestige } from "./araignee";

/*
 * Le prestige de l'adresse d'une demande, lu dans crm.dvf_communes (prix
 * médian au m² des logements de la commune, DVF ; voir schema.ts et
 * scripts/importer-dvf.mjs).
 *
 * Une demande ne porte qu'une ville et, souvent, un code postal : la commune
 * (code INSEE) se trouve par le géocodeur de la Base Adresse Nationale
 * (Géoplateforme, gratuit, sans clé ; l'ancienne API Adresse en repli), une
 * fois par couple « code postal|ville », puis se garde dans
 * crm.communes_demandes. Avec un code postal, la commune retenue est celle
 * de ce code (« 75016 Paris » : Paris 16e) ; sinon, seulement une commune
 * du même nom exactement (« Paris », « Paris 15e Arrondissement »).
 * Une ville introuvable (étranger, faute de frappe) n'a pas de prestige ;
 * elle est cherchée de nouveau au bout d'une semaine.
 *
 * Jamais bloquant : un géocodeur muet laisse le prestige vide.
 */

const GEOCODEURS = ["https://data.geopf.fr/geocodage/search", "https://api-adresse.data.gouv.fr/search/"];
const DELAI_MS = 2500;
const PARALLELES = 5;
const NOUVEL_ESSAI_JOURS = 7;

const aplatir = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const cleCommune = (cp: string | null, ville: string | null) => `${(cp ?? "").replace(/\s+/g, "")}|${aplatir(ville ?? "")}`;

type Feature = { properties?: Record<string, string | number | undefined> };

async function geocoder(cp: string | null, ville: string): Promise<{ code: string; libelle: string } | null | undefined> {
  const texte = [cp, ville].filter(Boolean).join(" ");
  for (const source of GEOCODEURS) {
    try {
      const r = await fetch(`${source}?${new URLSearchParams({ q: texte, type: "municipality", limit: "5" })}`, { signal: AbortSignal.timeout(DELAI_MS), cache: "no-store" });
      if (!r.ok) continue;
      const features = ((await r.json()) as { features?: Feature[] }).features ?? [];
      const memeNom = (f: Feature) => [f.properties?.city, f.properties?.name].some((n) => n != null && aplatir(String(n)) === aplatir(ville));
      const choisie = (cp ? features.find((f) => String(f.properties?.postcode ?? "") === cp) : undefined) ?? features.find(memeNom);
      const code = choisie?.properties?.citycode;
      return code ? { code: String(code), libelle: String(choisie?.properties?.city ?? choisie?.properties?.name ?? ville) } : null;
    } catch {
      // Le suivant, ou rien.
    }
  }
  // Aucun géocodeur n'a répondu : on ne garde rien, on réessaiera.
  return undefined;
}

/** Les communes des couples « code postal, ville » : du cache, sinon du géocodeur (le cache est complété). */
async function communes(adresses: { cp: string | null; ville: string | null }[]): Promise<Map<string, string | null>> {
  const uniques = new Map<string, { cp: string | null; ville: string }>();
  for (const a of adresses) {
    const ville = a.ville?.trim();
    if (!ville) continue;
    const cp = a.cp?.replace(/\s+/g, "") || null;
    uniques.set(cleCommune(cp, ville), { cp: cp && /^\d{5}$/.test(cp) ? cp : null, ville });
  }
  const cles = [...uniques.keys()];
  const out = new Map<string, string | null>();
  if (!cles.length) return out;
  const connues = await q<{ cle: string; code_insee: string | null; vieux: boolean }>(
    `select cle, code_insee, resolu_le < now() - make_interval(days => $2) as vieux from communes_demandes where cle = any($1::text[])`,
    [cles, NOUVEL_ESSAI_JOURS],
  );
  for (const c of connues) if (c.code_insee || !c.vieux) out.set(c.cle, c.code_insee);
  const aChercher = cles.filter((c) => !out.has(c));
  for (let i = 0; i < aChercher.length; i += PARALLELES) {
    const lot = aChercher.slice(i, i + PARALLELES);
    const trouves = await Promise.all(lot.map((c) => geocoder(uniques.get(c)!.cp, uniques.get(c)!.ville)));
    const a: string[] = [];
    const b: (string | null)[] = [];
    const l: (string | null)[] = [];
    lot.forEach((c, j) => {
      if (trouves[j] === undefined) return;
      out.set(c, trouves[j]?.code ?? null);
      a.push(c);
      b.push(trouves[j]?.code ?? null);
      l.push(trouves[j]?.libelle ?? null);
    });
    if (a.length)
      await q(
        `insert into communes_demandes (cle, code_insee, libelle) select * from unnest($1::text[], $2::text[], $3::text[])
         on conflict (cle) do update set code_insee = excluded.code_insee, libelle = excluded.libelle, resolu_le = now()`,
        [a, b, l],
      );
  }
  return out;
}

type LigneDvf = { code_insee: string; libelle: string; prix_m2_median: number; ventes: number; prestige: number | null; periode: string };

/**
 * Le prestige de chaque demande : la plus haute des deux communes, départ ou
 * arrivée (un client qui quitte Neuilly comme celui qui s'y installe).
 */
export async function prestigesDe(
  demandes: { id: string; departCp: string | null; depart: string | null; arriveeCp: string | null; arrivee: string | null }[],
): Promise<Map<string, Prestige | null>> {
  const out = new Map<string, Prestige | null>();
  try {
    const parCle = await communes(demandes.flatMap((d) => [{ cp: d.departCp, ville: d.depart }, { cp: d.arriveeCp, ville: d.arrivee }]));
    const codes = [...new Set([...parCle.values()].filter((c): c is string => !!c))];
    const dvf = codes.length
      ? await q<LigneDvf>("select code_insee, libelle, prix_m2_median, ventes, prestige, periode from dvf_communes where code_insee = any($1::text[])", [codes])
      : [];
    const parCode = new Map(dvf.map((x) => [x.code_insee, x]));
    const lire = (cp: string | null, ville: string | null, ou: Prestige["ou"]): Prestige | null => {
      if (!ville?.trim()) return null;
      const code = parCle.get(cleCommune(cp?.replace(/\s+/g, "") || null, ville));
      const x = code ? parCode.get(code) : undefined;
      return x ? { score: x.prestige, prix: x.prix_m2_median, commune: x.libelle, ventes: x.ventes, periode: x.periode, ou } : null;
    };
    for (const d of demandes) {
      const a = lire(d.departCp, d.depart, "départ");
      const b = lire(d.arriveeCp, d.arrivee, "arrivée");
      out.set(d.id, !a ? b : !b ? a : (b.score ?? -1) > (a.score ?? -1) ? b : a);
    }
  } catch (e) {
    console.error("Demandes : prestige des adresses illisible", e instanceof Error ? e.message : e);
  }
  return out;
}
