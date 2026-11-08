import type { Parcours } from "@/lib/parcours";

/*
 * Une demande du site pas encore entrée au CRM, telle que le Parcours la
 * montre (colonne « Nouvelles demandes », lignes de la liste). Module pur :
 * le serveur le remplit (demandes.ts), le navigateur l'affiche.
 */

export type CarteDemande = {
  id: string;
  recueLe: string;
  source: "form" | "email";
  /** Le statut de la demande (new, analyzing, qualified, quoted, won). */
  statut: string;
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

/** Les libellés des statuts d'une demande, ceux de la page Demandes (dashboard/status.ts). */
export const STATUT_DEMANDE: Record<string, string> = {
  new: "Nouvelle",
  analyzing: "En analyse",
  qualified: "Qualifiée",
  quoted: "Devis envoyé",
  won: "Gagnée",
};
