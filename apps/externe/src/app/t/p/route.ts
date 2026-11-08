import { cookies } from "next/headers";
import { after } from "next/server";
import { noterVisite, requeteDe } from "@/lib/suivi-envois";
import { COOKIE_ATTRIBUTION, lireAttribution, lireJetonVisite } from "@/lib/suivi-envois/jetons";
import { pageDuChemin } from "@/lib/suivi-envois/regles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Une page de l'espace client vue par le client : POST /t/p, envoyé par le
 * navigateur à chaque page d'un dossier (espace-client/_ui/SuiviPortail.tsx).
 *
 * Le corps porte le jeton de visite que la page a reçu du serveur : il n'est
 * remis qu'à la session du client, jamais pendant un aperçu de l'équipe, et
 * il est lié au dossier — on ne peut pas noter la visite d'un autre dossier.
 * Le cookie d'attribution (posé par un clic dans un e-mail, /t/c) rattache la
 * visite à cet e-mail. Répond toujours 204, sans rien dire.
 */
export async function POST(req: Request) {
  const vide = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  let corps: { v?: unknown; p?: unknown };
  try {
    corps = JSON.parse((await req.text()).slice(0, 4000));
  } catch {
    return vide;
  }
  const visite = typeof corps.v === "string" ? lireJetonVisite(corps.v) : null;
  const page = visite && typeof corps.p === "string" ? pageDuChemin(corps.p, visite.r) : null;
  if (!visite || !page) return vide;
  const envoiId = lireAttribution((await cookies()).get(COOKIE_ATTRIBUTION)?.value);
  const r = requeteDe(req.headers);
  after(() => noterVisite(visite, page, envoiId, r));
  return vide;
}
