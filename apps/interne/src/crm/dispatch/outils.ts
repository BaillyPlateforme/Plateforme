import type { Colonne, Ligne, Taille } from "./types";

/*
 * Les petits calculs du dispatch, sans base ni navigateur : ils servent au
 * serveur (import, proposition, exports) comme aux composants.
 */

/**
 * Capacités par défaut d'un conteneur, en m³ : des VALEURS INDICATIVES, non
 * fournies par Bailly. Ce sont les volumes intérieurs courants d'un conteneur
 * sec standard (environ 33 m³ pour un 20 pieds, 67 m³ pour un 40 pieds — le
 * module Conteneurs retenait déjà 67 m³). Le volume réellement chargeable en
 * mobilier est plus faible : chaque plan a ses propres capacités, modifiables
 * dans ses réglages et au moment de la proposition. À valider avec Bailly.
 */
export const CAPACITES_INDICATIVES: Record<Taille, number> = { "20": 33, "40": 67 };

export const capacitePour = (taille: Taille | null, plan: { capacite20: number; capacite40: number }) =>
  taille === "20" ? plan.capacite20 : taille === "40" ? plan.capacite40 : null;

/** « Fort-de-France » et « fort de france » désignent la même ville. */
export const normaliser = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** La destination d'un client, pour regrouper : le pays (ou territoire), à défaut la ville. */
export const cleDestination = (l: Pick<Ligne, "pays" | "ville">) => normaliser(l.pays) || normaliser(l.ville) || "sans destination";

export const destination = (l: Pick<Ligne, "pays" | "ville">) => [l.ville, l.pays].filter(Boolean).join(", ") || "Destination à préciser";

/** « 12,5 », « 12.5 m³ », « 12 m3 » → 12.5 ; null si la valeur ne se lit pas comme un volume. */
export function lireVolume(brut: string | number | null | undefined): number | null {
  if (typeof brut === "number") return Number.isFinite(brut) ? brut : null;
  const t = String(brut ?? "")
    .replace(/\s| | /g, "")
    .replace(/m(3|³)$/i, "")
    .replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export const m3 = (n: number | null | undefined) => `${String(Math.round(Number(n ?? 0) * 10) / 10).replace(".", ",")} m³`;
export const arrondi = (n: number) => Math.round(n * 100) / 100;
export const somme = (lignes: Pick<Ligne, "volume">[]) => arrondi(lignes.reduce((a, l) => a + l.volume, 0));

/** Le remplissage d'une colonne : volume chargé, part de la capacité, et son état. */
export function jauge(volume: number, capacite: number | null) {
  if (!capacite || capacite <= 0) return { pct: null, etat: "libre" as const, reste: null };
  const pct = (volume / capacite) * 100;
  const etat = pct > 100.001 ? ("depasse" as const) : pct >= 90 ? ("plein" as const) : ("ok" as const);
  return { pct, etat, reste: arrondi(capacite - volume) };
}

/*
 * Une couleur par destination, pour voir d'un coup d'œil « où va qui » : les
 * teintes de la palette Fusion et leurs voisines, attribuées dans l'ordre
 * alphabétique des destinations du plan (donc stables d'un écran à l'autre).
 */
const TEINTES = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#e11d48", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#d946ef", "#0891b2", "#a16207"];

export function couleursDestinations(lignes: Pick<Ligne, "pays" | "ville">[]) {
  const cles = [...new Set(lignes.map(cleDestination))].sort((a, b) => a.localeCompare(b, "fr"));
  return new Map(cles.map((c, i) => [c, TEINTES[i % TEINTES.length]]));
}

/** Le nom affiché d'une destination regroupée : le pays tel qu'il a été saisi (le plus fréquent). */
export function nomsDestinations(lignes: Pick<Ligne, "pays" | "ville">[]) {
  const comptes = new Map<string, Map<string, number>>();
  for (const l of lignes) {
    const cle = cleDestination(l);
    const nom = (l.pays || l.ville || "Destination à préciser").trim();
    const m = comptes.get(cle) ?? new Map<string, number>();
    m.set(nom, (m.get(nom) ?? 0) + 1);
    comptes.set(cle, m);
  }
  return new Map([...comptes].map(([cle, m]) => [cle, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
}

/** Les lignes d'une colonne (null : « à répartir »), dans leur ordre. */
export const lignesDe = (lignes: Ligne[], colonneId: number | null) =>
  lignes.filter((l) => l.colonneId === colonneId).sort((a, b) => a.rang - b.rang || a.id - b.id);

export const estVerrouillee = (c: Pick<Colonne, "verrouilleeLe"> | null | undefined) => !!c?.verrouilleeLe;

/** Un nom de fichier sans accents ni espaces : « Groupage Antilles » → « groupage-antilles ». */
export const slug = (s: string) => normaliser(s).replace(/\s+/g, "-").slice(0, 60) || "dispatch";

export const dateCourte = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso)) : null;
export const dateLongue = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : null;
