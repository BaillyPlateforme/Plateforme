"use server";

import { createServiceClient } from "@/lib/supabase/server";
import type { AnalyzedPhotoInput, ItemInput } from "@/lib/schemas";

export interface CompletionInput {
  volume_m3?: number | null;
  volume_method?: "explicit" | "list" | "ai" | null;
  photos?: AnalyzedPhotoInput[];
  items?: ItemInput[];
  depart?: { ville?: string; adresse?: string; code_postal?: string };
  arrivee?: { ville?: string; adresse?: string; code_postal?: string };
}

export async function completeRequest(token: string, input: CompletionInput) {
  const supabase = createServiceClient();
  const { data: req } = await supabase.from("requests").select("id").eq("completion_token", token).maybeSingle();
  if (!req) return { ok: false, error: "Lien invalide ou déjà utilisé." };

  const update: Record<string, unknown> = { completion_token: null };
  if (input.volume_m3 != null) {
    update.volume_m3 = input.volume_m3;
    update.volume_method = input.volume_method ?? null;
  }
  if (input.depart) {
    if (input.depart.ville) update.depart_ville = input.depart.ville;
    if (input.depart.adresse) update.depart_adresse = input.depart.adresse;
    if (input.depart.code_postal) update.depart_code_postal = input.depart.code_postal;
  }
  if (input.arrivee) {
    if (input.arrivee.ville) update.arrivee_ville = input.arrivee.ville;
    if (input.arrivee.adresse) update.arrivee_adresse = input.arrivee.adresse;
    if (input.arrivee.code_postal) update.arrivee_code_postal = input.arrivee.code_postal;
  }

  await supabase.from("requests").update(update).eq("id", req.id);

  if (input.items?.length) {
    await supabase.from("request_items").insert(
      input.items.map((it) => ({ request_id: req.id, label: it.label, quantite: it.quantite, volume_unitaire_m3: it.volume_unitaire_m3 })),
    );
  }
  if (input.photos?.length) {
    await supabase.from("request_photos").insert(
      input.photos.map((p) => ({
        request_id: req.id, storage_path: p.storage_path, piece: p.piece,
        ai_analysis: { piece: p.piece, objets: p.objets, volume_m3: p.volume_m3 }, volume_m3: p.volume_m3,
      })),
    );
  }

  await supabase.from("request_events").insert({ request_id: req.id, type: "note", payload: { completion: true } });
  return { ok: true };
}
