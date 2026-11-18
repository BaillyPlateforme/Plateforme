/* Les formes partagées de la duplication, lues par le serveur et par le navigateur. */

/** Un dossier proposé comme destination d'une duplication (devis, facture). */
export interface DossierCible {
  id: number;
  ref: string;
  statut: string;
  volume: number;
  client: string;
  trajet: string;
}

/** Une étape telle que la création la préremplit. */
export interface EtapeSource {
  adresse: string | null;
  etage: string | null;
  ascenseur: boolean;
  acces: string | null;
  /** CIMOB/DICOM : le département d'outre-mer de l'adresse. */
  departement_om?: string | null;
}

/** Un dossier à dupliquer pour un nouveau client (/dossiers/nouveau?depuis=<id>). */
export interface SourceDuplication {
  id: number;
  ref: string;
  clientId: number;
  client: string;
  /** Le segment de son client. */
  type: string;
  typeDemenagement: string;
  volume: number;
  vehicule: boolean;
  gardeMeuble: boolean;
  observations: string | null;
  depart: EtapeSource | null;
  arrivee: EtapeSource | null;
  /** Les étapes entre le départ et l'arrivée (reprises avec le trajet, côté serveur). */
  intermediaires: number;
  objets: number;
  pieces: number;
}
