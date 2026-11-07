"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { changerStatutRappel, type StatutRappel } from "@/lib/rappels";

export async function deplacerRappel(id: string, statut: StatutRappel) {
  await exigerEquipe();
  await changerStatutRappel(id, statut);
  revalidatePath("/dashboard/rappels");
}
