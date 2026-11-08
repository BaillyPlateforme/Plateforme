/*
 * Les couleurs des graphiques de statistiques et d'À la une, tirées de la
 * palette du CRM.
 *
 * L'ordre des séries est fixe (indigo, vert, ambre, rose, ciel) : il a été
 * vérifié au validateur de la méthode dataviz (écarts entre voisins lisibles
 * pour les daltonismes, ΔE ≥ 8,4 ; vision normale ΔE ≥ 23) ; vert, ambre et
 * ciel sont sous 3:1 sur le blanc, d'où les valeurs écrites à côté des
 * marques et les tableaux sous les graphiques.
 *
 * Une couleur suit une personne, jamais son rang ni la période : elle est
 * donnée une fois pour toutes, les commerciaux d'abord (dans l'ordre de leurs
 * identifiants), puis les autres utilisateurs. Au-delà de cinq, le gris.
 *
 * Les étapes ordonnées (un entonnoir, des tranches de potentiel) prennent une
 * seule teinte, du clair au foncé : rampe ordinale validée (une teinte,
 * clarté monotone, le clair à 2,6:1 sur le blanc).
 */
export const SERIES = ["#4b2fe0", "#14c27d", "#f59e0b", "#e1306c", "#0ea5e9"];
export const NEUTRE = "#a7a3b8";
/** Cinq étapes ordonnées, du clair au foncé. */
export const RAMPE = ["#a493ff", "#8a6bff", "#6f4cf2", "#4b2fe0", "#2e1f9e"];
/** Une seule série : l'indigo du CRM. */
export const UNIQUE = "#4b2fe0";
/** La seconde série d'un empilement à deux (déménagements / autres opérations). */
export const SECONDE = "#14c27d";
/** Le reste d'une série (pas encore qualifiées, mois hors période) : un pas clair de l'indigo. */
export const RETRAIT = "#d9d2ff";

/** Une rampe de `n` étapes (n ≤ 5), prise dans RAMPE en gardant ses extrémités. */
export function rampe(n: number): string[] {
  if (n >= RAMPE.length) return RAMPE;
  if (n <= 1) return [RAMPE[RAMPE.length - 1]];
  return Array.from({ length: n }, (_, i) => RAMPE[Math.round((i * (RAMPE.length - 1)) / (n - 1))]);
}

/**
 * La couleur de chaque utilisateur, stable d'une période à l'autre : les
 * commerciaux d'abord, puis les autres, chacun dans l'ordre de son
 * identifiant. « Sans commercial » au neutre.
 */
export function couleursUtilisateurs(utilisateurs: { id: number; role: string }[]): Map<number | null, string> {
  const ordre = [...utilisateurs].sort((a, b) => Number(b.role === "commercial") - Number(a.role === "commercial") || a.id - b.id);
  const m = new Map<number | null, string>(ordre.map((u, i) => [u.id, SERIES[i] ?? NEUTRE]));
  m.set(null, NEUTRE);
  return m;
}
