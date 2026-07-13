import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { fireEvent } from "@/lib/alerts";

export interface IncomingEmail {
  expediteur?: string;
  client_nom?: string;
  client_email?: string;
  client_tel?: string;
  ville_depart?: string;
  ville_arrivee?: string;
  volume_m3?: number;
  sujet?: string;
  corps?: string;
}

// Transforme un mail entrant (ligne de données) en demande, puis déclenche
// les workflows — dont le workflow de complétion si des champs manquent.
export async function ingestEmail(body: IncomingEmail) {
  const supabase = createServiceClient();

  const manque_volume = body.volume_m3 == null;
  const manque_depart = !body.ville_depart;
  const manque_arrivee = !body.ville_arrivee;
  const incomplet = manque_volume || manque_depart || manque_arrivee;
  // Un jeton de complétion n'est créé que si la demande est incomplète.
  const token = incomplet ? randomUUID() : null;

  const { data: req } = await supabase
    .from("requests")
    .insert({
      source: "email",
      status: "new",
      client_nom: body.client_nom ?? null,
      client_email: body.client_email ?? null,
      client_tel: body.client_tel ?? null,
      depart_ville: body.ville_depart ?? null,
      arrivee_ville: body.ville_arrivee ?? null,
      volume_m3: body.volume_m3 ?? null,
      completion_token: token,
      raw_payload: body as unknown as Record<string, unknown>,
    })
    .select()
    .single();

  await supabase.from("emails_recus").insert({
    expediteur: body.expediteur ?? body.client_email ?? null,
    client_nom: body.client_nom ?? null,
    client_email: body.client_email ?? null,
    client_tel: body.client_tel ?? null,
    ville_depart: body.ville_depart ?? null,
    ville_arrivee: body.ville_arrivee ?? null,
    volume_m3: body.volume_m3 ?? null,
    sujet: body.sujet ?? null,
    corps: body.corps ?? null,
    request_id: req?.id ?? null,
    status: "traite",
  });

  if (req) {
    await supabase.from("request_events").insert({ request_id: req.id, type: "created", payload: { source: "email" } });
  }

  const settings = await getSettings();
  const base = (settings.base_url || "").replace(/\/$/, "");
  const lien = token ? (base ? `${base}/completer/${token}` : `/completer/${token}`) : "";

  const ctx = {
    source: "email",
    client_nom: body.client_nom ?? null,
    client_email: body.client_email ?? null,
    client_tel: body.client_tel ?? null,
    ville_depart: body.ville_depart ?? null,
    ville_arrivee: body.ville_arrivee ?? null,
    volume: body.volume_m3 ?? null,
    lien_completion: lien,
    manque_volume,
    manque_depart,
    manque_arrivee,
  };

  await fireEvent("demande_recue", ctx);
  if (incomplet) await fireEvent("demande_incomplete", ctx);
  else await fireEvent("demande_complete", ctx);

  return { id: req?.id, completion_token: token, incomplet };
}
