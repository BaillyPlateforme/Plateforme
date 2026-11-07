import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { SUIVI_VIDE, STATUTS, type Lead, type Suivi } from "@/lib/suivi-commun";

/*
 * Où vit le suivi des leads.
 *
 * Dans l'historique de la demande (`request_events`), sous le type « suivi » —
 * comme les rappels : aucune table à créer, aucune migration à appliquer.
 * Chaque enregistrement ajoute une ligne qui porte l'état complet ; la plus
 * récente fait foi, et les précédentes restent comme historique.
 */
const TYPE = "suivi";

const COLONNES = [
  "id", "created_at", "client_nom", "client_email", "client_tel",
  "depart_ville", "depart_code_postal", "arrivee_ville", "arrivee_code_postal",
  "volume_m3", "estimation_prix",
  "express:raw_payload->details->>express",
  "espace_nom:raw_payload->espace->>nom",
  "parcours:raw_payload->details->>parcours",
  "transfert:raw_payload->details->>transfert",
  "mutation:raw_payload->>mutation_pro",
  "societe:raw_payload->>societe",
].join(",");

type Evenement = { request_id: string; payload: Partial<Suivi> | null; created_at: string };

/** Les leads du site, du plus récent au plus ancien, avec leur dernier suivi. */
export async function listLeads(): Promise<Lead[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("requests")
    .select(COLONNES)
    .eq("source", "form")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Lecture des leads échouée : ${error.message}`);
  const demandes = (data ?? []) as unknown as Omit<Lead, "suivi">[];
  if (demandes.length === 0) return [];

  const { data: evts, error: e2 } = await supabase
    .from("request_events")
    .select("request_id, payload, created_at")
    .eq("type", TYPE)
    .in("request_id", demandes.map((d) => d.id))
    .order("created_at", { ascending: true });
  if (e2) throw new Error(`Lecture du suivi échouée : ${e2.message}`);

  // Dans l'ordre chronologique : le dernier écrit l'emporte.
  const dernier = new Map<string, Suivi>();
  for (const e of (evts ?? []) as Evenement[]) dernier.set(e.request_id, { ...SUIVI_VIDE, ...(e.payload ?? {}) });

  return demandes.map((d) => ({ ...d, suivi: dernier.get(d.id) ?? SUIVI_VIDE }));
}

const montant = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/** Enregistre le suivi d'un lead : l'état complet, fusionné avec le précédent. */
export async function enregistrerSuivi(requestId: string, modif: Partial<Suivi>, par: string): Promise<Suivi> {
  const supabase = createServiceClient();
  const { data: avant } = await supabase
    .from("request_events")
    .select("payload")
    .eq("request_id", requestId)
    .eq("type", TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ancien: Suivi = { ...SUIVI_VIDE, ...((avant?.payload as Partial<Suivi>) ?? {}) };
  const statut = modif.statut ?? ancien.statut;
  if (!STATUTS.some((s) => s.key === statut)) throw new Error("Statut inconnu");

  const suivi: Suivi = {
    statut,
    ca_attente: "ca_attente" in modif ? montant(modif.ca_attente) : ancien.ca_attente,
    ca_realise: "ca_realise" in modif ? montant(modif.ca_realise) : ancien.ca_realise,
    priorite: "priorite" in modif ? (modif.priorite ?? null) : ancien.priorite,
    note: "note" in modif ? (modif.note?.trim().slice(0, 500) || null) : ancien.note,
    maj: new Date().toISOString(),
    par,
  };

  const { error } = await supabase.from("request_events").insert({ request_id: requestId, type: TYPE, payload: suivi });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  return suivi;
}
