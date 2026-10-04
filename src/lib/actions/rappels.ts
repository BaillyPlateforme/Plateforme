"use server";

import { revalidatePath } from "next/cache";
import { changerStatutRappel, type StatutRappel } from "@/lib/rappels";

export async function deplacerRappel(id: string, statut: StatutRappel) {
  await changerStatutRappel(id, statut);
  revalidatePath("/dashboard/rappels");
}
