// Constantes et helpers partagés (client + serveur) pour la messagerie.

export type Channel = "email" | "sms";

/** Ce qu'un modèle emporte en plus de son texte. */
export interface TemplateOptions {
  /** Pièce jointe automatique : l'estimation en PDF, ou rien. */
  piece_jointe?: "estimation" | null;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: Channel;
  event: string;
  sujet: string | null;
  contenu: string;
  options: TemplateOptions | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Les pièces jointes proposées à l'équipe. */
export const PIECES_JOINTES: { key: "" | "estimation"; label: string; aide: string }[] = [
  { key: "", label: "Aucune", aide: "Le message part seul." },
  {
    key: "estimation",
    label: "L'estimation en PDF",
    aide: "Jointe dès qu'une estimation existe pour la demande. Sans estimation, le message part quand même.",
  },
];

export type RuleKind = "workflow" | "alerte";

export interface AlertRow {
  id: string;
  name: string;
  kind: RuleKind;
  event: string;
  montant_min: number | null;
  channel: Channel;
  destinataire: "client" | "custom";
  destinataire_custom: string | null;
  template_id: string | null;
  condition_champ: string | null; // 'volume' | 'depart' | 'arrivee'
  condition_source: string | null; // 'form' | 'email'
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Événements déclencheurs disponibles.
export const MESSAGE_EVENTS: { key: string; label: string }[] = [
  { key: "demande_recue", label: "Nouvelle demande reçue" },
  { key: "demande_complete", label: "Demande complète" },
  { key: "demande_incomplete", label: "Demande incomplète (à compléter)" },
  { key: "demande_completee", label: "Demande complétée (via le lien)" },
  { key: "devis_cree", label: "Devis créé" },
  { key: "devis_envoye", label: "Devis envoyé" },
  { key: "devis_accepte", label: "Devis accepté" },
  { key: "devis_refuse", label: "Devis refusé" },
  { key: "manual", label: "Manuel (aucun déclenchement auto)" },
];

export function eventLabel(key: string): string {
  return MESSAGE_EVENTS.find((e) => e.key === key)?.label ?? key;
}

// Variables utilisables dans les modèles.
export const TEMPLATE_VARIABLES: { token: string; label: string; groupe: string }[] = [
  { token: "{{client_nom}}", label: "Nom du client", groupe: "Client" },
  { token: "{{client_email}}", label: "E-mail du client", groupe: "Client" },
  { token: "{{client_tel}}", label: "Téléphone du client", groupe: "Client" },

  { token: "{{ville_depart}}", label: "Ville de départ", groupe: "Déménagement" },
  { token: "{{ville_arrivee}}", label: "Ville d'arrivée", groupe: "Déménagement" },
  { token: "{{volume}}", label: "Volume (m³)", groupe: "Déménagement" },
  { token: "{{distance}}", label: "Distance (km)", groupe: "Déménagement" },
  { token: "{{date}}", label: "Date souhaitée", groupe: "Déménagement" },
  { token: "{{formule}}", label: "Formule retenue", groupe: "Déménagement" },

  { token: "{{reference}}", label: "Référence de l'estimation", groupe: "Estimation" },
  { token: "{{montant_ttc}}", label: "Montant TTC", groupe: "Estimation" },
  { token: "{{montant_ht}}", label: "Montant HT", groupe: "Estimation" },
  { token: "{{validite}}", label: "Date de validité", groupe: "Estimation" },

  { token: "{{entreprise_nom}}", label: "Nom de l'entreprise", groupe: "Entreprise" },
  { token: "{{entreprise_tel}}", label: "Téléphone de l'entreprise", groupe: "Entreprise" },
  { token: "{{entreprise_email}}", label: "E-mail de l'entreprise", groupe: "Entreprise" },

  { token: "{{lien_completion}}", label: "Lien pour compléter la demande", groupe: "Liens" },
  { token: "{{lien_estimation}}", label: "Lien vers l'estimation en ligne", groupe: "Liens" },
];

/**
 * Les blocs : des morceaux entiers de message, mis en page pour vous.
 *
 * Posés seuls sur une ligne, ils se remplacent par un vrai bloc HTML — un
 * tableau, un bouton, un encadré. C'est ce qui permet à l'équipe de choisir
 * ce que le message contient sans écrire une ligne de HTML.
 */
export const TEMPLATE_BLOCS: { token: string; label: string; aide: string }[] = [
  { token: "{{bloc_recapitulatif}}", label: "Récapitulatif du déménagement", aide: "Trajet, volume, date, formule." },
  { token: "{{bloc_estimation}}", label: "Détail de l'estimation", aide: "Les lignes du chiffrage, HT, TVA et TTC." },
  { token: "{{bouton_estimation}}", label: "Bouton « Voir mon estimation »", aide: "Renvoie vers l'estimation en ligne." },
  { token: "{{bouton_completer}}", label: "Bouton « Compléter ma demande »", aide: "Renvoie vers le formulaire de complétion." },
  { token: "{{bloc_contact}}", label: "Encadré « Nous contacter »", aide: "Téléphone et adresse de l'agence." },
];

export type MessageContext = Record<string, string | number | boolean | null | undefined>;

// Remplace {{variable}} par les valeurs du contexte.
export function renderTemplate(text: string, ctx: MessageContext): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    const v = ctx[key];
    return v == null ? "" : String(v);
  });
}
