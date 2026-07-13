import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { CreateRequestInput } from "@/lib/schemas";
import type { RequestRow, RequestSource } from "@/lib/types";

// Convertit un volume (3 méthodes) en (volume_m3, method) prêts à stocker.
function resolveVolume(volume: CreateRequestInput["volume"]) {
  if (!volume) return { volume_m3: null, volume_method: null, items: [] as const };

  if (volume.method === "explicit") {
    return { volume_m3: volume.volume_m3, volume_method: "explicit" as const, items: [] };
  }
  if (volume.method === "list") {
    const total = volume.items.reduce(
      (sum, it) => sum + it.quantite * it.volume_unitaire_m3,
      0,
    );
    return { volume_m3: total, volume_method: "list" as const, items: volume.items };
  }
  // 'ai' : le volume sera calculé après analyse des photos (endpoint dédié).
  return { volume_m3: null, volume_method: "ai" as const, items: [] };
}

// Crée une demande. Chemin unique pour le formulaire ET pour n8n (mail).
export async function createRequest(
  input: CreateRequestInput,
  source: RequestSource,
): Promise<RequestRow> {
  const supabase = createServiceClient();
  const { volume_m3, volume_method, items } = resolveVolume(input.volume);

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

    arrivee_adresse: input.arrivee.adresse ?? null,
    arrivee_code_postal: input.arrivee.code_postal ?? null,
    arrivee_ville: input.arrivee.ville ?? null,
    arrivee_etage: input.arrivee.etage ?? null,
    arrivee_ascenseur: input.arrivee.ascenseur ?? null,

    date_souhaitee: input.date_souhaitee ?? null,
    flexibilite: input.flexibilite ?? null,

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

  await supabase.from("request_events").insert({
    request_id: created.id,
    type: "created",
    payload: { source },
  });

  return created;
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
