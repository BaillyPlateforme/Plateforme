/*
 * Le modèle de données de l'espace client.
 *
 * Il ne vit dans aucune table : le client n'applique pas de migration, et la
 * base Supabase ne doit pas bouger. Tout tient dans un seul document JSON —
 * en mémoire pour la démonstration, dans le stockage de fichiers de Supabase
 * en production (voir depot.ts). Les noms de champs reprennent ceux de la v0,
 * qui les avait calqués sur des tables : le jour où une migration passera, le
 * passage en tables se fera sans rien renommer.
 *
 * Règle structurante, héritée de la v0 : devis, documents, factures, cartons
 * et SAV se rattachent au DOSSIER, jamais au client. Un client qui déménage
 * deux fois a deux dossiers, et chacun garde ses pièces.
 */

export type TypeClient = "particulier" | "grand_compte";

/** Le conseiller présenté au client : nom, ligne directe, adresse. */
export interface Conseiller {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
}

export interface Client {
  id: string;
  type: TypeClient;
  civilite: "Madame" | "Monsieur" | null;
  prenom: string;
  nom: string;
  /** Raison sociale, pour un grand compte. */
  societe: string | null;
  email: string;
  telephone: string;
  /** Grands comptes seulement : les devis et les factures se règlent avec l'entreprise. */
  masquer_devis: boolean;
  masquer_factures: boolean;
  conseiller_id: string;
  /**
   * Inscrite dans le cookie de session. L'augmenter coupe d'un coup toutes
   * les sessions ouvertes du client — après un lien transféré par erreur.
   */
  version_acces: number;
  created_at: string;
}

export type Portee = "national" | "international";
export type ModeTransport = "route" | "maritime" | "aerien";
export type StatutDossier = "en_preparation" | "planifie" | "en_cours" | "termine";

export interface Dossier {
  id: string;
  client_id: string;
  /** BD-AAAA-NNNN : ce que le client lit, et ce que porte l'adresse de son espace. */
  reference: string;
  /** La demande des questionnaires d'où vient le dossier, s'il y en a une. */
  request_id: string | null;
  ville_depart: string;
  ville_arrivee: string;
  adresse_depart: string;
  adresse_arrivee: string;
  /** Dates seules, AAAA-MM-JJ. */
  periode_debut: string;
  periode_fin: string;
  portee: Portee;
  mode_transport: ModeTransport;
  /** Code ISO à deux lettres : FR, CA… */
  pays_destination: string;
  statut: StatutDossier;
  volume_m3: number;
  formule: string;
  /** « T3 · 68 m² » : affiché à côté du volume, facultatif. */
  logement: string | null;
  /* Suivi du conteneur — international maritime ou aérien. */
  compagnie: string | null;
  numero_conteneur: string | null;
  url_tracking: string | null;
  statut_conteneur: string | null;
  navire: string | null;
  port_depart: string | null;
  port_arrivee: string | null;
  eta: string | null;
  /** Le client a dit ne pas avoir besoin de cartons. */
  cartons_non_necessaires: boolean;
  /** La photo de la page de garde : un chemin du catalogue de photos.ts. */
  photo: string;
  /** Fin de chantier signée : le déménagement est réalisé. */
  termine_le: string | null;
  /** La demande d'avis est partie (une seule fois par dossier). */
  avis_demande_le: string | null;
  created_at: string;
}

export type StatutDevis = "envoye" | "accepte" | "refuse" | "expire";

export interface LigneDevis {
  libelle: string;
  detail?: string;
  montant_ht: number;
}

export interface Devis {
  id: string;
  dossier_id: string;
  numero: string;
  formule: string;
  lignes: LigneDevis[];
  /** Ce que la formule comprend, en mots courts : affiché en pastilles. */
  inclus: string[];
  montant_ht: number;
  montant_ttc: number;
  /** 0 : pas d'arrhes (grands comptes, en général). */
  arrhes_pourcentage: number;
  statut: StatutDevis;
  emis_le: string;
  valide_jusqu_au: string;
  accepte_le: string | null;
}

export type TypeFacture = "arrhes" | "solde" | "garde_meubles";
export type StatutFacture = "a_payer" | "payee" | "en_retard";

export interface Facture {
  id: string;
  dossier_id: string;
  devis_id: string | null;
  numero: string;
  type: TypeFacture;
  libelle: string;
  montant_ttc: number;
  statut: StatutFacture;
  emise_le: string;
  echeance: string;
  /** Mois couvert, pour le garde-meubles (AAAA-MM). */
  periode: string | null;
  payee_le: string | null;
  paiement_ref: string | null;
}

/** Une pièce à fournir. Les listes sont tenues par l'équipe, destination par destination. */
export interface DocumentRequirement {
  id: string;
  /** null : exigée quelle que soit la destination. */
  pays: string | null;
  libelle: string;
  description: string;
  obligatoire: boolean;
  ordre: number;
}

export type SourceDocument = "client" | "equipe";

export interface DocumentFichier {
  id: string;
  dossier_id: string;
  categorie: string;
  libelle: string;
  source: SourceDocument;
  /** Où sont les octets (fichiers.ts). Absent du stockage : un PDF témoin est servi. */
  chemin: string;
  nom_fichier: string;
  taille_octets: number;
  mime: string;
  requirement_id: string | null;
  created_by: string;
  created_at: string;
}

/** Une photo jointe à un formulaire : conditions de livraison ou déclaration d'avarie. */
export interface PieceJointe {
  id: string;
  chemin: string;
  nom: string;
  taille: number;
  mime: string;
}

export type TypeAcceptation = "cgv" | "rgpd" | "conditions_livraison" | "declaration_valeurs" | "devis";

