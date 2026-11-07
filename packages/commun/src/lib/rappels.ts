import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { RequestRow } from "@/lib/types";

export type StatutRappel = "a_rappeler" | "en_cours" | "rappele" | "injoignable" | "clos";

export interface RappelRow {
  id: string;
  request_id: string;
  devis_id: string | null;
  statut: StatutRappel;
  priorite: number;
  montant_ttc: number | null;
  creneau: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** Une carte du tableau : le rappel, et de quoi appeler sans ouvrir la fiche. */
export interface CarteRappel extends RappelRow {
  client_nom: string | null;
  client_tel: string | null;
  client_email: string | null;
  depart_ville: string | null;
  arrivee_ville: string | null;
  volume_m3: number | null;
}

/*
 * Où vivent les rappels.
 *
 * Dans l'historique de la demande (`request_events`), sous le type « rappel » :
 * une ligne par demande de rappel, dont la charge porte le statut, la priorité
 * et le montant. Une table dédiée avait été prévue par migration ; elle n'a
 * jamais été créée en base, et chaque clic sur « Être rappelé » échouait donc
 * en silence. L'historique existe depuis le premier jour : s'appuyer dessus
 * fait marcher le bouton sans rien avoir à installer.
 */
const TYPE = "rappel";
const OUVERTS: StatutRappel[] = ["a_rappeler", "en_cours"];

type Charge = {
  statut?: StatutRappel;
  priorite?: number;
  montant_ttc?: number | null;
  devis_id?: string | null;
  creneau?: string | null;
  note?: string | null;
  /** Dernier changement de statut. */
  maj?: string;
};

type Evenement = { id: string; request_id: string; payload: Charge | null; created_at: string };

function versRappel(e: Evenement): RappelRow {
  const c = e.payload ?? {};
  return {
    id: e.id,
    request_id: e.request_id,
    devis_id: c.devis_id ?? null,
    statut: c.statut ?? "a_rappeler",
    priorite: c.priorite ?? 0,
    montant_ttc: c.montant_ttc ?? null,
    creneau: c.creneau ?? null,
    note: c.note ?? null,
    created_at: e.created_at,
    updated_at: c.maj ?? e.created_at,
  };
}

export async function listRappels(): Promise<CarteRappel[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("request_events")
    .select("id, request_id, payload, created_at")
    .eq("type", TYPE)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  // On rappelle d'abord ce qui pèse : priorité décroissante, puis ancienneté.
  const rappels = ((data ?? []) as Evenement[])
    .map(versRappel)
    .sort((a, b) => b.priorite - a.priorite || +new Date(a.created_at) - +new Date(b.created_at));
  if (rappels.length === 0) return [];

  const { data: demandes } = await supabase
    .from("requests")
    .select("id, client_nom, client_tel, client_email, depart_ville, arrivee_ville, volume_m3")
    .in("id", [...new Set(rappels.map((r) => r.request_id))]);

  const par = new Map(((demandes ?? []) as Partial<RequestRow>[]).map((d) => [d.id, d]));
  return rappels.map((r) => {
    const d = par.get(r.request_id) ?? {};
    return {
      ...r,
      client_nom: d.client_nom ?? null,
      client_tel: d.client_tel ?? null,
      client_email: d.client_email ?? null,
      depart_ville: d.depart_ville ?? null,
      arrivee_ville: d.arrivee_ville ?? null,
      volume_m3: d.volume_m3 ?? null,
    };
  });
}

/**
 * Enregistre une demande de rappel.
 *
 * La priorité est figée ici, à partir du score de potentiel de la demande :
 * c'est ce qui ordonne le tableau, et il ne doit pas se réordonner tout seul
 * si la qualification est rejouée plus tard.
 */
export async function creerRappel(requestId: string, creneau?: string | null) {
  const supabase = createServiceClient();

  const { data: req } = await supabase
    .from("requests")
    .select("id, score_potentiel, estimation_prix")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Demande introuvable");

  // Une demande n'a qu'un rappel ouvert à la fois : un client qui reclique ne
  // doit pas créer une seconde carte, et ce n'est pas une erreur à lui montrer.
  const { data: existants, error: lecture } = await supabase
    .from("request_events")
    .select("id, request_id, payload, created_at")
    .eq("request_id", requestId)
    .eq("type", TYPE);
  if (lecture) throw new Error(lecture.message);
  const ouvert = ((existants ?? []) as Evenement[]).map(versRappel).find((r) => OUVERTS.includes(r.statut));
  if (ouvert) return { deja: true as const, rappel: ouvert };

  const { data: devis } = await supabase
    .from("devis")
    .select("id, montant_ttc")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const r = req as Partial<RequestRow>;
  const charge: Charge = {
    statut: "a_rappeler",
    priorite: Math.max(0, Math.min(100, Math.round(r.score_potentiel ?? 0))),
    montant_ttc: devis?.montant_ttc ?? r.estimation_prix ?? null,
    devis_id: devis?.id ?? null,
    creneau: creneau || null,
    note: null,
  };

  const { data, error } = await supabase
    .from("request_events")
    .insert({ request_id: requestId, type: TYPE, payload: charge })
    .select("id, request_id, payload, created_at")
    .single();
  if (error) throw new Error(error.message);

  return { deja: false as const, rappel: versRappel(data as Evenement) };
}

export async function changerStatutRappel(id: string, statut: StatutRappel) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("request_events")
    .select("payload")
    .eq("id", id)
    .eq("type", TYPE)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from("request_events")
    .update({ payload: { ...((data.payload as Charge) ?? {}), statut, maj: new Date().toISOString() } })
    .eq("id", id);
}
