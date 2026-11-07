import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { reperes } from "@/crm/creation/donnees";
import type { Saisie } from "@/crm/creation/commun";

export const dynamic = "force-dynamic";

/*
 * Les repères de la création de dossier, demandés à chaque pause de frappe :
 * client déjà connu, doublon possible, dossiers passés les plus proches.
 * Une route plutôt qu'une action serveur : les actions passent une à une, et
 * ces lectures fréquentes ne doivent jamais retarder la création elle-même.
 * Lecture seule. Réservé à l'équipe : le proxy le vérifie, `currentUser()` le
 * revérifie.
 */
export async function POST(request: Request) {
  try {
    await currentUser();
  } catch {
    return NextResponse.json({ erreur: "Réservé à l'équipe Bailly." }, { status: 403 });
  }
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const texte = (k: string) => (typeof b[k] === "string" ? (b[k] as string).slice(0, 200) : undefined);
  const nombre = (k: string) => {
    const v = Number(b[k]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const saisie: Saisie = {
    email: texte("email"),
    telephone: texte("telephone"),
    nom: texte("nom"),
    societe: texte("societe"),
    depart: texte("depart"),
    arrivee: texte("arrivee"),
    volume: nombre("volume"),
    type: texte("type"),
    type_demenagement: texte("type_demenagement"),
    clientId: nombre("clientId"),
  };
  try {
    return NextResponse.json(await reperes(saisie));
  } catch (e) {
    console.error("Création de dossier, repères :", e instanceof Error ? e.message : e);
    return NextResponse.json({ client: null, doublons: [], proches: [] });
  }
}
