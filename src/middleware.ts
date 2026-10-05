import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Deux portails, une seule authentification.
 *
 * /dashboard et /api/data : l'espace équipe. Un compte RH n'y entre pas.
 * /rh et /api/rh : l'espace RH des entreprises clientes. L'équipe peut y
 * entrer, pour voir ce que voit un client ; un visiteur sans session est
 * renvoyé vers la connexion des RH.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // `getClaims()` vérifie la signature du jeton avec les clés publiques du
  // projet, gardées en cache : 1 ms contre 50 à 250 ms pour `getUser()`, qui
  // interroge Supabase à chaque navigation. On ne repasse par le réseau que
  // si le jeton est absent, expiré ou illisible — et c'est alors `getUser()`
  // qui rafraîchit la session et réécrit les cookies.
  const { data: claims } = await supabase.auth.getClaims();
  let valide = !!claims?.claims?.sub;
  let role = (claims?.claims?.app_metadata as { role?: string } | undefined)?.role;

  if (!valide) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    valide = !!user;
    role = (user?.app_metadata as { role?: string } | undefined)?.role;
  }

  const chemin = request.nextUrl.pathname;
  const api = chemin.startsWith("/api/");
  const coteRh = chemin === "/rh" || chemin.startsWith("/rh/") || chemin.startsWith("/api/rh");
  const vers = (pathname: string, retour = false) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    if (retour) url.searchParams.set("redirect", chemin);
    return NextResponse.redirect(url);
  };

  // La connexion des RH est la seule page de ce côté qui s'ouvre sans session.
  if (chemin === "/rh/connexion") return valide ? vers("/rh") : response;

  if (!valide) {
    if (api) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    return coteRh ? vers("/rh/connexion") : vers("/login", true);
  }

  // Un compte RH n'a rien à faire dans l'espace équipe : ni ses pages, ni ses données.
  if (role === "rh" && !coteRh) {
    if (api) return NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
    return vers("/rh");
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/data/:path*", "/rh", "/rh/:path*", "/api/rh/:path*"],
};
