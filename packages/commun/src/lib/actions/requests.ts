"use server";

import { exigerEquipe, getUserAffichage } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { estimerDemande } from "@/lib/pricing/engine";
import { journaliserEquipe } from "@/lib/journal";
import type { RequestRow, RequestStatus } from "@/lib/types";

/**
 * L'auteur d'un geste, inscrit dans l'historique de la demande (`par`) : le
 * Feed le montre. Lu dans le cookie de session, sans aller-retour — l'action
 * a déjà vérifié que c'est l'équipe.
 */
async function par(): Promise<string | null> {
  return (await getUserAffichage().catch(() => null))?.email ?? null;
}

export async function updateStatus(id: string, status: RequestStatus) {
  await exigerEquipe();
  const supabase = createServiceClient();
  await supabase.from("requests").update({ status }).eq("id", id);
  await supabase.from("request_events").insert({
    request_id: id,
    type: "status_changed",
    payload: { status, par: await par() },
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
  await exigerEquipe();
  const supabase = createServiceClient();
  await supabase
    .from("requests")
    .update({ score_potentiel: potentiel, score_difficulte: difficulte, score_notes: notes })
    .eq("id", id);
  await supabase.from("request_events").insert({
    request_id: id,
    type: "scored",
    payload: { potentiel, difficulte, par: await par() },
  });
  revalidatePath(`/dashboard/${id}`);
  revalidatePath("/dashboard");
}

// Rejoue le moteur sur la demande et enregistre l'estimation.
export async function applyEstimation(id: string) {
  await exigerEquipe();
  const supabase = createServiceClient();
  const { data } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const req = data as RequestRow;

  const quote = estimerDemande(req);
  await supabase.from("requests").update({ estimation_prix: quote.ttc }).eq("id", id);
  await supabase.from("request_events").insert({
    request_id: id,
    type: "estimated",
    payload: { ttc: quote.ttc, tarif_m3: quote.tarif_m3, alertes: quote.alertes, par: await par() },
  });
  revalidatePath(`/dashboard/${id}`);
}

// Déplacement dans le Kanban (change le statut selon la colonne cible).
export async function moveRequestStage(id: string, stage: string) {
  await exigerEquipe();
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
  await supabase.from("request_events").insert({ request_id: id, type: "status_changed", payload: { stage, status, par: await par() } });
  revalidatePath("/dashboard");
}

export async function updateRequestFields(
  id: string,
  fields: Partial<Pick<RequestRow, "distance_km" | "formule">>,
) {
  await exigerEquipe();
  const supabase = createServiceClient();
  const { data } = await supabase.from("requests").update(fields).eq("id", id).select("client_nom");
  revalidatePath(`/dashboard/${id}`);
  const r = data?.[0] as { client_nom: string | null } | undefined;
  if (r) {
    const quoi = [
      fields.distance_km !== undefined && `distance : ${fields.distance_km == null ? "effacée" : `${fields.distance_km} km`}`,
      fields.formule !== undefined && `formule : ${fields.formule ?? "effacée"}`,
    ].filter(Boolean).join(", ");
    await journaliserEquipe({
      action: "demande.modifie", libelle: `Demande${r.client_nom ? ` de ${r.client_nom}` : ""} modifiée${quoi ? ` (${quoi})` : ""}`,
      objet: { type: "demande", id }, requestId: id, details: { ...fields },
    });
  }
}
