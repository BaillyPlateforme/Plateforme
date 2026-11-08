/*
 * Le catalogue des alertes de l'équipe : une alerte par événement, avec ce
 * qui la déclenche, où elle est branchée, et son texte. Sans rien du
 * serveur : l'écran « Alertes de l'équipe » et l'envoi le partagent.
 *
 * Les textes, sans rien inventer :
 *   - quatre alertes existaient déjà, avec leur texte dans le code de
 *     l'espace client (lib/espace-client/emails.ts) : il est repris tel quel ;
 *   - les autres reçoivent un texte neutre, qui dit les faits de l'événement
 *     et rien d'autre, marqué « à valider » tant que Bailly ne l'a pas relu
 *     (il se modifie depuis l'écran, crm.alertes_reglages).
 *
 * Abonnés d'office : personne pour une alerte nouvelle ; pour celles qui
 * existaient, ceux qui les recevaient déjà — l'adresse de
 * ESPACE_CLIENT_EMAIL_EQUIPE si elle est réglée, sinon le conseiller du
 * dossier. Rien ne change donc tant que l'équipe ne touche à rien.
 */

export type GroupeAlerte = "Dossiers" | "Commercial" | "Paiements" | "Envois";

export interface DefAlerte {
  cle: string;
  titre: string;
  groupe: GroupeAlerte;
  /** Ce qui la déclenche, en clair. */
  quand: string;
  /** Branchée sur l'événement, et où ; sinon pourquoi pas. */
  branchee: boolean;
  ou: string;
  /** Le modèle de l'espace client qui porte son texte, dans le code (lib/espace-client/emails.ts). */
  texteCode?: string;
  /** Le texte neutre de départ, à valider. Variables entre accolades. */
  depart?: { objet: string; corps: string };
  variables: string[];
  /** Ceux qui la recevaient avant les abonnements (voir plus haut). */
  heritee?: boolean;
}

/** Le destinataire « conseiller du dossier » : résolu à chaque événement. */
export const CONSEILLER = "@conseiller";

