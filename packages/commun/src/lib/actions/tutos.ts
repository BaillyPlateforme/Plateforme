"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { apercuEquipe, exigerClient, lireDonneesClient } from "@/lib/espace-client/session";
import { marquerTutoVu } from "@/lib/espace-client/tutos-vus";

/*
 * « Marquer comme vu » : le bouton de la page d'un tutoriel, ou la vidéo
 * regardée jusqu'au bout.
 *
 * Le chemin de toute action du client (actions/espace-client.ts) :
 *   1. la session ;
 *   2. le dossier, cherché dans ce que la RLS rend au client — la référence
 *      doit être à lui — et le tutoriel, parmi ceux qui sont publiés ;
 *   3. l'écriture, par la clé de service.
 *
 * Pendant un aperçu de l'équipe, en lecture comme en édition, RIEN n'est
 * écrit : ce qu'a vu le client est à lui, et le fil de l'équipe ne doit pas
 * le fausser. L'action répond alors sans erreur, `apercu: true`, et l'écran
 * le dit.
 */

export type ResultatVu = { ok: true; nouveau: boolean } | { ok: false; apercu?: true; erreur?: string };

export async function marquerVu(reference: string, tutoId: string, par: "bouton" | "video" = "bouton"): Promise<ResultatVu> {
  if (await apercuEquipe()) return { ok: false, apercu: true };
  try {
    const client = await exigerClient();
    const d = await lireDonneesClient();
    const dossier = d.dossiers.find((x) => x.reference === reference && x.client_id === client.id);
    const tuto = d.tutos.find((t) => t.id === tutoId && t.actif);
    if (!dossier || !tuto) return { ok: false, erreur: "Tutoriel introuvable." };
    const nouveau = await marquerTutoVu(client.id, tuto.id, par === "video" ? "video" : "bouton");
    if (nouveau) revalidatePath(`/espace-client/${dossier.reference}`, "layout");
    return { ok: true, nouveau };
  } catch (e) {
    // La redirection vers la connexion (session expirée) suit son cours.
    unstable_rethrow(e);
    console.error("Tutos : « vu » non enregistré", e instanceof Error ? e.message : e);
    return { ok: false, erreur: "Impossible d'enregistrer pour l'instant. Réessayez dans un instant." };
  }
}