/** La trace d'un engagement du client : quoi, quelle version du texte, quand, depuis où. */
export interface Acceptation {
  id: string;
  dossier_id: string;
  type: TypeAcceptation;
  version_texte: string;
  accepted_at: string;
  ip: string;
  user_agent: string;
  /** Ce qui a été accepté, quand ce n'est pas un texte : le numéro du devis. */
  objet?: string | null;
}

export interface ObjetDeclare {
  categorie: string;
  designation: string;
  quantite: number;
  valeur_unitaire: number;
}

export interface DeclarationValeursContenu {
  declarant_nom: string;
  declarant_qualite: string;
  lieu: string;
  date: string;
  objets: ObjetDeclare[];
}

export interface DeclarationValeurs {
  id: string;
  dossier_id: string;
  contenu: DeclarationValeursContenu;
  total: number;
  statut: "brouillon" | "soumise";
  soumise_at: string | null;
}

export type Escalier = "aucun" | "droit" | "colimacon" | "etroit";
export type Stationnement = "facile" | "autorisation" | "reserve_client";
export type ReponsePoidsLourd = "oui" | "non" | "ne_sait_pas";
export type MonteMeuble = "oui" | "non" | "a_evaluer";

export interface ConditionsLivraison {
  id: string;
  dossier_id: string;
  adresse_livraison: string;
  /** 0 : rez-de-chaussée ; 9 : neuvième étage ou plus. */
  etage: number;
  ascenseur: boolean;
  /** Dimensions intérieures de la cabine, en centimètres. */
  ascenseur_dimensions: { largeur: number; profondeur: number; hauteur: number } | null;
  escalier: Escalier;
  distance_portage_m: number;
  acces_poids_lourd: ReponsePoidsLourd;
  stationnement: Stationnement;
  particularites_rue: string[];
  monte_meuble: MonteMeuble;
  horaires_restreints: string | null;
  photos: PieceJointe[];
  commentaire: string | null;
  valide_at: string | null;
}

export type StatutLivraisonCartons = "demandee" | "confirmee" | "livree";

export interface LivraisonCartons {
  id: string;
  dossier_id: string;
  date_samedi: string;
  adresse: string;
  complement: string | null;
  code_acces: string | null;
  contact_nom: string;
  contact_tel: string;
  /** Saisi par l'équipe, d'après le volume. */
  nb_cartons: number | null;
  ordre_passage: number | null;
  creneau_debut: string | null; // HH:MM
  creneau_fin: string | null;
  lat: number | null;
  lng: number | null;
  statut: StatutLivraisonCartons;
  /** Le message de la veille est parti : on ne le renvoie pas deux fois. */
  creneau_envoye_le: string | null;
  created_at: string;
}

export type StatutSav = "recue" | "en_analyse" | "cloturee";

export interface SavDeclaration {
  id: string;
  dossier_id: string;
  numero: string;
  reserves_emises: boolean;
  date_constat: string;
  objets: string;
  description: string;
  photos: PieceJointe[];
  statut: StatutSav;
  created_at: string;
}

export interface Tuto {
  id: string;
  titre: string;
  resume: string;
  categorie: string;
  duree_min: number;
  /** Vignette de la liste : une photo de public/espace-client. */
  image: string;
  etapes: string[];
  url_video: string | null;
  ordre: number;
  actif: boolean;
}

export interface Service {
  id: string;
  titre: string;
  accroche: string;
  contenu: string;
  prix_indicatif: string | null;
  ordre: number;
  actif: boolean;
}

export type CanalNotification = "email" | "sms";

/**
 * Toute notification, envoyée ou non, laisse une ligne ici : c'est le journal
 * que l'équipe consulte, et d'où elle prévisualise chaque message.
 */
export interface Notification {
  id: string;
  dossier_id: string | null;
  canal: CanalNotification;
  modele: string;
  destinataire: string;
  sujet: string;
  payload: Record<string, unknown>;
  /** « journalisee » : rien n'est parti, l'envoi réel est désactivé (ESPACE_CLIENT_ENVOI). */
  statut: "journalisee" | "envoyee" | "echec";
  erreur?: string | null;
  sent_at: string;
}

/**
 * Un lien d'accès. Le jeton lui-même n'est jamais conservé : seule son
 * empreinte l'est, de sorte qu'une copie du fichier de données ne donne
 * accès à aucun espace.
 */
export interface JetonAcces {
  empreinte: string;
  client_id: string;
  /** Le dossier à ouvrir en arrivant, quand le lien vise un dossier précis. */
  reference: string | null;
  expire_at: string;
  utilise_at: string | null;
}

export interface SessionPaiement {
  id: string;
  cible: "facture" | "devis_arrhes";
  cible_id: string;
  dossier_id: string;
  montant: number;
  libelle: string;
  statut: "ouverte" | "payee" | "annulee";
  reference: string | null;
  /** D'où le client a lancé le paiement : l'acceptation du devis s'horodate avec. */
  trace: { ip: string; user_agent: string } | null;
  created_at: string;
}

export interface Donnees {
  version: number;
  conseillers: Conseiller[];
  clients: Client[];
  dossiers: Dossier[];
  devis: Devis[];
  factures: Facture[];
  document_requirements: DocumentRequirement[];
  documents: DocumentFichier[];
  acceptations: Acceptation[];
  declarations_valeurs: DeclarationValeurs[];
  conditions_livraison: ConditionsLivraison[];
  livraisons_cartons: LivraisonCartons[];
  sav_declarations: SavDeclaration[];
  tutos: Tuto[];
  services: Service[];
  notifications: Notification[];
  jetons_acces: JetonAcces[];
  sessions_paiement: SessionPaiement[];
}
