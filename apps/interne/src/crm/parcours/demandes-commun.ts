import { ETAPE_DEMANDE } from "@/crm/kanban/etapes";

/*
 * Le statut enregistré d'une demande du site, lu par le Parcours, la page
 * d'une demande et l'accueil. Module pur. Une demande, telle que les deux
 * tableaux la montrent (Demandes › Kanban, colonne « Demandes » du
 * Parcours), est une DemandeVue (src/crm/demandes/etapes.ts) : la même
 * lecture pour les deux, depuis le 08/11/2026.
 */

/** Le dossier né d'une demande acceptée. */
export type DossierDeDemande = { id: number; ref: string; statut: string };

/*
 * Le statut d'une demande, vu du Parcours (unification du 08/11/2026) : une
 * demande n'est que la première étape du parcours, « Demande ». Ses statuts
 * enregistrés (public.requests.status) ne changent pas en base ; on n'en
 * montre et n'en propose que ce qui relève de cette étape :
 *
 *  - nouvelle, en analyse, qualifiée : le détail de l'étape « Demande » ;
 *  - « Devis envoyé » et « Gagnée » sont des étapes du dossier : sur une
 *    demande sans dossier (anciens gestes du Kanban des demandes), elles se
 *    lisent « Qualifiée » — la demande attend toujours qu'on l'accepte ;
 *  - perdue, archivée : la demande est sortie du parcours.
 *
 * Une demande acceptée a son dossier : c'est alors l'étape du dossier qui
 * compte, plus le statut de la demande.
 */
export type SousStatut = "new" | "analyzing" | "qualified" | "lost" | "archived";

/** Les sous-étapes de « Demande » qu'on peut choisir à la main, dans l'ordre ; leurs noms sont ceux des colonnes de Demandes. */
export const SOUS_ETAPES: { cle: "new" | "analyzing" | "qualified"; label: string }[] = [
  { cle: "new", label: ETAPE_DEMANDE.nouvelle.label },
  { cle: "analyzing", label: ETAPE_DEMANDE.analyse.label },
  { cle: "qualified", label: ETAPE_DEMANDE.qualifiee.label },
];

export function sousStatut(statut: string): SousStatut {
  if (statut === "quoted" || statut === "won") return "qualified";
  if (statut === "new" || statut === "analyzing" || statut === "qualified" || statut === "lost" || statut === "archived") return statut;
  return "new";
}

const LIBELLE: Record<SousStatut, string> = {
  new: ETAPE_DEMANDE.nouvelle.label,
  analyzing: ETAPE_DEMANDE.analyse.label,
  qualified: ETAPE_DEMANDE.qualifiee.label,
  lost: ETAPE_DEMANDE.perdue.label,
  archived: ETAPE_DEMANDE.archivee.label,
};

/** Le libellé d'une demande sans dossier : « Nouvelle », « En analyse », « Qualifiée », « Perdue », « Archivée ». */
export const libelleDemande = (statut: string) => LIBELLE[sousStatut(statut)];

/** Une demande sortie du parcours (refusée, perdue ou archivée). */
export const demandeClose = (statut: string) => statut === "lost" || statut === "archived";
