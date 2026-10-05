import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { fireEvent } from "@/lib/alerts";
import { contexteDemande } from "@/lib/messaging";
import { getEspaceParCodeOuJeton } from "@/lib/espaces-pro";
import { instantane } from "@/lib/espaces";
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
  // Chaque photo porte déjà son volume net : les meubles vus sur une autre
  // photo de la même pièce en ont été retirés.
  const total = volume.photos.reduce((sum, p) => sum + p.volume_m3, 0);
  return { volume_m3: round2(total), volume_method: "ai", items: [], photos: volume.photos };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Crée une demande. Chemin unique pour le formulaire ET pour n8n (mail).
 *
 * Rend la demande dès qu'elle est enregistrée, et `suite` : le chiffrage, le
 * devis et les messages, à lancer une fois la réponse envoyée.
 */
export async function createRequest(
  input: CreateRequestInput,
  source: RequestSource,
): Promise<{ demande: RequestRow; suite: () => Promise<void> }> {
  const supabase = createServiceClient();
  const { volume_m3, volume_method, items, photos } = resolveVolume(input.volume);

  // L'espace pro. Le formulaire n'envoie que son lien : ses réglages sont
  // relus ici, jamais crus sur parole — la cote sur le volume ne doit pas
  // pouvoir être choisie par celui qui remplit. Ils sont figés dans la
  // demande : modifier l'espace ensuite ne rechiffre pas le passé.
  // Le nom ne suffit pas : c'est le code du lien qui prouve qu'on vient bien de l'espace.
  // (Ou le jeton reçu par qui a saisi le nom de sa société dans le formulaire public.)
  const parCode = input.espace_code ? await getEspaceParCodeOuJeton(input.espace_code) : null;
  const espace = parCode && parCode.slug === input.espace ? parCode : null;
  const contexteEspace = espace?.actif ? instantane(espace) : undefined;
  const charge: Record<string, unknown> = { ...input, espace: contexteEspace };
  // Le code a servi à reconnaître l'espace : il n'a rien à faire dans la demande.
  delete charge.espace_code;
  if (contexteEspace) {
    // Un espace pro, c'est une mobilité portée par l'employeur.
    charge.mutation_pro = true;
    if (!input.societe) charge.societe = contexteEspace.nom;
  }
  const formule = espace?.actif && espace.formule_imposee ? espace.formule_imposee : input.formule;

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
    formule: formule ?? null,
    distance_km: input.distance_km ?? null,
    services: input.services ?? {},

    volume_m3,
    volume_method,
    raw_payload: charge,
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

  // Les meubles, les photos et la trace de création ne dépendent pas les uns
  // des autres : ils s'écrivent ensemble, pas l'un après l'autre.
  const [meubles, cliches] = await Promise.all([
    items.length > 0
      ? supabase.from("request_items").insert(
          items.map((it) => ({
            request_id: created.id,
            label: it.label,
            quantite: it.quantite,
            volume_unitaire_m3: it.volume_unitaire_m3,
          })),
        )
      : null,
    photos.length > 0
      ? supabase.from("request_photos").insert(
          photos.map((p) => ({
            request_id: created.id,
            storage_path: p.storage_path,
            piece: p.piece,
            ai_analysis: { piece: p.piece, objets: p.objets, volume_m3: p.volume_m3 },
            volume_m3: p.volume_m3,
          })),
        )
      : null,
    supabase.from("request_events").insert({ request_id: created.id, type: "created", payload: { source } }),
  ]);
  if (meubles?.error) throw new Error(`Insertion des items échouée : ${meubles.error.message}`);
  if (cliches?.error) throw new Error(`Insertion des photos échouée : ${cliches.error.message}`);

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

  /*
   * La suite : le chiffrage, le devis, les messages. Rien de tout cela n'est
   * nécessaire pour répondre au client — sa demande est enregistrée. Tant que
   * la réponse attendait la fin des mails et du PDF, le bouton « Envoyer »
   * restait figé de longues secondes. L'appelant lance donc la suite une fois
   * la réponse partie.
   */
  const suite = async () => {
    const settings = await getSettings();
    const base = (settings.base_url || "").replace(/\/$/, "");
    const lien = token ? (base ? `${base}/completer/${token}` : `/completer/${token}`) : "";

    const ctx = {
      request_id: created.id,
      source: created.source,
      client_nom: created.client_nom,
      client_email: created.client_email,
      client_tel: created.client_tel,
      ...contexteDemande(created),
      lien_completion: lien,
      manque_volume,
      manque_depart,
      manque_arrivee,
    };

    if (incomplet) {
      await fireEvent("demande_recue", ctx);
      await fireEvent("demande_incomplete", ctx);
    } else {
      // Demande complète → qualification (devis + analyse notée), AVANT les
      // messages. L'accusé de réception partait jusqu'ici sans l'estimation,
      // qui n'existait pas encore : le client recevait trois phrases, et jamais
      // son prix. Une qualification qui échoue n'empêche pas le message de partir.
      let echec: unknown = null;
      try {
        await qualifyRequest(created.id);
      } catch (e) {
        echec = e;
      }
      await fireEvent("demande_recue", ctx);
      await fireEvent("demande_complete", ctx);
        if (echec) throw echec;
    }
  };

  return { demande: created, suite };
}

