import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * La session Supabase lue dans le proxy d'une app, et rafraîchie au
 * besoin. Les deux apps (externe et interne) s'en servent : chacune garde ses
 * propres règles d'accès, mais la lecture du jeton est la même.
 *
 * `getClaims()` vérifie la signature du jeton avec les clés publiques du
 * projet, gardées en cache : 1 ms contre 50 à 250 ms pour `getUser()`, qui
 * interroge Supabase à chaque navigation. On ne repasse par le réseau que si
 * le jeton est absent, expiré ou illisible — et c'est alors `getUser()` qui
 * rafraîchit la session et réécrit les cookies.
 */
export async function lireSession(request: NextRequest) {
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
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

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
  /** Une redirection sur la même app, avec en option le chemin d'origine en `redirect`. */
  const vers = (pathname: string, retour = false) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    if (retour) url.searchParams.set("redirect", chemin);
    return NextResponse.redirect(url);
  };

  // `response` peut avoir été remplacée par setAll : on la lit au dernier moment.
  return { valide, role, chemin, api: chemin.startsWith("/api/"), vers, reponse: () => response };
}
