import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/types";

const DEFAULTS: SettingsRow = {
  id: true,
  entreprise_nom: "Bailly Déménagement",
  entreprise_email: null,
  entreprise_tel: null,
  entreprise_adresse: null,
  siret: null,
  signature_email: null,
  n8n_webhook_url: null,
  sms_sender: "Bailly",
  base_url: null,
  devis_validite_jours: 30,
  updated_at: new Date().toISOString(),
};

export async function getSettings(): Promise<SettingsRow> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("settings").select("*").eq("id", true).maybeSingle();
  return (data as SettingsRow) ?? DEFAULTS;
}
