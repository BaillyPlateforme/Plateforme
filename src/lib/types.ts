// Types de la base — maintenus à la main pour l'instant.
// À terme : `supabase gen types typescript` pour les générer depuis le schéma.

export type RequestSource = "form" | "email";

export type RequestStatus =
  | "new"
  | "analyzing"
  | "qualified"
  | "quoted"
  | "won"
  | "lost"
  | "archived";

export type VolumeMethod = "explicit" | "list" | "ai";

export interface RequestRow {
  id: string;
  source: RequestSource;
  status: RequestStatus;

  client_nom: string | null;
  client_email: string | null;
  client_tel: string | null;

  depart_adresse: string | null;
  depart_code_postal: string | null;
  depart_ville: string | null;
  depart_etage: number | null;
  depart_ascenseur: boolean | null;

  arrivee_adresse: string | null;
  arrivee_code_postal: string | null;
  arrivee_ville: string | null;
  arrivee_etage: number | null;
  arrivee_ascenseur: boolean | null;

  date_souhaitee: string | null;
  flexibilite: string | null;

  volume_m3: number | null;
  volume_method: VolumeMethod | null;

  type_logement_depart: string | null;
  type_logement_arrivee: string | null;
  distance_km: number | null;
  formule: string | null;
  services: RequestServices;
  estimation_prix: number | null;
  grid_id: string | null;

  score_potentiel: number | null;
  score_difficulte: number | null;
  score_notes: string | null;

  raw_payload: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface RequestServices {
  emballage?: boolean;
  demontage?: boolean;
  montage?: boolean;
  monte_meuble?: boolean;
  garde_meuble?: boolean;
}

export interface PricingGridRow {
  id: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
  base_price: number;
  price_per_m3: number;
  price_per_km: number;
  floor_surcharge: number;
  long_carry_surcharge: number;
  packing_price_per_m3: number;
  furniture_lift_price: number;
  min_price: number;
  vat_rate: number;
  tiers: Array<{ min_m3: number; max_m3: number; price_per_m3: number }>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestPhotoRow {
  id: string;
  request_id: string;
  storage_path: string;
  piece: string | null;
  ai_analysis: PhotoAnalysis | null;
  volume_m3: number | null;
  created_at: string;
}

export interface RequestItemRow {
  id: string;
  request_id: string;
  label: string;
  quantite: number;
  volume_unitaire_m3: number;
  created_at: string;
}

export interface RequestEventRow {
  id: string;
  request_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export type DevisStatus = "brouillon" | "envoye" | "accepte" | "refuse" | "expire";

export interface DevisRow {
  id: string;
  reference: string;
  request_id: string | null;
  client_nom: string | null;
  client_email: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  grid_id: string | null;
  lignes: Array<{ label: string; amount: number }>;
  status: DevisStatus;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientProfileRow {
  email: string;
  nom: string | null;
  telephone: string | null;
  societe: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type EmailStatus = "envoye" | "echec" | "brouillon";

export interface EmailRow {
  id: string;
  destinataire: string;
  client_email: string | null;
  sujet: string;
  corps: string;
  template: string | null;
  status: EmailStatus;
  erreur: string | null;
  created_at: string;
}

export interface TeamMemberRow {
  id: string;
  email: string;
  nom: string | null;
  role: string;
  actif: boolean;
  created_at: string;
}

export interface SettingsRow {
  id: boolean;
  entreprise_nom: string;
  entreprise_email: string | null;
  entreprise_tel: string | null;
  entreprise_adresse: string | null;
  siret: string | null;
  signature_email: string | null;
  n8n_webhook_url: string | null;
  sms_sender: string | null;
  devis_validite_jours: number;
  updated_at: string;
}

// Résultat structuré de l'analyse d'une photo par l'IA
export interface PhotoAnalysis {
  piece: string;
  objets: Array<{ label: string; quantite: number; volume_m3: number }>;
  volume_m3: number;
}

// Minimal typing pour le client Supabase (on affinera avec la génération auto).
export interface Database {
  public: {
    Tables: {
      requests: {
        Row: RequestRow;
        Insert: Partial<RequestRow> & Pick<RequestRow, "source">;
        Update: Partial<RequestRow>;
      };
      request_photos: {
        Row: RequestPhotoRow;
        Insert: Partial<RequestPhotoRow> & Pick<RequestPhotoRow, "request_id" | "storage_path">;
        Update: Partial<RequestPhotoRow>;
      };
      request_items: {
        Row: RequestItemRow;
        Insert: Partial<RequestItemRow> & Pick<RequestItemRow, "request_id" | "label">;
        Update: Partial<RequestItemRow>;
      };
      request_events: {
        Row: RequestEventRow;
        Insert: Partial<RequestEventRow> & Pick<RequestEventRow, "request_id" | "type">;
        Update: Partial<RequestEventRow>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      request_source: RequestSource;
      request_status: RequestStatus;
      volume_method: VolumeMethod;
    };
  };
}
