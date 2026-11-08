/*
 * Les quatre sortes de rendez-vous du planning commercial, telles que la
 * réunion « Point logiciel métier » (23/09/2026) les a distinguées : la
 * visite sur place, la visio, la tâche (livrer des cartons, un rendez-vous
 * médical) et la règle perso (« une semaine sur deux il a ses enfants »,
 * « le mercredi, visios uniquement »).
 *
 * Les couleurs sont des variables de crm.css (--phys, --visio, --tache,
 * --perso, et leur encre --*-ink pour le texte) : la classe `t-<type>` les
 * pose sur un élément. Le planning, sa légende, le planificateur de visite et
 * la liste des visites d'un dossier les partagent. Fonctions pures.
 */

export type TypeRdv = "phys" | "visio" | "tache" | "perso";

export const TYPES_RDV: Record<TypeRdv, { court: string; long: string; icone: string }> = {
  phys: { court: "Sur place", long: "Visite sur place", icone: "house" },
  visio: { court: "Visio", long: "Visite en visio", icone: "video" },
  tache: { court: "Tâche", long: "Tâche", icone: "box" },
  perso: { court: "Perso", long: "Perso / règle", icone: "flag" },
};

export const estTypeRdv = (v: unknown): v is TypeRdv => typeof v === "string" && v in TYPES_RDV;

/** Une règle perso qui parle de visio (« Visios uniquement », « Journée visio ») : le commercial n'y fait que des visios. */
export const parleDeVisio = (texte: string | null | undefined) => /visio/i.test(texte ?? "");

/**
 * Une journée « visio » d'un commercial : une journée entière posée en visio,
 * ou une journée entière dont le titre ou le lieu parle de visio.
 */
export const estJourneeVisio = (r: { journee: boolean; type: string; titre: string; lieu: string | null }) =>
  r.journee && (r.type === "visio" || parleDeVisio(`${r.titre} ${r.lieu ?? ""}`));
