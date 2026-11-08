import { after } from "next/server";
import { noterOuverture, requeteDe } from "@/lib/suivi-envois";
import { lireJetonEnvoi } from "@/lib/suivi-envois/jetons";
import { GIF_TRANSPARENT } from "@/lib/suivi-envois/regles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le pixel d'ouverture d'un e-mail suivi : /t/o/<jeton>.gif (lib/suivi-envois).
 *
 * Il répond toujours la même image transparente, jeton valable ou non — rien
 * ne se devine en essayant —, sans cache, et note l'ouverture APRÈS la
 * réponse : la messagerie n'attend jamais la base. Un jeton qui n'est pas
 * signé par la plateforme ne note rien.
 */
const GIF = Buffer.from(GIF_TRANSPARENT, "base64");

export async function GET(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const envoiId = lireJetonEnvoi((await params).jeton);
  if (envoiId) {
    const r = requeteDe(req.headers);
    after(() => noterOuverture(envoiId, r));
  }
  return new Response(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
