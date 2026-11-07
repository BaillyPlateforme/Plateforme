/*
 * Le modèle de données de l'espace client.
 *
 * Chaque liste du document `Donnees` est une table Postgres du même nom,
 * préfixée `ec_` (supabase/migrations/0011_espace_client.sql) : `dossiers`
 * vit dans `ec_dossiers`, et ses colonnes portent exactement les noms des
 * champs ci-dessous. En démonstration (ESPACE_CLIENT_DONNEES=demo), le même
 * document vit en mémoire. Voir depot.ts.
 *
 * Règle structurante, héritée de la v0 : devis, documents, factures, cartons
 * et SAV se rattachent au DOSSIER, jamais au client. Un client qui déménage
 * deux fois a deux dossiers, et chacun garde ses pièces.
 */

/**
 * Le segment du client (cahier des charges, §2) : ses règles de visibilité,
 * ses pièces à fournir et sa frise en dépendent (segments.ts).
 */
export type TypeClient = "particulier" | "grand_compte" | "militaire" | "logement_social";

/** Le conseiller présenté au client : nom, ligne directe, adresse. */
export interface Conseiller {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  /** Vide : l'espace affiche le standard de l'agence. */
  telephone: string;
  /** Un conseiller fictif du jeu de démonstration. */
  demo: boolean;
  /** L'utilisateur du CRM dont il est la fiche : le commercial du dossier (migration 0012). */
  crm_utilisateur_id?: number | null;
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
   * Le compte Supabase Auth du client : sans mot de passe, marqué
   * app_metadata.role = "client". Créé par le serveur au premier lien
   * d'accès ; null en démonstration et tant qu'aucun lien n'est parti.
   */
  auth_user_id: string | null;
  /**
   * « Couper les sessions » : toute session ouverte avant cet instant ne vaut
   * plus rien — après un lien transféré par erreur, un téléphone perdu.
   */
  sessions_revoquees_le: string | null;
  /** Un client fictif du jeu de démonstration (adresse @example.com). */
  demo: boolean;
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
  /**
   * Le dossier du CRM dont l'espace est la face client (migration 0012). Le
   * CRM tient alors le client, le trajet, les dates, les devis et les
   * factures : ils arrivent ici par projection et ne se modifient que là-bas.
   */
  crm_dossier_id?: number | null;
  /** Passé en commande dans le CRM : devis signé, ou prise en charge sans devis d'un militaire. */
  commande_le?: string | null;
  /** Logement social : le bailleur, prévenu de chaque déclaration de SAV. Réglé dans l'espace. */
  bailleur_nom?: string | null;
  bailleur_email?: string | null;
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
  /** Le devis du CRM qu'il projette : il ne se modifie que dans le CRM. */
  crm_devis_id?: number | null;
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
  /** La facture du CRM qu'elle projette. */
  crm_facture_id?: number | null;
  /** Ou le paiement du CRM (les arrhes), montré comme une facture réglée. */
  crm_paiement_id?: number | null;
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
  /** null : exigée quel que soit le segment ; sinon, des seuls clients de ce segment. */
  segment: TypeClient | null;
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
  /** Où sont les octets, dans le seau privé (fichiers.ts). Absent du seau : un PDF témoin est servi. */
  chemin: string;
  nom_fichier: string;
  taille_octets: number;
  mime: string;
  requirement_id: string | null;
  created_by: string;
  created_at: string;
  /** Le compte-rendu de visite signé dont ce document est le PDF (migration 0013). */
  crm_visite_id?: number | null;
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
 * Un lien d'accès (table ec_liens_acces). Il porte le `hashed_token` émis par
 * Supabase Auth ; on n'en garde que l'empreinte, de sorte qu'une copie de la
 * table ne donne accès à aucun espace. Hors du document `Donnees` : seul le
 * serveur le lit (acces.ts).
 */
export interface LienAcces {
  empreinte: string;
  client_id: string;
  /** Le compte Auth que le lien doit ouvrir — null en démonstration. */
  auth_user_id: string | null;
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

/**
 * Un créneau de visite technique proposé au client (migration 0013). Il
 * projette un créneau du CRM, qui tient le planning des commerciaux : le
 * client le choisit ici, la réservation se fait dans le CRM.
 */
export interface CreneauVisite {
  id: string;
  dossier_id: string;
  crm_creneau_id: number;
  crm_proposition_id: number;
  debut: string;
  duree_min: number;
  mode: "sur_place" | "visio";
  statut: "propose" | "retenu" | "libere";
  /** Le commercial qui viendra. */
  conseiller: string;
  /** Le client a demandé d'autres créneaux. */
  autres_demandes_le: string | null;
}

export type StatutVisite = "planifiee" | "en_cours" | "realisee" | "signee";

/** Une visite technique du dossier, et le résumé de son compte-rendu une fois signé (migration 0013). */
export interface VisiteTechnique {
  id: string;
  dossier_id: string;
  /** « r12 » : le rendez-vous 12 du CRM ; « v7 » : une visite saisie sans rendez-vous. */
  cle: string;
  crm_rendez_vous_id: number | null;
  crm_visite_id: number | null;
  debut: string | null;
  duree_min: number | null;
  mode: "sur_place" | "visio";
  conseiller: string;
  statut: StatutVisite;
  signe_le: string | null;
  signataire: string | null;
  /** L'empreinte SHA-256 du contenu signé. */
  empreinte: string | null;
  volume_m3: number | null;
  pieces: number | null;
  photos: number | null;
  /** Le PDF du compte-rendu, parmi les documents du dossier. */
  document_id: string | null;
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
  sessions_paiement: SessionPaiement[];
  creneaux: CreneauVisite[];
  visites: VisiteTechnique[];
}
