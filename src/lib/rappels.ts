import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";

export type StatutRappel = "a_rappeler" | "en_cours" | "rappele" | "injoignable" | "clos";

export interface RappelRow {
  id: string;
  request_id: string;
  devis_id: string | null;
  statut: StatutRappel;
  priorite: number;
  montant_ttc: number | null;
  creneau: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** Une carte du tableau : le rappel, et de quoi appeler sans ouvrir la fiche. */
export interface CarteRappel extends RappelRow {
  client_nom: string | null;
  client_tel: string | null;
  client_email: string | null;
  depart_ville: string | null;
  arrivee_ville: string | null;
  volume_m3: number | null;
}

export async function listRappels(): Promise<CarteRappel[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("rappels")
    .select("*")
    .order("priorite", { ascending: false })
    .order("created_at", { ascending: true });
  const rappels = (data ?? []) as RappelRow[];
  if (rappels.length === 0) return [];

  const { data: demandes } = await supabase
    .from("requests")
    .select("id, client_nom, client_tel, client_email, depart_ville, arrivee_ville, volume_m3")
    .in("id", [...new Set(rappels.map((r) => r.request_id))]);

  const par = new Map(((demandes ?? []) as Partial<RequestRow>[]).map((d) => [d.id, d]));
  return rappels.map((r) => {
    const d = par.get(r.request_id) ?? {};
    return {
      ...r,
      client_nom: d.client_nom ?? null,
      client_tel: d.client_tel ?? null,
      client_email: d.client_email ?? null,
      depart_ville: d.depart_ville ?? null,
      arrivee_ville: d.arrivee_ville ?? null,
      volume_m3: d.volume_m3 ?? null,
    };
  });
}

/**
 * Enregistre une demande de rappel.
 *
 * La priorité est figée ici, à partir du score de potentiel de la demande :
 * c'est ce qui ordonne le tableau, et il ne doit pas se réordonner tout seul
 * si la qualification est rejouée plus tard.
 */
export async function creerRappel(requestId: string, creneau?: string | null) {
  const supabase = createServiceClient();

  const { data: req } = await supabase
    .from("requests")
    .select("id, score_potentiel, estimation_prix")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Demande introuvable");

  const { data: devis } = await supabase
    .from("devis")
    .select("id, montant_ttc")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const r = req as Partial<RequestRow>;
  const { data, error } = await supabase
    .from("rappels")
    .insert({
      request_id: requestId,
      devis_id: devis?.id ?? null,
      priorite: Math.max(0, Math.min(100, Math.round(r.score_potentiel ?? 0))),
      montant_ttc: devis?.montant_ttc ?? r.estimation_prix ?? null,
      creneau: creneau || null,
      statut: "a_rappeler",
    })
    .select()
    .single();

  // L'index unique refuse un second rappel ouvert : le client a simplement
  // cliqué deux fois, ce n'est pas une erreur à lui montrer.
  if (error && error.code === "23505") return { deja: true as const };
  if (error) throw new Error(error.message);

  await supabase.from("request_events").insert({
    request_id: requestId,
    type: "rappel",
    payload: { statut: "a_rappeler", priorite: (data as RappelRow).priorite, creneau: creneau || null },
  });

  return { deja: false as const, rappel: data as RappelRow };
}

export async function changerStatutRappel(id: string, statut: StatutRappel) {
  const supabase = createServiceClient();
  await supabase.from("rappels").update({ statut }).eq("id", id);
}
