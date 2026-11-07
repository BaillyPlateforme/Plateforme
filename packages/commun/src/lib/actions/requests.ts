"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { estimerDemande } from "@/lib/pricing/engine";
import type { RequestRow, RequestStatus } from "@/lib/types";

export async function updateStatus(id: string, status: RequestStatus) {
  const supabase = createServiceClient();
  await supabase.from("requests").update({ status }).eq("id", id);
  await supabase.from("request_events").insert({
    request_id: id,
    type: "status_changed",
    payload: { status },
  });
  revalidatePath(`/dashboard/${id}`);
  revalidatePath("/dashboard");
}

export async function updateScores(
  id: string,
  potentiel: number | null,
  difficulte: number | null,
  notes: string | null,
) {
  const supabase = createServiceClient();
  await supabase
    .from("requests")
    .update({ score_potentiel: potentiel, score_difficulte: difficulte, score_notes: notes })
    .eq("id", id);
  await supabase.from("request_events").insert({
    request_id: id,
    type: "scored",
    payload: { potentiel, difficulte },
  });
  revalidatePath(`/dashboard/${id}`);
  revalidatePath("/dashboard");
}

// Rejoue le moteur sur la demande et enregistre l'estimation.
export async function applyEstimation(id: string) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const req = data as RequestRow;

  const quote = estimerDemande(req);
  await supabase.from("requests").update({ estimation_prix: quote.ttc }).eq("id", id);
  await supabase.from("request_events").insert({
    request_id: id,
    type: "estimated",
    payload: { ttc: quote.ttc, tarif_m3: quote.tarif_m3, alertes: quote.alertes },
  });
  revalidatePath(`/dashboard/${id}`);
}

// Déplacement dans le Kanban (change le statut selon la colonne cible).
export async function moveRequestStage(id: string, stage: string) {
  const supabase = createServiceClient();
  const map: Record<string, RequestRow["status"]> = {
    qualifier: "qualified",
    devis: "quoted",
    chantier: "won",
    perdu: "lost",
  };
  const status = map[stage];
  if (!status) return;
  await supabase.from("requests").update({ status, completion_token: null }).eq("id", id);
  await supabase.from("request_events").insert({ request_id: id, type: "status_changed", payload: { stage, status } });
  revalidatePath("/dashboard");
}

export async function updateRequestFields(
  id: string,
  fields: Partial<Pick<RequestRow, "distance_km" | "formule">>,
) {
  const supabase = createServiceClient();
  await supabase.from("requests").update(fields).eq("id", id);
  revalidatePath(`/dashboard/${id}`);
}
