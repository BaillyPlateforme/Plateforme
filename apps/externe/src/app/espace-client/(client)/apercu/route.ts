import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_APERCU, lireJetonApercu, optionsCookieApercu, scellerCookieApercu } from "@/lib/espace-client/apercu";
import { depot } from "@/lib/espace-client/depot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * L'arrivée d'un aperçu de l'équipe (lib/espace-client/apercu.ts).
 *
 * L'app interne a vérifié l'équipe et noté l'ouverture ; elle envoie ici, par
 * un formulaire POST, un jeton signé de deux minutes, lié à un client. S'il
 * tient, le cookie d'aperçu (une heure, httpOnly, limité à /espace-client)
 * est posé et l'on rejoint le dossier ; sinon, la page de connexion le dit.
 *
 * Rien n'est écrit en base, aucune session du client n'est ouverte, aucun
 * lien d'accès n'est émis ni consommé. Le jeton ne passe jamais par une
 * adresse (GET) et n'est journalisé nulle part.
 */

const entetes = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

const versConnexion = (req: NextRequest) => NextResponse.redirect(new URL("/espace-client/connexion?vue-equipe=invalide", req.url), { status: 303, headers: entetes });

function refus(req: NextRequest) {
  const r = versConnexion(req);
  // Un aperçu précédent ne prend pas la place de celui qu'on vient de refuser.
  r.cookies.delete({ name: COOKIE_APERCU, path: "/espace-client" });
  return r;
}

export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null);
  const jeton = lireJetonApercu(typeof fd?.get("jeton") === "string" ? (fd!.get("jeton") as string) : null);
  if (!jeton) return refus(req);
  const client = await depot()
    .trouver("clients", jeton.c)
    .catch(() => null);
  if (!client) return refus(req);

  const r = NextResponse.redirect(new URL(`/espace-client/${encodeURIComponent(jeton.r)}`, req.url), { status: 303, headers: entetes });
  r.cookies.set(COOKIE_APERCU, scellerCookieApercu(jeton), optionsCookieApercu());
  return r;
}

/** Sans jeton (une adresse ouverte à la main) : la connexion, avec le même message, sans rien effacer. */
export async function GET(req: NextRequest) {
  return versConnexion(req);
}
