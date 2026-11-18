/*
 * Les pièces conditionnelles (migration 0021), nées de la liste des pièces
 * CIMOB/DICOM de Céline (mail du 17/11/2026) : certaines ne se demandent
 * qu'aux clients concernés — la déclaration de valeurs du repli à qui fait un
 * repli, la carte grise à qui fait transporter un véhicule, la fiche de
 * sécurité de la batterie pour un véhicule électrique ou hybride, le
 * certificat de changement de résidence pour Mayotte…
 *
 * Ces faits vivent dans le CRM (crm.replis, crm.vehicules,
 * crm.dossiers.vehicule, crm.etapes_trajet.departement_om). L'espace client
 * ne lit jamais le schéma crm : la projection ec_projeter_situation_crm les
 * recopie sur ec_dossiers (types.ts, Dossier.repli…), et les règles
 * ci-dessous les lisent là.
 *
 * Trois réponses : oui (la pièce est demandée comme les autres), non (elle
 * n'est pas demandée), et « on ne sait pas » — dossier non relié au CRM,
 * migration pas encore appliquée, fenêtre « Repli et véhicules » jamais
 * enregistrée, département d'outre-mer pas renseigné. Dans ce dernier cas la
 * pièce n'est pas cachée : elle est montrée facultative, « si vous êtes
 * concerné » (requirementsApplicables, progression.ts).
 *
 * Fonctions pures : elles servent aux pages du client, au back-office (dans
 * le navigateur aussi) et aux tests.
 */

import type { ConditionPiece, Dossier, TypeClient } from "./types";

export interface Condition {
  cle: ConditionPiece;
  /** Ce que l'équipe lit dans l'éditeur des pièces : quand la pièce est demandée. */
  libelle: string;
  /** D'où le CRM le sait : ce qu'il faut renseigner pour que la pièce cesse d'être « si concerné ». */
  source: string;
}

export const CONDITIONS_PIECES: Record<ConditionPiece, Condition> = {
  repli: { cle: "repli", libelle: "En cas de repli", source: "« Repli et véhicules » de la fiche du CRM : repli Oui" },
  vehicule: { cle: "vehicule", libelle: "Si un véhicule est transporté", source: "« Véhicule » Oui dans la fiche du CRM" },
  vehicule_electrique: {
    cle: "vehicule_electrique",
    libelle: "Véhicule électrique ou hybride",
    source: "la motorisation de chaque véhicule, dans « Repli et véhicules »",
  },
  destination_outre_mer: { cle: "destination_outre_mer", libelle: "Arrivée outre-mer", source: "le département d'outre-mer des adresses du trajet" },
  destination_mayotte: { cle: "destination_mayotte", libelle: "Arrivée à Mayotte (976)", source: "le département d'outre-mer des adresses d'arrivée" },
};

export const LISTE_CONDITIONS: Condition[] = Object.values(CONDITIONS_PIECES);

// Object.hasOwn, pas « in » : « toString » ou « __proto__ » ne passent pas pour des conditions.
export const estCondition = (v: unknown): v is ConditionPiece => typeof v === "string" && Object.hasOwn(CONDITIONS_PIECES, v);

/** Le code de Mayotte parmi les départements d'outre-mer (apps/interne/src/crm/cimob/commun.ts). */
export const MAYOTTE = "976";

type Situation = Pick<Dossier, "repli" | "vehicules" | "vehicule_electrique" | "departements_om_depart" | "departements_om_arrivee">;

/**
 * L'arrivée est-elle outre-mer ? Oui si une adresse d'arrivée porte un
 * département d'outre-mer ; non si seul le départ en porte un (retour en
 * métropole). Ni l'un ni l'autre : un dossier CIMOB/DICOM part ou arrive
 * outre-mer par définition, c'est donc que le département n'est pas encore
 * renseigné (on ne sait pas) ; pour les autres segments, le déménagement ne
 * touche pas l'outre-mer.
 */
function arriveeOutreMer(d: Situation, segment: TypeClient): boolean | null {
  const arrivee = d.departements_om_arrivee;
  const depart = d.departements_om_depart;
  if (!Array.isArray(arrivee) || !Array.isArray(depart)) return null;
  if (arrivee.length) return true;
  if (depart.length) return false;
  return segment === "militaire" ? null : false;
}

/**
 * Le dossier est-il concerné par la condition ? true : oui ; false : non ;
 * null : le CRM ne le dit pas (la pièce reste demandée, « si vous êtes
 * concerné »). Une condition inconnue du code (posée par une version plus
 * récente) ne cache rien : null.
 */
export function conditionRemplie(condition: ConditionPiece | string, d: Situation, segment: TypeClient): boolean | null {
  switch (condition) {
    case "repli":
      return typeof d.repli === "boolean" ? d.repli : null;
    case "vehicule":
      return typeof d.vehicules === "number" ? d.vehicules > 0 : null;
    case "vehicule_electrique": {
      // Sans véhicule, pas de batterie ; un véhicule dont on ignore la motorisation : on ne sait pas.
      const vehicule = conditionRemplie("vehicule", d, segment);
      if (vehicule !== true) return vehicule;
      return typeof d.vehicule_electrique === "boolean" ? d.vehicule_electrique : null;
    }
    case "destination_outre_mer":
      return arriveeOutreMer(d, segment);
    case "destination_mayotte": {
      const om = arriveeOutreMer(d, segment);
      return om === null ? null : om && (d.departements_om_arrivee ?? []).includes(MAYOTTE);
    }
    default:
      return null;
  }
}
