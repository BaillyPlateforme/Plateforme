import { NextResponse, type NextRequest } from "next/server";
import { fermerSession } from "@/lib/espace-client/session";

export const dynamic = "force-dynamic";

/**
 * La déconnexion : la session sort du registre de l'espace client, Supabase
 * la révoque et ses cookies s'effacent ; retour à la connexion. Un lien
 * simple (pas un <Link>) y mène, pour qu'aucun préchargement ne déconnecte.
 *
 * Pendant un aperçu de l'équipe, elle ne fait que le quitter (session.ts) :
 * la page de connexion le dit, et l'onglet peut se fermer.
 */
export async function GET(req: NextRequest) {
  const { apercu } = await fermerSession();
  return NextResponse.redirect(new URL(apercu ? "/espace-client/connexion?vue-equipe=terminee" : "/espace-client/connexion?au-revoir=1", req.url));
}
