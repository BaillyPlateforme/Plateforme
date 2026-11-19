/*
 * Les quatre segments de clientèle (cahier des charges, §2) et ce que chacun
 * change dans l'espace client : la visibilité des devis et des factures, le
 * paiement des arrhes, la frise, les pièces à fournir, le SAV.
 *
 * Les règles écrites ici sont celles du cahier des charges, et rien de plus.
 * Les « règles tarifaires spécifiques » du logement social n'y sont pas :
 * elles restent à définir avec Bailly, et ni le CRM ni l'espace ne chiffrent
 * rien de particulier pour lui.
 *
 * Fonctions pures : elles servent aux pages du client, au back-office (dans
 * le navigateur aussi) et au CRM.
 */

import type { TypeClient } from "./types";

export interface Segment {
  cle: TypeClient;
  libelle: string;
  pluriel: string;
  /**
   * Le client règle lui-même : devis et factures visibles, arrhes payables en
   * ligne (§3.3). Faux pour le grand compte et le militaire.
   */
  paieEnLigne: boolean;
  /** Devis et factures : toujours visibles, masquage réglable par l'équipe, ou toujours masqués. */
  masquage: "jamais" | "reglable" | "toujours";
  /** Ce que l'équipe doit savoir du segment, repris du §2 : affiché dans le back-office et le CRM. */
  regles: string[];
  /** Le titre de l'étape de la frise qui suit les pièces propres au segment, s'il en a. */
  etapePieces: string | null;
}

export const SEGMENTS: Record<TypeClient, Segment> = {
  particulier: {
    cle: "particulier",
    libelle: "Particulier",
    pluriel: "Particuliers",
    paieEnLigne: true,
    masquage: "jamais",
    regles: ["Parcours complet, avec le paiement des arrhes en ligne.", "Pièces à fournir selon la destination.", "SAV standard."],
    etapePieces: null,
  },
  grand_compte: {
    cle: "grand_compte",
    libelle: "Grand compte",
    pluriel: "Grands comptes",
    paieEnLigne: false,
    masquage: "reglable",
    regles: [
      "Devis et factures masqués côté client : la gestion est centralisée avec le donneur d'ordre.",
      "Pas de paiement des arrhes en ligne.",
      "Le masquage se règle dossier par dossier, dans « Client et réglages ».",
    ],
    etapePieces: null,
  },
  militaire: {
    cle: "militaire",
    // Céline, 16/11/2026 : « Changer le mot militaire par CIMOB/DICOM ». La clé interne reste « militaire ».
    libelle: "CIMOB/DICOM",
    pluriel: "CIMOB/DICOM",
    paieEnLigne: false,
    masquage: "toujours",
    regles: [
      "Pièces CIMOB/DICOM (liste de Céline, 17/11/2026) : certaines seulement en cas de repli, de véhicule ou d'arrivée outre-mer, d'après le CRM.",
      "Prise en charge par bordereau de l'administration : pas de paiement d'arrhes côté client.",
      "Devis et factures masqués dans l'espace du client.",
    ],
    etapePieces: "Documents CIMOB/DICOM",
  },
  logement_social: {
    cle: "logement_social",
    libelle: "Logement social",
    pluriel: "Logements sociaux",
    paieEnLigne: true,
    masquage: "jamais",
    regles: [
      "Pièces du bailleur à fournir.",
      "Planning souvent dicté par le bailleur : caler les dates avec lui.",
      "SAV : le bailleur est prévenu de chaque déclaration, si son adresse est renseignée.",
      "Règles tarifaires spécifiques : non paramétrées, à définir avec Bailly.",
    ],
    etapePieces: "Documents du bailleur",
  },
};

export const LISTE_SEGMENTS: Segment[] = [SEGMENTS.particulier, SEGMENTS.grand_compte, SEGMENTS.militaire, SEGMENTS.logement_social];

// Object.hasOwn, pas « in » : « in » remonte la chaîne des prototypes, et « toString »,
// « constructor » ou « __proto__ » passeraient pour des segments.
export const estSegment = (t: unknown): t is TypeClient => typeof t === "string" && Object.hasOwn(SEGMENTS, t);

/** Le segment d'un type de client ; le particulier à défaut. */
export const segmentDe = (t: string | null | undefined): Segment => (estSegment(t) ? SEGMENTS[t] : SEGMENTS.particulier);

/**
 * Le segment de l'espace client d'un type de client du CRM — la même règle
 * que la fonction SQL ec_segment_du_crm (migration 0012). Le partenaire (un
 * agent, un confrère) suit le parcours du grand compte.
 */
export function segmentDuCrm(type: string | null | undefined): TypeClient {
  switch (type) {
    case "compte":
    case "partenaire":
      return "grand_compte";
    case "militaire":
      return "militaire";
    case "logement_social":
      return "logement_social";
    default:
      return "particulier";
  }
}
