import type { Parcours } from "@/lib/parcours";

/*
 * Une demande du site pas encore entrée au CRM, telle que le Parcours la
 * montre (colonne « Demandes », lignes de la liste). Module pur :
 * le serveur le remplit (demandes.ts), le navigateur l'affiche.
 */

export type CarteDemande = {
  id: string;
  recueLe: string;
  source: "form" | "email";
  /** Le statut enregistré de la demande (new, analyzing, qualified, quoted, won) ; se lit avec libelleDemande. */
  statut: string;
  /** Il manque le volume ou une adresse, ou le client n'a pas fini de la compléter. */
  incomplete: boolean;
  client: string;
  email: string | null;
  telephone: string | null;
  depart: string | null;
  arrivee: string | null;
  volume: number | null;
  /** L'estimation du site : seulement pour un particulier (les autres parcours n'ont pas de prix). */
  estimation: number | null;
  /** AAAA-MM-JJ. */
  dateSouhaitee: string | null;
  parcours: Parcours;
  /** « Particulier · express », « Mutation », « Entreprise · petit transfert »… */
  parcoursLabel: string;
  /** La société, ou l'espace pro d'où vient la demande. */
  societe: string | null;
};

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

/** Les sous-étapes de « Demande » qu'on peut choisir à la main, dans l'ordre. */
export const SOUS_ETAPES: { cle: "new" | "analyzing" | "qualified"; label: string }[] = [
  { cle: "new", label: "Nouvelle" },
  { cle: "analyzing", label: "En analyse" },
  { cle: "qualified", label: "Qualifiée" },
];

export function sousStatut(statut: string): SousStatut {
  if (statut === "quoted" || statut === "won") return "qualified";
  if (statut === "new" || statut === "analyzing" || statut === "qualified" || statut === "lost" || statut === "archived") return statut;
  return "new";
}

const LIBELLE: Record<SousStatut, string> = { new: "Nouvelle", analyzing: "En analyse", qualified: "Qualifiée", lost: "Perdue", archived: "Archivée" };

/** Le libellé d'une demande sans dossier : « Nouvelle », « En analyse », « Qualifiée », « Perdue », « Archivée ». */
export const libelleDemande = (statut: string) => LIBELLE[sousStatut(statut)];

/** Une demande sortie du parcours (refusée, perdue ou archivée). */
export const demandeClose = (statut: string) => statut === "lost" || statut === "archived";
