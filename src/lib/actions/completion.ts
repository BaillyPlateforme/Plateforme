"use server";

import { createServiceClient } from "@/lib/supabase/server";
import type { AnalyzedPhotoInput, ItemInput } from "@/lib/schemas";

interface AddrInput {
  ville?: string;
  adresse?: string;
  code_postal?: string;
  etage?: number | null;
  ascenseur?: boolean;
}

export interface CompletionInput {
  volume_m3?: number | null;
  volume_method?: "explicit" | "list" | "ai" | null;
  photos?: AnalyzedPhotoInput[];
  items?: ItemInput[];
  client?: { nom?: string; tel?: string };
  depart?: AddrInput;
  arrivee?: AddrInput;
  date_souhaitee?: string;
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
  if (input.client) {
    if (input.client.nom != null) update.client_nom = input.client.nom || null;
    if (input.client.tel != null) update.client_tel = input.client.tel || null;
  }
  if (input.date_souhaitee != null) update.date_souhaitee = input.date_souhaitee || null;
  applyAddr(update, "depart", input.depart);
  applyAddr(update, "arrivee", input.arrivee);

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

// Applique les champs d'une adresse (ne touche qu'aux valeurs renseignées).
function applyAddr(update: Record<string, unknown>, prefix: "depart" | "arrivee", addr?: AddrInput) {
  if (!addr) return;
  if (addr.ville) update[`${prefix}_ville`] = addr.ville;
  if (addr.adresse) update[`${prefix}_adresse`] = addr.adresse;
  if (addr.code_postal) update[`${prefix}_code_postal`] = addr.code_postal;
  if (addr.etage != null) update[`${prefix}_etage`] = addr.etage;
  if (addr.ascenseur != null) update[`${prefix}_ascenseur`] = addr.ascenseur;
}
