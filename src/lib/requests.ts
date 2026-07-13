import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
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
