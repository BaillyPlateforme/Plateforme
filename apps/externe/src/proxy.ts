import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_APERCU, lireCookieApercu } from "@/lib/espace-client/apercu";
import { lireSession } from "@/lib/supabase/session-proxy";

/*
 * L'app externe : le site public, les espaces pro, l'espace RH des
 * entreprises clientes et l'espace client. Les deux derniers demandent une
 * session Supabase, mais pas la même sorte de compte.
 *
 * - L'espace RH : un compte RH, ou un compte de l'équipe (pour voir ce que
 *   voit une entreprise). Un client de l'espace client n'y entre pas.
 *
 * - L'espace client : un compte de client (app_metadata.role = "client"),
 *   et lui seul — un compte de l'équipe ou RH est renvoyé vers la connexion
 *   de l'espace client. Le proxy rafraîchit la session (les pages, qui ne
 *   peuvent pas écrire de cookie, ne le pourraient pas) et écarte tôt les
 *   visiteurs sans session. Il ne décide pas seul : chaque page, action et
 *   route revérifie la session au registre ec_sessions et la propriété du
 *   dossier, et la base n'ouvre que les lignes du client (RLS). Le proxy
 *   n'est qu'un premier filtre, rapide (le jeton se vérifie localement).
 *
 *   Restent ouvertes sans session : la connexion, la page d'arrivée du lien
 *   (/acces), la déconnexion, les webhooks de paiement (signés : simulé, et
 *   Stripe sous /paiement/webhook/stripe), la porte des fichiers (lien signé,
 *   et elle vérifie elle-même la session), et la boîte de réception de
 *   démonstration (profils fictifs seulement). La tâche de la veille vit
 *   désormais dans l'app interne (/api/taches/veille).
 *
 *   L'aperçu de l'équipe (lib/espace-client/apercu.ts) : son arrivée
 *   (/apercu, qui vérifie elle-même le jeton) est ouverte ; ensuite, son
 *   cookie, dont la signature et l'heure sont vérifiées ici, tient lieu de
 *   session — sans rien ouvrir de plus : les pages le relisent, et les
 *   actions refusent toute écriture pendant l'aperçu.
 */

const PUBLIQUES_ESPACE_CLIENT = [
  "/espace-client/connexion",
  "/espace-client/acces",
  "/espace-client/apercu",
  "/espace-client/deconnexion",
  "/espace-client/paiement/webhook",
  "/espace-client/fichier/",
  "/espace-client/apercu-email/",
];

const estPublique = (chemin: string) => PUBLIQUES_ESPACE_CLIENT.some((p) => (p.endsWith("/") ? chemin.startsWith(p) : chemin === p || chemin.startsWith(`${p}/`)));

export async function proxy(request: NextRequest) {
  const chemin = request.nextUrl.pathname;

  if (chemin === "/espace-client" || chemin.startsWith("/espace-client/")) {
    // Les webhooks de paiement n'ont ni cookie ni session : rien à lire (leur signature fait foi).
    if (chemin.startsWith("/espace-client/paiement/webhook")) return NextResponse.next();
    // En démonstration, sans base ni Supabase Auth, la session est un cookie que les pages lisent elles-mêmes.
    if (process.env.ESPACE_CLIENT_DONNEES === "demo") return NextResponse.next();
    const s = await lireSession(request);
    if (estPublique(chemin)) return s.reponse();
    if (lireCookieApercu(request.cookies.get(COOKIE_APERCU)?.value)) return s.reponse();
    if (!s.valide || s.role !== "client") return s.vers("/espace-client/connexion");
    return s.reponse();
  }

  const s = await lireSession(request);
  // Pour l'espace RH, un client de l'espace client ou un déménageur (outil terrain) n'a pas de session.
  const valide = s.valide && s.role !== "client" && s.role !== "terrain";

  // La connexion des RH est la seule page de l'espace RH qui s'ouvre sans session.
  if (chemin === "/rh/connexion") return valide ? s.vers("/rh") : s.reponse();

  if (!valide) {
    if (s.api) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    return s.vers("/rh/connexion");
  }
  return s.reponse();
}

export const config = {
  // Les photos de public/espace-client (page de connexion, e-mails) restent hors du proxy : elles sont publiques.
  matcher: ["/rh", "/rh/:path*", "/api/rh/:path*", "/espace-client", "/espace-client/((?!.*\\.(?:jpe?g|png|webp|svg|gif|ico)$).*)"],
};
