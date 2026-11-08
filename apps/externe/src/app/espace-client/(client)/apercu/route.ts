import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_APERCU, lireJetonApercu, optionsCookieApercu, scellerCookieApercu } from "@/lib/espace-client/apercu";
import { depot } from "@/lib/espace-client/depot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * L'arrivée d'un aperçu de l'équipe (lib/espace-client/apercu.ts).
 *
 * L'app interne a vérifié l'équipe (et pour l'édition, le super admin) et
 * noté l'ouverture ; elle envoie ici, par un formulaire POST, un jeton signé
 * de deux minutes, lié à un client et à un mode. S'il tient, le cookie
 * d'aperçu (httpOnly, limité à /espace-client ; une heure en lecture, trente
 * minutes en édition) est posé et l'on rejoint le dossier ; sinon, la page de
 * connexion le dit. Le droit d'éditer est relu à chaque requête (session.ts).
 *
 * Rien n'est écrit en base, aucune session du client n'est ouverte, aucun
 * lien d'accès n'est émis ni consommé. Le jeton ne passe jamais par une
 * adresse (GET) et n'est journalisé nulle part.
 */

const entetes = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/*
 * Des redirections RELATIVES : derrière le proxy de Railway, req.url est l'adresse interne
 * (https://localhost:8080) ; une adresse absolue bâtie dessus partait là, et le navigateur
 * la refusait (form-action de la page d'ouverture).
 */
const versChemin = (chemin: string) => new NextResponse(null, { status: 303, headers: { ...entetes, Location: chemin } });
const versConnexion = () => versChemin("/espace-client/connexion?vue-equipe=invalide");

function refus() {
  const r = versConnexion();
  // Un aperçu précédent ne prend pas la place de celui qu'on vient de refuser.
  r.cookies.delete({ name: COOKIE_APERCU, path: "/espace-client" });
  return r;
}

export async function POST(req: NextRequest) {
  const fd = await req.formData().catch(() => null);
  const jeton = lireJetonApercu(typeof fd?.get("jeton") === "string" ? (fd!.get("jeton") as string) : null);
  if (!jeton) return refus();
  const client = await depot()
    .trouver("clients", jeton.c)
    .catch(() => null);
  if (!client) return refus();

  const r = versChemin(`/espace-client/${encodeURIComponent(jeton.r)}`);
  r.cookies.set(COOKIE_APERCU, scellerCookieApercu(jeton), optionsCookieApercu(jeton.m));
  return r;
}

/** Sans jeton (une adresse ouverte à la main) : la connexion, avec le même message, sans rien effacer. */
export async function GET() {
  return versConnexion();
}
