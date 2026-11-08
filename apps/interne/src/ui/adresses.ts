/*
 * Les suggestions d'adresses : ce que renvoie /api/adresses et ce que reçoit
 * le champ ChampAdresse. Un seul format, quelle que soit la source (la
 * Géoplateforme de l'IGN, ou api-adresse.data.gouv.fr en repli).
 */

export type GenreAdresse = "housenumber" | "street" | "locality" | "municipality";

export interface SuggestionAdresse {
  /** L'adresse entière, à l'écriture du CRM : « 12 Rue de la Paix, 75002 Paris » ; une commune seule : « Massy ». */
  libelle: string;
  /** La ligne en gras de la liste : le libellé, ou le nom de la commune tel que la Base Adresse le donne (« Paris 15e Arrondissement »). */
  titre: string;
  /** Le numéro et la voie (ou le lieu-dit) : « 12 Rue de la Paix ». Vide pour une commune. */
  voie: string;
  codePostal: string;
  /** La ville d'une enveloppe : « Paris », jamais « Paris 15e Arrondissement ». */
  ville: string;
  /** « Essonne (91) ». */
  departement: string;
  genre: GenreAdresse;
  lat: number | null;
  lon: number | null;
}

/**
 * Dans un formulaire non contrôlé (actions serveur), les champs voisins que
 * le choix d'une suggestion remplit, désignés par leur attribut name :
 * `{ codePostal: "code_postal_12", ville: "ville_12", pays: "pays_12" }`.
 * Le pays reçoit « France » : la Base Adresse ne connaît que la France.
 */
export interface RemplirAdresse {
  codePostal?: string;
  ville?: string;
  pays?: string;
  lat?: string;
  lon?: string;
}