export const ALERTES: DefAlerte[] = [
  {
    cle: "pieces_completes", titre: "Pièces complètes", groupe: "Dossiers",
    quand: "Le client dépose, dans son espace, la dernière pièce obligatoire de son dossier.",
    branchee: true, ou: "Dépôt d'une pièce dans l'espace client.",
    depart: { objet: "Pièces complètes — {reference}", corps: "Toutes les pièces obligatoires du dossier {reference} ({client}) sont déposées dans l'espace client.\nDernière pièce reçue : {piece}." },
    variables: ["client", "reference", "piece"],
  },
  {
    cle: "conditions_validees", titre: "Conditions de livraison validées", groupe: "Dossiers",
    quand: "Le client valide ses conditions de livraison dans son espace.",
    branchee: true, ou: "Formulaire des conditions de livraison de l'espace client.",
    depart: { objet: "Conditions de livraison validées — {reference}", corps: "{client} a validé ses conditions de livraison (dossier {reference})." },
    variables: ["client", "reference"],
  },
  {
    cle: "cartons_demandes", titre: "Cartons demandés", groupe: "Dossiers", texteCode: "cartons_demandes_equipe", heritee: true,
    quand: "Le client demande (ou modifie) une livraison de cartons dans son espace.",
    branchee: true, ou: "Réservation des cartons dans l'espace client.",
    variables: [],
  },
  {
    cle: "recap_cartons", titre: "Tournée des cartons du samedi", groupe: "Dossiers", texteCode: "recap_cartons_equipe", heritee: true,
    quand: "La veille d'un samedi de cartons : la tournée et les bons de livraison.",
    branchee: true, ou: "Tâche de la veille (cartons du samedi).",
    variables: [],
  },
  {
    cle: "sav_declare", titre: "SAV déclaré", groupe: "Dossiers", texteCode: "avarie_equipe", heritee: true,
    quand: "Le client déclare une avarie depuis son espace.",
    branchee: true, ou: "Déclaration d'avarie de l'espace client.",
    variables: [],
  },
  {
    cle: "service_demande", titre: "Service demandé", groupe: "Commercial", texteCode: "service_demande", heritee: true,
    quand: "Le client se dit intéressé par un service (garde-meuble, nettoyage…) depuis son espace.",
    branchee: true, ou: "Page des services de l'espace client.",
    variables: [],
  },
  {
    cle: "demande_recue", titre: "Nouvelle demande du site", groupe: "Commercial",
    quand: "Une demande arrive par le formulaire du site (ou par e-mail).",
    branchee: true, ou: "Enregistrement d'une demande des questionnaires.",
    depart: { objet: "Nouvelle demande — {client}", corps: "Nouvelle demande reçue : {client}.\nTrajet : {trajet}." },
    variables: ["client", "trajet"],
  },
  {
    cle: "devis_signe", titre: "Devis signé", groupe: "Commercial",
    quand: "Un devis du CRM est signé : par le lien de signature, par l'équipe, ou accepté depuis l'espace client.",
    branchee: true, ou: "Signature d'un devis du CRM (lien, équipe, espace client).",
    depart: { objet: "Devis signé — {reference}", corps: "Le devis {numero} du dossier {reference} ({client}) est signé ({origine})." },
    variables: ["client", "reference", "numero", "origine"],
  },
  {
    cle: "rdv_annule", titre: "Rendez-vous annulé par le client", groupe: "Commercial",
    quand: "Le client répond « 2 » au SMS de son rendez-vous.",
    branchee: true, ou: "Réponses aux SMS de rendez-vous.",
    depart: { objet: "Rendez-vous annulé par SMS — {reference}", corps: "{client} a annulé son rendez-vous du {date} en répondant « 2 » au SMS." },
    variables: ["client", "reference", "date"],
  },
  {
    cle: "paiement_recu", titre: "Arrhes ou paiement reçus", groupe: "Paiements",
    quand: "Un paiement en ligne est confirmé : arrhes d'un devis ou facture.",
    branchee: true, ou: "Confirmation d'un paiement en ligne (espace client).",
    depart: { objet: "Paiement reçu — {reference}", corps: "Paiement de {montant} reçu pour le dossier {reference} ({client}) : {libelle}." },
    variables: ["client", "reference", "montant", "libelle"],
  },
  {
    cle: "facture_retard", titre: "Facture en retard", groupe: "Paiements",
    quand: "Une facture du CRM passe « en retard ».",
    branchee: false, ou: "Non branchée : le statut « en retard » existe dans la base, mais aucun écran ni aucune tâche ne le pose aujourd'hui.",
    depart: { objet: "Facture en retard — {reference}", corps: "La facture {numero} du dossier {reference} ({client}) est en retard : {montant}." },
    variables: ["client", "reference", "numero", "montant"],
  },
  {
    cle: "relance_echec", titre: "Relance en échec", groupe: "Envois",
    quand: "Une relance n'a pu partir par aucun de ses canaux.",
    branchee: true, ou: "Envoi d'une relance (veille ou Kanban).",
    depart: { objet: "Relance en échec — {reference}", corps: "La relance « {relance} » du dossier {reference} ({client}) n'est pas partie : {motif}." },
    variables: ["client", "reference", "relance", "motif"],
  },
  {
    cle: "envoi_bloque", titre: "Envoi bloqué par les garde-fous", groupe: "Envois",
    quand: "En recette, un message est bloqué : son destinataire n'est pas sur la liste blanche.",
    branchee: true, ou: "Module d'envoi de la plateforme.",
    depart: { objet: "Envoi bloqué — {modele}", corps: "Le message « {modele} » ({reference}) destiné à {destinataire} est bloqué : {motif}" },
    variables: ["modele", "reference", "destinataire", "motif"],
  },
];

export const GROUPES: GroupeAlerte[] = ["Dossiers", "Commercial", "Paiements", "Envois"];
export const alerteDe = (cle: string) => ALERTES.find((a) => a.cle === cle) ?? null;

/** Remplit {client} {reference}… ; une variable absente reste vide. */
export const remplirAlerte = (texte: string, vars: Record<string, unknown>) =>
  texte.replace(/\{([a-z_]+)\}/gi, (_, k: string) => (vars[k] == null ? "" : String(vars[k])));
