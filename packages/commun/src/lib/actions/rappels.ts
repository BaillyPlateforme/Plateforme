"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { changerStatutRappel, type StatutRappel } from "@/lib/rappels";
import { createServiceClient } from "@/lib/supabase/server";
import { journaliserEquipe } from "@/lib/journal";

const LIBELLES: Record<StatutRappel, string> = {
  a_rappeler: "à rappeler",
  en_cours: "en cours",
  rappele: "rappelé",
  injoignable: "injoignable",
  clos: "clos",
};

export async function deplacerRappel(id: string, statut: StatutRappel) {
  await exigerEquipe();
  // La demande du rappel et son statut d'avant, pour le journal des gestes.
  const { data: avant } = await createServiceClient().from("request_events").select("request_id, payload").eq("id", id).eq("type", "rappel").maybeSingle();
  await changerStatutRappel(id, statut);
  revalidatePath("/dashboard");
  if (avant) {
    const ancien = (avant.payload as { statut?: StatutRappel } | null)?.statut ?? "a_rappeler";
    if (ancien !== statut) {
      await journaliserEquipe({
        action: "rappel.statut", libelle: `Demande de rappel passée à « ${LIBELLES[statut] ?? statut} »`, objet: { type: "rappel", id },
        requestId: avant.request_id as string, details: { avant: ancien, apres: statut },
      });
    }
  }
}
