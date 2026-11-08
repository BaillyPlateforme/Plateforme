/*
 * Les couleurs des graphiques de statistiques, tirées de la palette du CRM.
 *
 * L'ordre des séries est fixe (indigo, vert, ambre, rose, ciel) : il a été
 * vérifié au validateur de la méthode dataviz (écarts entre voisins lisibles
 * pour les daltonismes, ΔE ≥ 8,4) ; vert, ambre et ciel sont sous 3:1 sur le
 * blanc, d'où les étiquettes visibles et les tableaux à côté des graphiques.
 * Une couleur suit une personne ou une équipe, jamais son rang : elle est
 * donnée dans l'ordre des identifiants. Au-delà de cinq, le gris.
 *
 * Les étapes de l'entonnoir (visites → devis → signés) sont ordonnées : une
 * seule teinte, du clair au foncé (rampe ordinale validée).
 */
export const SERIES = ["#4b2fe0", "#14c27d", "#f59e0b", "#e1306c", "#0ea5e9"];
export const NEUTRE = "#a7a3b8";
export const RAMPE_ENTONNOIR = ["#a493ff", "#7a52ff", "#4b2fe0"];
/** Un seul sens (une seule série) : l'indigo du CRM. */
export const UNIQUE = "#4b2fe0";
/** La seconde série d'un empilement à deux (déménagements / autres opérations). */
export const SECONDE = "#14c27d";

/** La couleur de chaque entité, dans l'ordre de ses identifiants ; les sans-identifiant au neutre. */
export function couleursPar<T extends { id: number | null }>(lignes: T[]): Map<number | null, string> {
  const ids = [...new Set(lignes.map((l) => l.id).filter((x): x is number => x != null))].sort((a, b) => a - b);
  const m = new Map<number | null, string>(ids.map((id, i) => [id, SERIES[i] ?? NEUTRE]));
  m.set(null, NEUTRE);
  return m;
}
