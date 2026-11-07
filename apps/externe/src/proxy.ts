import { NextResponse, type NextRequest } from "next/server";
import { lireSession } from "@/lib/supabase/session-proxy";

/*
 * L'app externe : le site public, les espaces pro, l'espace client — et
 * l'espace RH des entreprises clientes, le seul qui demande une session
 * Supabase ici. Un compte de l'équipe peut y entrer, pour voir ce que voit un
 * client ; un visiteur sans session est renvoyé vers la connexion des RH.
 * (L'espace client gère sa propre session.)
 */
export async function proxy(request: NextRequest) {
  const s = await lireSession(request);

  // La connexion des RH est la seule page de ce côté qui s'ouvre sans session.
  if (s.chemin === "/rh/connexion") return s.valide ? s.vers("/rh") : s.reponse();

  if (!s.valide) {
    if (s.api) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    return s.vers("/rh/connexion");
  }
  return s.reponse();
}

export const config = {
  matcher: ["/rh", "/rh/:path*", "/api/rh/:path*"],
};
