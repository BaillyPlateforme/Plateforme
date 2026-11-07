import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { avecDelai } from "./depot";

/*
 * Les demandes des questionnaires, pour préremplir un nouveau dossier.
 *
 * Lecture seule de la table `requests` (et `devis`, pour reprendre
 * l'estimation), avec la clé service : rien n'y est écrit. Si Supabase ne
 * répond pas, l'erreur remonte à l'écran et le formulaire reste utilisable,
 * à remplir à la main.
 */

export interface DemandeResume {
  id: string;
  created_at: string;
  client_nom: string | null;
  client_email: string | null;
  client_tel: string | null;
  depart_adresse: string | null;
  depart_ville: string | null;
  depart_code_postal: string | null;
  arrivee_adresse: string | null;
  arrivee_ville: string | null;
  arrivee_code_postal: string | null;
  date_souhaitee: string | null;
  volume_m3: number | null;
  formule: string | null;
  type_logement_depart: string | null;
  espace_nom: string | null;
}

export interface DevisDemande {
  reference: string;
  montant_ht: number;
  montant_ttc: number;
  lignes: { label: string; detail?: string; amount: number }[];
  valid_until: string | null;
  created_at: string;
}

const COLONNES = [
  "id", "created_at", "client_nom", "client_email", "client_tel",
  "depart_adresse", "depart_ville", "depart_code_postal",
  "arrivee_adresse", "arrivee_ville", "arrivee_code_postal",
  "date_souhaitee", "volume_m3", "formule", "type_logement_depart",
  "espace_nom:raw_payload->espace->>nom",
].join(",");

export async function listerDemandes(): Promise<DemandeResume[]> {
  const { data, error } = await avecDelai(
    createServiceClient().from("requests").select(COLONNES).order("created_at", { ascending: false }).limit(60),
    6000,
    "La base des demandes ne répond pas.",
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DemandeResume[];
}

export async function devisDeLaDemande(requestId: string): Promise<DevisDemande[]> {
  const { data, error } = await avecDelai(
    createServiceClient().from("devis").select("reference, montant_ht, montant_ttc, lignes, valid_until, created_at").eq("request_id", requestId).order("created_at", { ascending: false }),
    6000,
    "La base des devis ne répond pas.",
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DevisDemande[];
}
