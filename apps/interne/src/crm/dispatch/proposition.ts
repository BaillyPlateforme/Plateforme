import { arrondi, capacitePour, m3 } from "./outils";
import type { Contexte } from "./regroupement";
import type { ColonneProposee, ContenuProposition, Genre, Taille } from "./types";

/*
 * La mise au propre d'une proposition, d'où qu'elle vienne (IA ou règles) :
 * rien n'en sort qui ne corresponde à un client et à une colonne réels.
 *
 * L'IA peut se tromper de numéro, citer deux fois un client, en oublier un,
 * ou promettre qu'un conteneur tient alors qu'il déborde : on ne la croit pas
 * sur parole. Les volumes et les dépassements sont recalculés ici, et tout
 * client oublié revient « à répartir », avec la raison.
 */

const GENRES = new Set<Genre>(["conteneur", "tournee", "date", "zone"]);
const texte = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function finaliser(brut: unknown, ctx: Contexte): ContenuProposition {
  const p = ctx.parametres;
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const lignes = new Map(ctx.lignes.map((l) => [l.id, l]));
  const colonnes = new Map(ctx.colonnes.map((c) => [`c${c.id}`, c]));
  const charge = new Map<number, number>();
  for (const l of ctx.restantes) if (l.colonneId != null) charge.set(l.colonneId, (charge.get(l.colonneId) ?? 0) + l.volume);

  const vus = new Set<number>();
  const refs = new Set<string>();
  const alertes: string[] = (Array.isArray(b.alertes) ? b.alertes : []).map((a) => texte(a, 300)).filter(Boolean).slice(0, 12);
  let n = 0;

  const sortie: ColonneProposee[] = [];
  for (const brute of Array.isArray(b.colonnes) ? b.colonnes : []) {
    if (!brute || typeof brute !== "object") continue;
    const c = brute as Record<string, unknown>;
    let ref = texte(c.ref, 12);
    const existante = colonnes.get(ref);
    if (existante && !p.garderColonnes) continue;
    if (!existante) {
      // Une colonne à créer : seulement si le dispatcheur l'a permis.
      if (!p.nouvellesColonnes) continue;
      ref = `n${++n}`;
    }
    if (refs.has(ref)) continue;
    refs.add(ref);

    const genre: Genre = existante?.genre ?? (GENRES.has(c.genre as Genre) ? (c.genre as Genre) : p.mode);
    const taille: Taille | null = existante ? existante.taille : genre === "conteneur" ? (c.taille === "20" ? "20" : "40") : null;
    const capacite = existante ? existante.capacite : genre === "conteneur" ? capacitePour(taille, p) : p.capaciteTournee;
    const ids: number[] = [];
    for (const v of Array.isArray(c.lignes) ? c.lignes : []) {
      const id = Number(v);
      if (!lignes.has(id) || vus.has(id)) continue;
      vus.add(id);
      ids.push(id);
    }
    const libelle = existante?.libelle ?? (texte(c.libelle, 80) || `${genre === "conteneur" ? "Conteneur" : "Tournée"} ${n}`);
    sortie.push({
      ref,
      colonneId: existante?.id ?? null,
      genre,
      libelle,
      taille,
      capacite,
      zone: existante?.zone ?? (texte(c.zone, 80) || null),
      lignes: ids,
      raison: texte(c.raison, 500),
    });
  }
  // Une colonne nouvelle restée vide n'a rien à faire dans la proposition.
  const colonnesUtiles = sortie.filter((c) => c.colonneId != null || c.lignes.length > 0);

  // Les dépassements, recalculés sur les volumes réels.
  for (const c of colonnesUtiles) {
    const v = arrondi((c.colonneId != null ? charge.get(c.colonneId) ?? 0 : 0) + c.lignes.reduce((s, id) => s + (lignes.get(id)?.volume ?? 0), 0));
    if (c.capacite != null && v > c.capacite + 1e-9) alertes.unshift(`« ${c.libelle} » dépasse sa capacité de ${m3(v - c.capacite)} (${m3(v)} pour ${m3(c.capacite)}).`);
  }

  const raisons = new Map<number, string>();
  for (const x of Array.isArray(b.nonAffectees) ? b.nonAffectees : Array.isArray(b.non_affectees) ? b.non_affectees : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const id = Number(o.ligne);
    if (lignes.has(id) && !vus.has(id)) raisons.set(id, texte(o.raison, 300));
  }
  const nonAffectees = ctx.lignes
    .filter((l) => !vus.has(l.id))
    .map((l) => ({ ligne: l.id, raison: raisons.get(l.id) || "Non placé par la proposition" }));

  return { resume: texte(b.resume, 1200), colonnes: colonnesUtiles, nonAffectees, alertes: [...new Set(alertes)] };
}
