"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getGrid, getDefaultGrid } from "@/lib/grids";
import { getSettings } from "@/lib/settings";
import { estimateQuote } from "@/lib/quote";
import type { DevisStatus, RequestRow } from "@/lib/types";

async function nextReference(): Promise<string> {
  const supabase = createServiceClient();
  const { count } = await supabase.from("devis").select("id", { count: "exact", head: true });
  const year = new Date().getFullYear();
  return `DEV-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

// Génère (et enregistre) un devis à partir d'une demande.
export async function createDevisFromRequest(requestId: string, gridId?: string) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("requests").select("*").eq("id", requestId).maybeSingle();
  if (!data) return;
  const req = data as RequestRow;

  const grid = gridId ? await getGrid(gridId) : await getDefaultGrid();
  if (!grid) return;

  const quote = estimateQuote(req, grid);
  const settings = await getSettings();
  const reference = await nextReference();

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + (settings.devis_validite_jours || 30));

  await supabase.from("devis").insert({
    reference,
    request_id: req.id,
    client_nom: req.client_nom,
    client_email: req.client_email,
    montant_ht: quote.ht,
    montant_tva: quote.tva,
    montant_ttc: quote.ttc,
    grid_id: grid.id,
    lignes: quote.lines,
    status: "brouillon",
    valid_until: validUntil.toISOString().slice(0, 10),
  });

  await supabase
    .from("requests")
    .update({ estimation_prix: quote.ttc, grid_id: grid.id, status: "quoted" })
    .eq("id", req.id);

  revalidatePath("/dashboard/devis");
  revalidatePath(`/dashboard/${req.id}`);
}

export async function updateDevisStatus(id: string, status: DevisStatus) {
  const supabase = createServiceClient();
  await supabase.from("devis").update({ status }).eq("id", id);
  revalidatePath("/dashboard/devis");
}

export async function deleteDevis(id: string) {
  const supabase = createServiceClient();
  await supabase.from("devis").delete().eq("id", id);
  revalidatePath("/dashboard/devis");
}
