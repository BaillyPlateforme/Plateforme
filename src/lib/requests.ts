import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { fireEvent } from "@/lib/alerts";
import { qualifyRequest } from "@/lib/qualification";
import type { CreateRequestInput, ItemInput, AnalyzedPhotoInput } from "@/lib/schemas";
import type { RequestRow, RequestSource } from "@/lib/types";

type ResolvedVolume = {
  volume_m3: number | null;
  volume_method: "explicit" | "list" | "ai" | null;
  items: ItemInput[];
  photos: AnalyzedPhotoInput[];
};

// Convertit un volume (3 méthodes) en (volume_m3, method) prêts à stocker.
function resolveVolume(volume: CreateRequestInput["volume"]): ResolvedVolume {
  if (!volume) return { volume_m3: null, volume_method: null, items: [], photos: [] };

  if (volume.method === "explicit") {
    return { volume_m3: volume.volume_m3, volume_method: "explicit", items: [], photos: [] };
  }
  if (volume.method === "list") {
    const total = volume.items.reduce(
      (sum, it) => sum + it.quantite * it.volume_unitaire_m3,
      0,
    );
    return { volume_m3: round2(total), volume_method: "list", items: volume.items, photos: [] };
  }
  // 'ai' : volume = somme des volumes estimés par photo (déjà analysées).
  const total = volume.photos.reduce((sum, p) => sum + p.volume_m3, 0);
  return { volume_m3: round2(total), volume_method: "ai", items: [], photos: volume.photos };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Crée une demande. Chemin unique pour le formulaire ET pour n8n (mail).
export async function createRequest(
  input: CreateRequestInput,
  source: RequestSource,
): Promise<RequestRow> {
  const supabase = createServiceClient();
  const { volume_m3, volume_method, items, photos } = resolveVolume(input.volume);

  const insert: Partial<RequestRow> & Pick<RequestRow, "source"> = {
    source,
    status: "new",
    client_nom: input.client.nom,
    client_email: input.client.email,
    client_tel: input.client.tel ?? null,

    depart_adresse: input.depart.adresse ?? null,
    depart_code_postal: input.depart.code_postal ?? null,
    depart_ville: input.depart.ville ?? null,
    depart_etage: input.depart.etage ?? null,
    depart_ascenseur: input.depart.ascenseur ?? null,
    type_logement_depart: input.depart.type_logement ?? null,

    arrivee_adresse: input.arrivee.adresse ?? null,
    arrivee_code_postal: input.arrivee.code_postal ?? null,
    arrivee_ville: input.arrivee.ville ?? null,
    arrivee_etage: input.arrivee.etage ?? null,
    arrivee_ascenseur: input.arrivee.ascenseur ?? null,
    type_logement_arrivee: input.arrivee.type_logement ?? null,

    date_souhaitee: input.date_souhaitee ?? null,
    flexibilite: input.flexibilite ?? null,
    formule: input.formule ?? null,
    distance_km: input.distance_km ?? null,
    services: input.services ?? {},

    volume_m3,
    volume_method,
    raw_payload: input as unknown as Record<string, unknown>,
  };

  const { data: request, error } = await supabase
    .from("requests")
    .insert(insert)
    .select()
    .single();

  if (error || !request) {
    throw new Error(`Création de la demande échouée : ${error?.message ?? "aucune ligne"}`);
  }
  const created = request as RequestRow;

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("request_items").insert(
      items.map((it) => ({
        request_id: created.id,
        label: it.label,
        quantite: it.quantite,
        volume_unitaire_m3: it.volume_unitaire_m3,
      })),
    );
    if (itemsError) throw new Error(`Insertion des items échouée : ${itemsError.message}`);
  }

  if (photos.length > 0) {
    const { error: photosError } = await supabase.from("request_photos").insert(
      photos.map((p) => ({
        request_id: created.id,
        storage_path: p.storage_path,
        piece: p.piece,
        ai_analysis: { piece: p.piece, objets: p.objets, volume_m3: p.volume_m3 },
        volume_m3: p.volume_m3,
      })),
    );
    if (photosError) throw new Error(`Insertion des photos échouée : ${photosError.message}`);
  }

  await supabase.from("request_events").insert({
    request_id: created.id,
    type: "created",
    payload: { source },
  });

  // Complétude : mêmes règles que pour les mails entrants.
  const manque_volume = created.volume_m3 == null;
  const manque_depart = !created.depart_ville;
  const manque_arrivee = !created.arrivee_ville;
  const incomplet = manque_volume || manque_depart || manque_arrivee;

  // Un jeton (et donc un lien de complétion) n'est créé que si une info manque.
  let token: string | null = null;
  if (incomplet) {
    token = randomUUID();
    await supabase.from("requests").update({ completion_token: token }).eq("id", created.id);
    created.completion_token = token;

    const manque: string[] = [];
    if (manque_volume) manque.push("Volume");
    if (manque_depart) manque.push("Adresse de départ");
    if (manque_arrivee) manque.push("Adresse d'arrivée");
    await supabase.from("request_events").insert({ request_id: created.id, type: "incomplete", payload: { manque } });
  }

  const settings = await getSettings();
  const base = (settings.base_url || "").replace(/\/$/, "");
  const lien = token ? (base ? `${base}/completer/${token}` : `/completer/${token}`) : "";

  const ctx = {
    request_id: created.id,
    source: created.source,
    client_nom: created.client_nom,
    client_email: created.client_email,
    client_tel: created.client_tel,
    ville_depart: created.depart_ville,
    ville_arrivee: created.arrivee_ville,
    volume: created.volume_m3,
    date: created.date_souhaitee,
    lien_completion: lien,
    manque_volume,
    manque_depart,
    manque_arrivee,
  };

  await fireEvent("demande_recue", ctx);
  if (incomplet) {
    await fireEvent("demande_incomplete", ctx);
  } else {
    await fireEvent("demande_complete", ctx);
    // Demande complète → qualification (devis + analyse notée).
    await qualifyRequest(created.id);
  }

  return created;
}

import type { RequestPhotoRow, RequestItemRow, RequestEventRow } from "@/lib/types";

export interface RequestDetail {
  request: RequestRow;
  photos: RequestPhotoRow[];
  items: RequestItemRow[];
  events: RequestEventRow[];
}

// Détail complet d'une demande pour la fiche.
export async function getRequestDetail(id: string): Promise<RequestDetail | null> {
  const supabase = createServiceClient();
  const { data: request } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (!request) return null;

  const [{ data: photos }, { data: items }, { data: events }] = await Promise.all([
    supabase.from("request_photos").select("*").eq("request_id", id).order("created_at"),
    supabase.from("request_items").select("*").eq("request_id", id).order("created_at"),
    supabase
      .from("request_events")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    request: request as RequestRow,
    photos: (photos ?? []) as RequestPhotoRow[],
    items: (items ?? []) as RequestItemRow[],
    events: (events ?? []) as RequestEventRow[],
  };
}

// Liste pour le dashboard.
export async function listRequests(): Promise<RequestRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Lecture des demandes échouée : ${error.message}`);
  return (data ?? []) as RequestRow[];
}
