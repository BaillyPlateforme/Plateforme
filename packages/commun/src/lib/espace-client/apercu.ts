import "server-only";
import { desceller, sceller } from "./signature";

/*
 * L'aperçu de l'équipe : depuis le CRM, un membre de l'équipe ouvre l'espace
 * d'un client tel que le client le voit — en lecture seule, sans session du
 * client, sans lien d'accès, sans rien écrire.
 *
 *   1. L'app interne (route /espace-client-apercu/<dossier de l'espace>)
 *      vérifie l'équipe, note l'ouverture au fil d'activité du CRM, puis
 *      remet au navigateur un JETON de deux minutes, lié à un client, qu'il
 *      porte à l'app externe dans le corps d'un POST — jamais dans une
 *      adresse : ni l'historique, ni les journaux HTTP, ni un Referer ne le
 *      voient passer.
 *   2. L'app externe (route /espace-client/apercu) vérifie le jeton et pose
 *      un COOKIE d'une heure, httpOnly, limité à /espace-client, signé lui
 *      aussi.
 *   3. session.ts reconnaît ce cookie : le client est lu par la clé de
 *      service, ses lignes et elles seules (restreindre), et toute écriture
 *      est refusée (exigerClientPourAgir, refuserEnApercu).
 *
 * Le jeton et le cookie ont chacun leur clé (config.ts, `cle(usage)`) : l'un
 * ne vaut rien à la place de l'autre, ni d'un lien de fichier, ni du cookie de
 * la démonstration. ESPACE_CLIENT_SECRET a la même valeur dans les deux apps :
 * ce que l'interne scelle, l'externe le vérifie.
 */

/** Le jeton de passage, de l'app interne à l'app externe. */
const USAGE_JETON = "apercu-equipe";
export const DUREE_JETON_APERCU_MS = 2 * 60 * 1000;

/** Le cookie de l'aperçu, dans l'app externe. */
export const COOKIE_APERCU = "bailly_espace_client_apercu";
const USAGE_COOKIE = "session-apercu";
export const DUREE_APERCU_MS = 60 * 60 * 1000;

/** Ce que répond toute écriture tentée pendant un aperçu. Texte provisoire, à valider. */
export const LECTURE_SEULE = "Aperçu de l'équipe : lecture seule.";

/** c : le client ; r : la référence du dossier à ouvrir ; u : qui l'ouvre (nom ou e-mail de l'équipe). */
export type JetonApercu = { c: string; r: string; u: string; exp: number };
export type CookieApercu = { c: string; u: string; iat: number; exp: number };

/** Un identifiant de client : un UUID en base, « cl-dumont » dans la démonstration en mémoire. */
const ID = /^[\w-]{1,64}$/;
const texte = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** L'app interne, une fois l'équipe vérifiée : le jeton d'un client, valable deux minutes. */
export function emettreJetonApercu(p: { clientId: string; reference: string; par: string }): string {
  const contenu: JetonApercu = { c: p.clientId, r: p.reference, u: p.par.slice(0, 120), exp: Date.now() + DUREE_JETON_APERCU_MS };
  return sceller(contenu, USAGE_JETON);
}

/** L'app externe : le jeton, s'il est signé, encore valable et bien formé ; sinon null. */
export function lireJetonApercu(jeton: string | null | undefined): JetonApercu | null {
  if (!jeton || jeton.length > 2000) return null;
  const j = desceller<JetonApercu>(jeton, USAGE_JETON);
  if (!j || !texte(j.c, 64) || !ID.test(j.c) || !texte(j.r, 64) || !texte(j.u, 120)) return null;
  return j;
}

/** Le contenu du cookie d'aperçu : un client, qui l'a ouvert, une heure. */
export function scellerCookieApercu(j: Pick<JetonApercu, "c" | "u">): string {
  const iat = Date.now();
  const contenu: CookieApercu = { c: j.c, u: j.u, iat, exp: iat + DUREE_APERCU_MS };
  return sceller(contenu, USAGE_COOKIE);
}

/** Le cookie d'aperçu, lu seulement si sa signature et sa durée tiennent. */
export function lireCookieApercu(valeur: string | null | undefined): CookieApercu | null {
  if (!valeur || valeur.length > 2000) return null;
  const a = desceller<CookieApercu>(valeur, USAGE_COOKIE);
  if (!a || !texte(a.c, 64) || !ID.test(a.c) || !texte(a.u, 120)) return null;
  return a;
}

/** Les options du cookie : httpOnly, limité à l'espace client, sécurisé en production. */
export const optionsCookieApercu = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/espace-client",
  maxAge: Math.floor(DUREE_APERCU_MS / 1000),
});
