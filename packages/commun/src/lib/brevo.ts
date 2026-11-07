import "server-only";
import { env } from "@/lib/env";

/*
 * La connexion au compte Brevo, pour l'écran des Paramètres.
 *
 * Les envois, eux, ne passent plus par ici : tout e-mail et tout SMS part
 * par le module d'envoi (lib/envois), seul à appeler Brevo, après ses
 * garde-fous et son journal.
 */

const BREVO = "https://api.brevo.com/v3";

// Vérifie la validité de la clé (compte).
// L'appel sort chez Brevo : 200 à 400 ms, à chaque ouverture des paramètres.
// L'état ne bouge pas d'une minute à l'autre, on le garde en mémoire.
let cacheBrevo: { a: number; v: { ok: boolean; message: string } } | null = null;
const TTL_BREVO = 60_000;

export async function checkBrevo(): Promise<{ ok: boolean; message: string }> {
  if (!env.brevoApiKey()) return { ok: false, message: "Aucune clé Brevo configurée." };
  if (cacheBrevo && Date.now() - cacheBrevo.a < TTL_BREVO) return cacheBrevo.v;
  const garder = (v: { ok: boolean; message: string }) => {
    cacheBrevo = { a: Date.now(), v };
    return v;
  };
  try {
    const res = await fetch(`${BREVO}/account`, { headers: { "api-key": env.brevoApiKey(), accept: "application/json" } });
    if (res.ok) return garder({ ok: true, message: "Connexion Brevo active." });
    const body = await res.text();
    return garder({ ok: false, message: `Brevo ${res.status} : ${body.slice(0, 200)}` });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur" };
  }
}
