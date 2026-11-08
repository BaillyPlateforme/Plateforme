/*
 * Ce que chaque duplication reprend et ce qu'elle ne reprend jamais : une
 * seule liste, lue par les fenêtres de duplication (avant) et par les
 * bandeaux du nouvel objet (après). Le vocabulaire est un seul mot,
 * « Dupliquer », partout dans le CRM (« Copier » reste réservé au
 * presse-papiers : un lien, un identifiant).
 *
 * Textes nouveaux du 08/11/2026, à valider par David et l'équipe Bailly.
 * Module pur : le serveur et le navigateur le lisent.
 */

export const A_VALIDER = "Textes à valider";

export interface Inventaire {
  repris: string[];
  jamais: string[];
}

export const DOSSIER_IDENTIQUE: Inventaire = {
  repris: [
    "Le même client",
    "Le trajet complet : chaque étape, étages, ascenseurs, accès et codes",
    "L'inventaire, ses pièces et le volume",
    "Le type de déménagement, le garde-meuble, le véhicule",
    "Les services complémentaires, remis « prévus » et sans date",
    "Les observations, la période souhaitée, le commercial et « traité par »",
  ],
  jamais: [
    "Les devis (sauf si vous cochez la case : en brouillon, avec un nouveau numéro)",
    "La signature, les factures et les règlements",
    "Les visites et rendez-vous, les lettres de voiture",
    "Les dates de chargement et de livraison",
    "Les pièces jointes, photos et documents",
    "Les litiges, et l'espace client lui-même (rien n'y est recopié)",
  ],
};

/** Un client, un espace (src/crm/lib/espace.ts) : la règle de tout nouveau dossier vaut pour une copie. */
export const DOSSIER_ESPACE =
  "Si le client a déjà un espace client, ce nouveau dossier le rejoint, comme tout nouveau dossier, dès que ce qu'il faut est renseigné.";

/** Les cases de « Dupliquer pour un nouveau client ». Trajet et observations décochés d'office : ils décrivent un autre foyer. */
export const CASES_NOUVEAU_CLIENT = [
  { cle: "trajet", libelle: "Trajet et accès", aide: "Étages, ascenseurs, codes : le domicile d'un autre foyer. À cocher pour le même lieu (même immeuble, même site).", defaut: false },
  { cle: "inventaire", libelle: "Inventaire", aide: "Les objets, leurs pièces et le volume.", defaut: true },
  { cle: "options", libelle: "Options et type", aide: "Type de déménagement, garde-meuble, véhicule, segment du client.", defaut: true },
  { cle: "observations", libelle: "Observations", aide: "Elles parlent souvent du client lui-même : relisez-les.", defaut: false },
] as const;
export type CleCase = (typeof CASES_NOUVEAU_CLIENT)[number]["cle"];

export const DOSSIER_NOUVEAU_JAMAIS =
  "Jamais repris : l'identité et les coordonnées du client, les devis, factures, règlements, visites, pièces jointes et l'espace client.";

export const DEVIS: Inventaire = {
  repris: [
    "Le chiffrage : lignes, remise, assurance (ses taux)",
    "Les prestations, les conditions et les achats prévus",
    "La catégorie (formule) et le titre",
    "Dans le même dossier, aussi : distance, poids lourds, déplacement, moyens",
  ],
  jamais: [
    "Le numéro : la copie prend le suivant",
    "L'envoi, la signature et son lien, la validation",
    "Sa date et sa validité : celles du jour",
    "D'un autre dossier : valeurs déclarées, coûts réels, distance et moyens",
  ],
};

export const FACTURE: Inventaire = {
  repris: [
    "Le genre (facture, arrhes ou solde) et l'objet",
    "Les lignes : désignation, quantité, prix HT, TVA, lignes sans montant",
    "Les conditions de règlement",
  ],
  jamais: [
    "Le numéro : donné à l'émission, à la suite des factures émises",
    "La date : celle de l'émission",
    "Les règlements et leur affectation",
    "Les déductions d'arrhes, propres au dossier d'origine",
    "Le client facturé : celui du dossier de destination, figé à l'émission",
  ],
};

export const CLIENT: Inventaire = {
  repris: [
    "Le type de client et la société",
    "L'adresse de facturation, le SIREN, la TVA intracommunautaire",
    "L'entreprise (espace pro)",
    "Les notes",
  ],
  jamais: [
    "La civilité, le prénom et le nom",
    "L'e-mail et les téléphones",
    "Les autres contacts, les dossiers, devis, factures et l'espace client",
  ],
};
