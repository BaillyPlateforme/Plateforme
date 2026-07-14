// Constantes et helpers partagés (client + serveur) pour la messagerie.

export type Channel = "email" | "sms";

export interface MessageTemplate {
  id: string;
  name: string;
  channel: Channel;
  event: string;
  sujet: string | null;
  contenu: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

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

// Variables utilisables dans les templates.
export const TEMPLATE_VARIABLES: { token: string; label: string }[] = [
  { token: "{{client_nom}}", label: "Nom du client" },
  { token: "{{client_email}}", label: "Email du client" },
  { token: "{{client_tel}}", label: "Téléphone du client" },
  { token: "{{reference}}", label: "Référence du devis" },
  { token: "{{montant_ttc}}", label: "Montant TTC" },
  { token: "{{montant_ht}}", label: "Montant HT" },
  { token: "{{ville_depart}}", label: "Ville de départ" },
  { token: "{{ville_arrivee}}", label: "Ville d'arrivée" },
  { token: "{{volume}}", label: "Volume (m³)" },
  { token: "{{date}}", label: "Date souhaitée" },
  { token: "{{entreprise_nom}}", label: "Nom de l'entreprise" },
  { token: "{{lien_completion}}", label: "Lien pour compléter la demande" },
];

export type MessageContext = Record<string, string | number | boolean | null | undefined>;

// Remplace {{variable}} par les valeurs du contexte.
export function renderTemplate(text: string, ctx: MessageContext): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => {
    const v = ctx[key];
    return v == null ? "" : String(v);
  });
}
