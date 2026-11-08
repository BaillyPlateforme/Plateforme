import { NextResponse } from "next/server";
import { estSuperAdmin } from "@/lib/droits";

export const dynamic = "force-dynamic";

/**
 * Les droits du membre connecté, pour l'affichage (bouton « Modifier son
 * espace »). Rien n'est autorisé sur cette seule réponse : chaque route et
 * chaque action revérifie le droit côté serveur.
 */
export async function GET() {
  return NextResponse.json({ superAdmin: await estSuperAdmin().catch(() => false) }, { headers: { "Cache-Control": "no-store" } });
}
