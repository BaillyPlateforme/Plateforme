import { NextResponse, type NextRequest } from "next/server";
import { lireSession } from "@/lib/supabase/session-proxy";

/*
 * L'app interne : le CRM de Bailly, à la racine, et l'espace équipe sous
 * /dashboard. Tout y demande une session ; un compte RH n'y entre pas — ni
 * ses pages, ni ses données.
 */
export async function proxy(request: NextRequest) {
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

/*
 * Tout passe par le proxy, sauf :
 * - /login, la seule page ouverte sans session ;
 * - les fichiers de Next (_next/static, _next/image), ses pages internes
 *   (_not-found, __nextjs*) et les fichiers statiques de public/ (images,
 *   polices, icônes), reconnus à leur extension ;
 * - /espace-client/demo-equipe, le back-office de démonstration de l'espace
 *   client, conçu pour s'ouvrir sans session sur des données fictives (il
 *   n'existe qu'en développement ou avec ESPACE_CLIENT_DEMO_EQUIPE=1).
 *
 * Une adresse inconnue passe donc par le proxy : sans session, elle mène à la
 * connexion, et la 404 ne s'affiche qu'une fois connecté.
 *
 * Les actions serveur sont des POST vers la page qui les porte : celles du
 * CRM revérifient la session elles-mêmes (src/crm/lib/auth.ts).
 */
export const config = {
  matcher: [
    "/((?!login(?:/|$)|_next/static|_next/image|_not-found|__nextjs|espace-client/demo-equipe|.*\\.(?:ico|png|jpg|jpeg|gif|webp|avif|svg|woff|woff2|ttf|otf)$).*)",
  ],
};
