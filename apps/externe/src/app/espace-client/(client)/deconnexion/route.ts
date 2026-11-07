import { NextResponse, type NextRequest } from "next/server";
import { fermerSession } from "@/lib/espace-client/session";

export const dynamic = "force-dynamic";

/**
 * La déconnexion : la session sort du registre de l'espace client, Supabase
 * la révoque et ses cookies s'effacent ; retour à la connexion. Un lien
 * simple (pas un <Link>) y mène, pour qu'aucun préchargement ne déconnecte.
 */
export async function GET(req: NextRequest) {
  await fermerSession();
  return NextResponse.redirect(new URL("/espace-client/connexion?au-revoir=1", req.url));
}
