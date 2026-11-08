import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { lireAppels } from "@/crm/appels/donnees";

export const dynamic = "force-dynamic";

/*
 * Les appels à passer, pour le bouton « Appels » de la barre du haut : relus
 * à chaque changement de page et toutes les minutes (onglet visible). Une
 * route plutôt qu'une action serveur : les actions passent une à une, et
 * cette lecture fréquente ne doit jamais retarder un geste. Lecture seule.
 * Réservé à l'équipe : le proxy le vérifie, `currentUser()` le revérifie.
 */
export async function GET() {
  let moi: number;
  try {
    moi = (await currentUser()).id;
  } catch {
    return NextResponse.json({ erreur: "Réservé à l'équipe Bailly." }, { status: 403 });
  }
  try {
    const { aFaire, reportes } = await lireAppels();
    return NextResponse.json({ moi, aFaire, reportes: reportes.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Appels : liste illisible", e instanceof Error ? e.message : e);
    return NextResponse.json({ moi, aFaire: [], reportes: 0, erreur: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
