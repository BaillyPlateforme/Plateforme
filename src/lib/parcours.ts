/*
 * Les trois portes d'entrée des questionnaires.
 *
 * Christian, le 4 novembre : « Vous êtes un particulier — Vous déménagez votre
 * entreprise — Vous êtes muté ». La réunion du 29 octobre en a fixé le
 * contenu :
 *
 * - le particulier a son estimation en ligne : le devis express et le devis
 *   complet, tels qu'ils existent ;
 * - le salarié muté remplit une fiche de visite, sans prix — la facturation
 *   relève des accords de son entreprise, et une visio suit toujours ;
 * - l'entreprise se partage en deux : le petit transfert (quelques bureaux,
 *   un photocopieur) décrit son mobilier, le projet important explique son
 *   projet en quelques lignes et demande à être rappelé. Sans prix tous les
 *   deux : le chiffrage des petits transferts attend l'avis de professionnels.
 *
 * Rien n'est stocké hors du formulaire : le parcours voyage dans
 * `details.parcours` de la demande, sans colonne ni migration.
 */

export type Parcours = "particulier" | "mutation" | "entreprise";
export type Transfert = "simple" | "projet";

/** Les parcours où aucun prix n'est montré, ni à l'écran ni dans les messages. */
export const SANS_PRIX: ReadonlySet<Parcours> = new Set(["mutation", "entreprise"]);

export const NOM_PARCOURS: Record<Parcours, string> = {
  particulier: "Particulier",
  mutation: "Mutation",
  entreprise: "Entreprise",
};

export const NOM_TRANSFERT: Record<Transfert, string> = {
  simple: "Petit transfert",
  projet: "Projet important",
};

/** Ce qu'une ligne de liste porte de la demande, pour en déduire le parcours. */
export type TraceParcours = {
  parcours?: string | null;
  transfert?: string | null;
  mutation?: string | boolean | null;
  espace_nom?: string | null;
};

/**
 * Le parcours d'une demande. Celles d'avant les trois portes n'en portent pas :
 * une mutation déclarée, ou un espace pro, en fait une mutation.
 */
export function parcoursDeLaDemande(t: TraceParcours): Parcours {
  if (t.parcours === "particulier" || t.parcours === "mutation" || t.parcours === "entreprise") return t.parcours;
  if (t.mutation === true || t.mutation === "true" || t.espace_nom) return "mutation";
  return "particulier";
}

export function transfertDe(t: TraceParcours): Transfert | null {
  return t.transfert === "simple" || t.transfert === "projet" ? t.transfert : null;
}

/** Le libellé court d'une demande : « Mutation », « Entreprise · projet important »… */
export function libelleParcours(t: TraceParcours & { express?: string | null }): string {
  const p = parcoursDeLaDemande(t);
  if (p === "entreprise") {
    const tr = transfertDe(t);
    return tr ? `Entreprise · ${NOM_TRANSFERT[tr].toLowerCase()}` : "Entreprise";
  }
  if (p === "particulier") return t.express === "true" ? "Particulier · express" : "Particulier · complet";
  return NOM_PARCOURS[p];
}
