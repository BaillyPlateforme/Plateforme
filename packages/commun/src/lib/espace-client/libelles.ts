// Libellés des statuts et des choix, partagés par l'espace client et le back-office.

import type { Escalier, MonteMeuble, ModeTransport, ReponsePoidsLourd, Stationnement, StatutDossier, StatutLivraisonCartons, StatutSav, TypeFacture } from "./types";

export const STATUT_DEVIS = {
  envoye: { label: "En attente de votre accord", ton: "todo" },
  accepte: { label: "Accepté", ton: "ok" },
  refuse: { label: "Non retenu", ton: "neutre" },
  expire: { label: "Expiré", ton: "neutre" },
} as const;

export const STATUT_FACTURE = {
  a_payer: { label: "À régler", ton: "todo" },
  payee: { label: "Payée", ton: "ok" },
  en_retard: { label: "En retard", ton: "warn" },
} as const;

export const TYPE_FACTURE: Record<TypeFacture, string> = {
  arrhes: "Arrhes",
  solde: "Solde",
  garde_meubles: "Garde-meubles",
};

export const STATUT_SAV: Record<StatutSav, { label: string; ton: "ok" | "todo" | "warn" }> = {
  recue: { label: "Reçue", ton: "todo" },
  en_analyse: { label: "En cours d'analyse", ton: "warn" },
  cloturee: { label: "Clôturée", ton: "ok" },
};

export const STATUT_DOSSIER: Record<StatutDossier, string> = {
  en_preparation: "En préparation",
  planifie: "Planifié",
  en_cours: "En cours",
  termine: "Terminé",
};

export const STATUT_LIVRAISON: Record<StatutLivraisonCartons, { label: string; ton: "ok" | "todo" | "neutre" }> = {
  demandee: { label: "Demandée", ton: "todo" },
  confirmee: { label: "Confirmée", ton: "ok" },
  livree: { label: "Livrée", ton: "neutre" },
};

export const ESCALIER: Record<Escalier, string> = {
  aucun: "Pas d'escalier",
  droit: "Droit",
  colimacon: "Colimaçon",
  etroit: "Étroit (moins de 80 cm)",
};

export const STATIONNEMENT: Record<Stationnement, string> = {
  facile: "Place facile devant l'immeuble",
  autorisation: "Autorisation de voirie nécessaire",
  reserve_client: "Je réserve moi-même",
};

export const POIDS_LOURD: Record<ReponsePoidsLourd, string> = {
  oui: "Oui",
  non: "Non",
  ne_sait_pas: "Je ne sais pas",
};

export const MONTE_MEUBLE: Record<MonteMeuble, string> = {
  oui: "Oui",
  non: "Non",
  a_evaluer: "À évaluer",
};

export const PARTICULARITES_RUE = ["Rue étroite", "Rue piétonne", "Sens unique", "Forte pente", "Aucune"] as const;

export const MODE_TRANSPORT: Record<ModeTransport, string> = {
  route: "Route",
  maritime: "Maritime",
  aerien: "Aérien",
};

/** L'étage, en toutes lettres : 0 est le rez-de-chaussée, 9 « 9e étage ou plus ». */
export function libelleEtage(n: number) {
  if (n <= 0) return "Rez-de-chaussée";
  if (n >= 9) return "9e étage ou plus";
  return `${n}${n === 1 ? "er" : "e"} étage`;
}

export const CATEGORIES_DOCUMENT_EQUIPE: [string, string][] = [
  ["assurance", "Attestation d'assurance"],
  ["transport", "Lettre de voiture"],
  ["douane", "Document douanier"],
  ["devis", "Devis signé"],
  ["autre", "Autre"],
];

/** Le nom lisible de chaque modèle de message, pour le journal. */
export const MODELES_MESSAGE: Record<string, string> = {
  acces: "Lien d'accès",
  document_depose: "Document déposé",
  creneau_cartons: "Créneau des cartons",
  cartons_demandes_equipe: "Cartons demandés (équipe)",
  paiement_confirme: "Paiement reçu",
  avarie_recue: "Avarie : accusé de réception",
  avarie_equipe: "Avarie déclarée (équipe)",
  avarie_bailleur: "Avarie déclarée (bailleur)",
  message_conseiller: "Message au conseiller",
  service_demande: "Service demandé (équipe)",
  demande_avis: "Demande d'avis",
  recap_cartons_equipe: "Récapitulatif des cartons (équipe)",
  creneaux_visite: "Créneaux de visite proposés",
};
