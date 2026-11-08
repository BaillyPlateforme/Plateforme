import { NextResponse } from "next/server";
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
export async function GET() {
  const { apercu } = await fermerSession();
  // Une adresse relative : derrière le proxy de Railway, req.url est l'adresse interne (https://localhost:8080),
  // et une redirection absolue bâtie dessus envoyait le client sur une page introuvable.
  return new NextResponse(null, { status: 307, headers: { Location: apercu ? "/espace-client/connexion?vue-equipe=terminee" : "/espace-client/connexion?au-revoir=1" } });
}
