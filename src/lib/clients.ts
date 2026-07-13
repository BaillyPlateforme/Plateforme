import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { ClientProfileRow, RequestRow } from "@/lib/types";

export interface ClientSummary {
  email: string;
  nom: string | null;
  telephone: string | null;
  societe: string | null;
  tags: string[];
  nb_demandes: number;
  volume_total: number;
  ca_potentiel: number;
  derniere_activite: string;
}

// Répertoire clients : agrégé depuis les demandes, enrichi des fiches.
export async function listClients(): Promise<ClientSummary[]> {
  const supabase = createServiceClient();
  const [{ data: reqs }, { data: profiles }] = await Promise.all([
    supabase
      .from("requests")
      .select("client_email, client_nom, client_tel, volume_m3, estimation_prix, created_at"),
    supabase.from("client_profiles").select("*"),
  ]);

  const profileMap = new Map<string, ClientProfileRow>(
    (profiles ?? []).map((p) => [p.email as string, p as ClientProfileRow]),
  );

  const map = new Map<string, ClientSummary>();
  for (const r of reqs ?? []) {
    const email = r.client_email as string | null;
    if (!email) continue;
    const prof = profileMap.get(email);
    const cur =
      map.get(email) ??
      ({
        email,
        nom: prof?.nom ?? (r.client_nom as string) ?? null,
        telephone: prof?.telephone ?? (r.client_tel as string) ?? null,
        societe: prof?.societe ?? null,
        tags: prof?.tags ?? [],
        nb_demandes: 0,
        volume_total: 0,
        ca_potentiel: 0,
        derniere_activite: r.created_at as string,
      } as ClientSummary);
    cur.nb_demandes += 1;
    cur.volume_total += (r.volume_m3 as number) ?? 0;
    cur.ca_potentiel += (r.estimation_prix as number) ?? 0;
    if ((r.created_at as string) > cur.derniere_activite) cur.derniere_activite = r.created_at as string;
    map.set(email, cur);
  }

  // Fiches créées sans demande liée
  for (const [email, prof] of profileMap) {
    if (!map.has(email)) {
      map.set(email, {
        email,
        nom: prof.nom,
        telephone: prof.telephone,
        societe: prof.societe,
        tags: prof.tags,
        nb_demandes: 0,
        volume_total: 0,
        ca_potentiel: 0,
        derniere_activite: prof.created_at,
      });
    }
  }

  return [...map.values()]
    .map((c) => ({ ...c, volume_total: Math.round(c.volume_total), ca_potentiel: Math.round(c.ca_potentiel) }))
    .sort((a, b) => b.derniere_activite.localeCompare(a.derniere_activite));
}

export async function getClientDetail(email: string) {
  const supabase = createServiceClient();
  const [{ data: profile }, { data: requests }] = await Promise.all([
    supabase.from("client_profiles").select("*").eq("email", email).maybeSingle(),
    supabase.from("requests").select("*").eq("client_email", email).order("created_at", { ascending: false }),
  ]);
  return {
    email,
    profile: (profile as ClientProfileRow) ?? null,
    requests: (requests ?? []) as RequestRow[],
  };
}
