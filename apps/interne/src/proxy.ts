import { NextResponse, type NextRequest } from "next/server";
import { lireSession } from "@/lib/supabase/session-proxy";

/*
 * L'app interne : l'espace de l'équipe Bailly. Tout y demande une session
 * d'un compte de l'équipe. Un compte RH ou un client de l'espace client a
 * bien une session Supabase — même authentification — mais n'entre pas : ni
 * ses pages, ni ses données, ni ses actions serveur (qui passent par les
 * mêmes adresses). Chacun est renvoyé vers son espace, dans l'app externe.
 */
export async function proxy(request: NextRequest) {
  const s = await lireSession(request);

  if (!s.valide) {
    if (s.api) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    return s.vers("/login", true);
  }

  if (s.role === "rh" || s.role === "client") {
    if (s.api) return NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
    const externe = process.env.NEXT_PUBLIC_URL_EXTERNE;
    const chez = s.role === "rh" ? "/rh" : "/espace-client";
    return externe ? NextResponse.redirect(new URL(chez, externe)) : NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
  }

  return s.reponse();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/data/:path*"],
};
