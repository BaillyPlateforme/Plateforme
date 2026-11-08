import { after } from "next/server";
import { adresseSuivi, lienSuivi, noterClic, requeteDe } from "@/lib/suivi-envois";
import { COOKIE_ATTRIBUTION, jetonAttribution, lireJetonEnvoi } from "@/lib/suivi-envois/jetons";
import { ATTRIBUTION_MIN } from "@/lib/suivi-envois/regles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Un lien suivi d'un e-mail : /t/c/<jeton>?l=<indice> (lib/suivi-envois).
 *
 * Ce n'est PAS une redirection ouverte : l'adresse ne porte que le jeton
 * signé de l'e-mail et le numéro du lien ; la destination est relue dans la
 * base (public.envois_liens, chiffrée), telle que l'e-mail l'a écrite.
 * Personne ne peut fabriquer un lien vers ailleurs. Un jeton faux, un lien
 * inconnu ou expiré (13 mois) mène à l'accueil du site, sans rien noter.
 *
 * Vers l'espace client, un cookie de trente minutes, limité à /t, rattache
 * à l'e-mail les pages que le client y verra ensuite (/t/p).
 */
function accueil(req: Request) {
  return new URL("/", adresseSuivi() ?? new URL(req.url).origin);
}

const sansCache = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const envoiId = lireJetonEnvoi((await params).jeton);
  const indice = Number(new URL(req.url).searchParams.get("l"));
  const lien = envoiId && Number.isInteger(indice) ? await lienSuivi(envoiId, indice) : null;
  if (!envoiId || !lien) return new Response(null, { status: 302, headers: { Location: accueil(req).toString(), ...sansCache } });

  const r = requeteDe(req.headers);
  after(() => noterClic(envoiId, { indice, libelle: lien.libelle, destination: lien.destination }, r));

  const entetes = new Headers({ Location: lien.url, ...sansCache });
  // Vers l'espace client de cette app : les pages vues ensuite viennent de cet e-mail.
  try {
    const dest = new URL(lien.url);
    const ici = new URL(adresseSuivi() ?? new URL(req.url).origin);
    const hote = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if ((dest.host === ici.host || dest.host === hote) && dest.pathname.startsWith("/espace-client")) {
      const secure = dest.protocol === "https:" ? "; Secure" : "";
      entetes.append(
        "Set-Cookie",
        `${COOKIE_ATTRIBUTION}=${jetonAttribution(envoiId, ATTRIBUTION_MIN * 60_000)}; Path=/t; Max-Age=${ATTRIBUTION_MIN * 60}; HttpOnly; SameSite=Lax${secure}`,
      );
    }
  } catch {
    // Une adresse illisible n'empêche pas la redirection.
  }
  return new Response(null, { status: 302, headers: entetes });
}
