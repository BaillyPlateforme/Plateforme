import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Protège /dashboard/* : redirige vers /login si pas de session.
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

  if (!valide) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    valide = !!user;
  }

  if (!valide) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
