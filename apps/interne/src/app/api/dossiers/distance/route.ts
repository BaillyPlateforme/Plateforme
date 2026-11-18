import { NextResponse } from "next/server";
import { currentUser } from "@/crm/lib/auth";
import { distancesTrajet, type PointTrajet } from "@/crm/creation/distance";
import { SANS_KM } from "@/crm/creation/kilometres";
import { portSaisi } from "@/crm/creation/commun";

export const dynamic = "force-dynamic";

/*
 * Les kilomètres du trajet pendant la création d'un dossier : l'écran envoie
 * ses adresses dans l'ordre (chargements, puis livraisons), chacune avec son
 * genre et sa case Port ; la route répond { km, versPort, mer, depuisPort }
 * (crm/creation/kilometres.ts) — km: null quand une adresse reste
 * introuvable. Sans port, seul km est rempli, comme avant. Lecture seule ;
 * réservé à l'équipe (le proxy le vérifie, currentUser() aussi).
 */
export async function POST(request: Request) {
  try {
    await currentUser();
  } catch {
    return NextResponse.json({ erreur: "Réservé à l'équipe Bailly." }, { status: 403 });
  }
  const b = ((await request.json().catch(() => null)) ?? {}) as { etapes?: unknown };
  const texte = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
  const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const etapes: PointTrajet[] = (Array.isArray(b.etapes) ? b.etapes : []).slice(0, 14).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      adresse: texte(o.adresse, 300), code_postal: texte(o.code_postal, 12), ville: texte(o.ville, 80), lat: nombre(o.lat), lon: nombre(o.lon),
      genre: o.genre === "depart" || o.genre === "arrivee" ? o.genre : null,
      port: portSaisi(o.port),
    };
  });
  try {
    return NextResponse.json(await distancesTrajet(etapes));
  } catch (e) {
    console.error("Création de dossier, kilomètres :", e instanceof Error ? e.message : e);
    return NextResponse.json(SANS_KM);
  }
}
