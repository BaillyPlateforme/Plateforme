import { NextResponse, type NextRequest } from "next/server";
import { lireSession } from "@/lib/supabase/session-proxy";
import { estMembreEquipe } from "@/lib/supabase/equipe";

/*
 * L'app interne : le CRM de Bailly, à la racine, et l'espace équipe sous
 * /dashboard. Tout y demande une session d'un membre de l'équipe — un compte
 * inscrit dans team_members.
 *
 * Un compte RH ou un client de l'espace client a bien une session Supabase
 * (même authentification) mais n'entre pas : ni ses pages, ni ses données, ni
 * ses actions serveur (qui passent par les mêmes adresses). Chacun est renvoyé
 * vers son espace, dans l'app externe. Tout autre compte est refusé.
 */
/*
 * L'outil terrain des déménageurs (/terrain, et ses routes /api/terrain) :
 * un compte « terrain » n'ouvre que lui — toute autre adresse l'y ramène —,
 * et sa connexion (/terrain/connexion) s'ouvre sans session. Les membres de
 * l'équipe l'ouvrent aussi. Les pages, actions et routes de l'outil
 * revérifient le compte et son état (src/terrain/lib/acces.ts).
 */
const CONNEXION_TERRAIN = "/terrain/connexion";
/** La seule page d'un compte « marketing » (une agence de Bailly) : le suivi des leads, sans les coordonnées des clients. */
const LEADS = "/leads";
const estTerrain = (c: string) => c === "/terrain" || c.startsWith("/terrain/") || c.startsWith("/api/terrain/");

export async function proxy(request: NextRequest) {
  const s = await lireSession(request);

  if (s.chemin === CONNEXION_TERRAIN) return s.valide && s.role === "terrain" ? s.vers("/terrain") : s.reponse();

  if (!s.valide) {
    if (s.api) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    return s.vers(estTerrain(s.chemin) ? CONNEXION_TERRAIN : "/login", true);
  }

  if (s.role === "terrain") {
    if (estTerrain(s.chemin)) return s.reponse();
    if (s.api) return NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
    return s.vers("/terrain");
  }

  // Une agence de marketing (lib/marketing.ts) : le suivi des leads anonymisé, en lecture seule, et rien d'autre.
  // Ni route API ni autre page : toute autre adresse la ramène à /leads. La page revérifie le compte elle-même.
  if (s.role === "marketing") {
    if (s.chemin === LEADS) return s.reponse();
    if (s.api) return NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
    return s.vers(LEADS);
  }

  if (s.role === "rh" || s.role === "client") {
    if (s.api) return NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
    const externe = process.env.NEXT_PUBLIC_URL_EXTERNE;
    const chez = s.role === "rh" ? "/rh" : "/espace-client";
    return externe ? NextResponse.redirect(new URL(chez, externe)) : NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
  }

  if (!(await estMembreEquipe(s.email))) {
    if (s.api) return NextResponse.json({ error: "Accès réservé à l'équipe" }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?refus=1";
    return NextResponse.redirect(url);
  }

  return s.reponse();
}

/*
 * Tout passe par le proxy, sauf :
 * - /login, la page de connexion ;
 * - /signature/…, la page où le client signe son devis depuis le lien qu'on
 *   lui envoie : il n'a pas de compte, le jeton du lien en tient lieu (la page
 *   et son action le vérifient, src/crm/actions2.ts) ;
 * - les fichiers de Next (_next/static, _next/image), ses pages internes
 *   (_not-found, __nextjs*) et les fichiers statiques de public/ (images,
 *   polices, icônes), reconnus à leur extension ;
 * - /espace-client/demo-equipe, le back-office de démonstration de l'espace
 *   client, conçu pour s'ouvrir sans session sur des données fictives (il
 *   n'existe qu'en développement ou avec ESPACE_CLIENT_DEMO_EQUIPE=1) ;
 * - /api/taches/…, les tâches planifiées (la veille) : un cron n'a pas de
 *   session ; chaque route exige son secret (TACHES_SECRET), et n'existe pas
 *   sans lui (src/app/api/taches/veille/route.ts) ;
 * - /api/sms/…, le webhook des réponses SMS de Brevo : même principe, avec
 *   SMS_REPONSES_SECRET (src/app/api/sms/reponses/route.ts) ;
 * - /desabonnement/…, le lien de désabonnement des alertes de l'équipe : le
 *   jeton signé du lien en tient lieu (src/crm/alertes/actions.ts).
 *
 * Une adresse inconnue passe donc par le proxy : sans session, elle mène à la
 * connexion, et la 404 ne s'affiche qu'une fois connecté.
 *
 * Les actions serveur sont des POST vers la page qui les porte : celles du
 * CRM revérifient la session elles-mêmes (src/crm/lib/auth.ts).
 */
export const config = {
  matcher: [
    // Seuls les VRAIS fichiers publics passent sans proxy : ceux de la racine (favicon, icônes, photo de
    // connexion) et des dossiers fonts/, marque/, photos-crm/ de public/. Avant le 13/11/2026, toute
    // adresse finissant par « .png » y échappait, y compris /api/data/espace-client/…/x.png, qui
    // répondait sans session, et les pages à segment libre (/clients/12.png).
    "/((?!login(?:/|$)|signature/|desabonnement/|api/taches/|api/sms/|_next/static|_next/image|_not-found|__nextjs|espace-client/demo-equipe|(?:fonts/|marque/|photos-crm/)?[^/]+\\.(?:ico|png|jpg|jpeg|gif|webp|avif|svg|woff|woff2|ttf|otf)$).*)",
  ],
};
