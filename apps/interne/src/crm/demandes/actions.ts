"use server";

import { revalidatePath } from "next/cache";
import { creerRappel } from "@/lib/rappels";
import { exigerEquipe, getUserAffichage } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { activitesDe } from "./activites";
import type { Activite } from "./liste-commun";

/*
 * Les actions du panneau de Demandes (Top demandes, Feed). Chacune revérifie
 * que c'est l'équipe : une action serveur s'appelle de n'importe où.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les dernières activités d'une demande, lues quand on la choisit dans la liste. */
export async function activitesDemande(id: string): Promise<Activite[]> {
  await exigerEquipe();
  if (!UUID.test(id)) return [];
  return activitesDe(id, 5);
}

/**
 * « À rappeler » : l'équipe met la demande dans les rappels (Demandes › À
 * rappeler), comme le fait le client avec « Être rappelé ». Un seul rappel
 * ouvert à la fois : s'il y en a déjà un, rien ne change. Le rappel porte
 * l'auteur (`par`) : le Feed le dit de l'équipe, pas du client. Rien ne part.
 */
export async function mettreARappeler(id: string): Promise<{ ok: boolean; message: string }> {
  await exigerEquipe();
  if (!UUID.test(id)) return { ok: false, message: "Demande introuvable." };
  try {
    const r = await creerRappel(id, null);
    if (r.deja) return { ok: true, message: "Un rappel est déjà ouvert pour cette demande." };
    const par = (await getUserAffichage().catch(() => null))?.email ?? null;
    if (par) {
      const db = createServiceClient();
      const { data } = await db.from("request_events").select("payload").eq("id", r.rappel.id).maybeSingle();
      await db
        .from("request_events")
        .update({ payload: { ...((data?.payload as Record<string, unknown>) ?? {}), par } })
        .eq("id", r.rappel.id);
    }
    revalidatePath("/demandes");
    revalidatePath(`/dashboard/${id}`);
    return { ok: true, message: "Demande ajoutée aux rappels." };
  } catch (e) {
    console.error("Demandes : rappel impossible", e instanceof Error ? e.message : e);
    return { ok: false, message: "Le rappel n'a pas pu être enregistré : réessayez dans un instant." };
  }
}