import type { RequestPhotoRow, RequestItemRow, RequestEventRow, DevisRow } from "@/lib/types";

export interface RequestDetail {
  request: RequestRow;
  photos: RequestPhotoRow[];
  items: RequestItemRow[];
  events: RequestEventRow[];
  devis: DevisRow | null;
}

// Détail complet d'une demande pour la fiche.
export async function getRequestDetail(id: string): Promise<RequestDetail | null> {
  const supabase = createServiceClient();
  const { data: request } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (!request) return null;

  const [{ data: photos }, { data: items }, { data: events }, { data: devis }] = await Promise.all([
    supabase.from("request_photos").select("*").eq("request_id", id).order("created_at"),
    supabase.from("request_items").select("*").eq("request_id", id).order("created_at"),
    supabase
      .from("request_events")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("devis").select("*").eq("request_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    request: request as RequestRow,
    photos: (photos ?? []) as RequestPhotoRow[],
    items: (items ?? []) as RequestItemRow[],
    events: (events ?? []) as RequestEventRow[],
    devis: (devis as DevisRow) ?? null,
  };
}

/**
 * Colonnes des vues de liste : tout sauf `raw_payload`.
 *
 * Ce champ porte la copie intégrale du formulaire — 42 Ko sur 53 demandes,
 * la moitié du poids de la requête, et il repartait ensuite dans le flux RSC
 * jusqu'au navigateur. Seule la marque « express » en était lue : on va la
 * chercher directement par son chemin JSON.
 */
const COLONNES_LISTE = [
  "id", "source", "status",
  "client_nom", "client_email", "client_tel",
  "depart_adresse", "depart_code_postal", "depart_ville", "depart_etage", "depart_ascenseur",
  "arrivee_adresse", "arrivee_code_postal", "arrivee_ville", "arrivee_etage", "arrivee_ascenseur",
  "date_souhaitee", "flexibilite",
  "volume_m3", "volume_method", "type_logement_depart", "type_logement_arrivee",
  "distance_km", "formule", "services", "estimation_prix", "grid_id",
  "score_potentiel", "score_difficulte", "score_notes",
  "completion_token", "created_at", "updated_at",
  "express:raw_payload->details->>express",
  "espace_nom:raw_payload->espace->>nom",
].join(",");

// Liste pour le dashboard.
export async function listRequests(): Promise<RequestRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("requests")
    .select(COLONNES_LISTE)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Lecture des demandes échouée : ${error.message}`);
  return (data ?? []) as unknown as RequestRow[];
}

/**
 * Compteur de la pastille, gardé quelques secondes.
 *
 * Il est lu par le layout, donc à chaque navigation : une requête de plus à
 * chaque clic pour un chiffre qui ne bouge qu'à la réception d'une demande.
 */
let cacheNouvelles: { a: number; v: number } | null = null;
const TTL_NOUVELLES = 30_000;

export async function compterNouvelles(): Promise<number> {
  if (cacheNouvelles && Date.now() - cacheNouvelles.a < TTL_NOUVELLES) return cacheNouvelles.v;
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  cacheNouvelles = { a: Date.now(), v: count ?? 0 };
  return cacheNouvelles.v;
}
