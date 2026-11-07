import { NextResponse, type NextRequest } from "next/server";
import { lireSession } from "@/lib/supabase/session-proxy";

/*
 * L'app interne : l'espace de l'équipe Bailly. Tout y demande une session ;
 * un compte RH n'y entre pas — ni ses pages, ni ses données.
 */
export async function middleware(request: NextRequest) {
  const s = await lireSession(request);

  if (!s.valide) {
    if (s.api) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    return s.vers("/login", true);
  }

  if (s.role === "rh") {
    if (s.api) return NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
    const rh = process.env.NEXT_PUBLIC_URL_EXTERNE;
    return rh ? NextResponse.redirect(new URL("/rh", rh)) : NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
  }

  return s.reponse();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/data/:path*"],
};
