import "server-only";
import { desceller, sceller } from "./signature";

/*
 * L'aperçu de l'équipe : depuis le CRM, un membre de l'équipe ouvre l'espace
 * d'un client tel que le client le voit, sans session du client et sans lien
 * d'accès. Deux modes :
 *
 *   - « lecture » : toute l'équipe. Rien ne s'écrit.
 *   - « edition » : les super admins (lib/droits.ts). Les gestes du client
 *     passent, au nom du client mais tracés comme ceux de l'équipe ; ceux qui
 *     n'appartiennent qu'au client restent refusés (connexion, paiement,
 *     signature, consentement, message en son nom : session.ts et
 *     actions/espace-client.ts).
 *
 *   1. L'app interne (route /espace-client-apercu/<dossier de l'espace>, avec
 *      ?mode=edition pour l'édition) vérifie l'équipe — et pour l'édition,
 *      le droit de super admin, côté serveur —, note l'ouverture au fil
 *      d'activité du CRM, puis remet au navigateur un JETON de deux minutes,
 *      lié à un client et à un mode, qu'il porte à l'app externe dans le corps
 *      d'un POST — jamais dans une adresse : ni l'historique, ni les journaux
 *      HTTP, ni un Referer ne le voient passer.
 *   2. L'app externe (route /espace-client/apercu) vérifie le jeton et pose
 *      un COOKIE signé, httpOnly, limité à /espace-client : une heure en
 *      lecture, trente minutes en édition.
 *   3. session.ts reconnaît ce cookie : le client est lu par la clé de
 *      service, ses lignes et elles seules (restreindre). En édition, le droit
 *      de l'auteur (`e`, son adresse) est relu dans team_members à CHAQUE
 *      requête : retiré, l'édition retombe en lecture ; parti de l'équipe,
 *      l'aperçu s'arrête.
 *
 * Le jeton et le cookie ont chacun leur clé (config.ts, `cle(usage)`) : l'un
 * ne vaut rien à la place de l'autre, ni d'un lien de fichier, ni du cookie de
 * la démonstration. ESPACE_CLIENT_SECRET a la même valeur dans les deux apps :
 * ce que l'interne scelle, l'externe le vérifie.
 */

export type ModeApercu = "lecture" | "edition";

/** Le jeton de passage, de l'app interne à l'app externe. */
const USAGE_JETON = "apercu-equipe";
export const DUREE_JETON_APERCU_MS = 2 * 60 * 1000;

/** Le cookie de l'aperçu, dans l'app externe : une heure en lecture, trente minutes en édition. */
export const COOKIE_APERCU = "bailly_espace_client_apercu";
const USAGE_COOKIE = "session-apercu";
export const DUREES_APERCU_MS: Record<ModeApercu, number> = { lecture: 60 * 60 * 1000, edition: 30 * 60 * 1000 };

/** Ce que répond toute écriture tentée pendant un aperçu en lecture. Texte provisoire, à valider. */
export const LECTURE_SEULE = "Aperçu de l'équipe : lecture seule.";
/** Ce que répond, en édition, un geste qui n'appartient qu'au client. Texte provisoire, à valider. */
export const RESERVE_AU_CLIENT = "Édition par l'équipe : ce geste n'appartient qu'au client (connexion, paiement, signature, consentement, message en son nom).";

/**
 * c : le client ; r : la référence du dossier à ouvrir ; u : qui l'ouvre (nom
 * ou e-mail de l'équipe) ; e : son adresse, pour relire son droit ; m : le mode.
 */
export type JetonApercu = { c: string; r: string; u: string; e: string; m: ModeApercu; exp: number };
export type CookieApercu = { c: string; u: string; e: string; m: ModeApercu; iat: number; exp: number };

/** Un identifiant de client : un UUID en base, « cl-dumont » dans la démonstration en mémoire. */
const ID = /^[\w-]{1,64}$/;
const texte = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Le mode lu dans un jeton ou un cookie : absent (aperçus ouverts avant
 * l'édition), c'est la lecture ; inconnu, rien ne vaut. L'édition exige
 * l'adresse de son auteur.
 */
function modeLu(o: { m?: unknown; e?: unknown }): ModeApercu | null {
  if (o.m === undefined || o.m === "lecture") return "lecture";
  if (o.m === "edition" && texte(o.e, 254)) return "edition";
  return null;
}

/** L'app interne, une fois l'équipe (et pour l'édition, le super admin) vérifiée : le jeton d'un client, deux minutes. */
export function emettreJetonApercu(p: { clientId: string; reference: string; par: string; email: string; mode: ModeApercu }): string {
  const contenu: JetonApercu = {
    c: p.clientId, r: p.reference, u: p.par.slice(0, 120), e: p.email.trim().toLowerCase().slice(0, 254), m: p.mode, exp: Date.now() + DUREE_JETON_APERCU_MS,
  };
  return sceller(contenu, USAGE_JETON);
}

/** L'app externe : le jeton, s'il est signé, encore valable et bien formé ; sinon null. */
export function lireJetonApercu(jeton: string | null | undefined): JetonApercu | null {
  if (!jeton || jeton.length > 2000) return null;
  const j = desceller<JetonApercu>(jeton, USAGE_JETON);
  if (!j || !texte(j.c, 64) || !ID.test(j.c) || !texte(j.r, 64) || !texte(j.u, 120)) return null;
  const m = modeLu(j);
  return m ? { ...j, e: typeof j.e === "string" ? j.e : "", m } : null;
}

/** Le contenu du cookie d'aperçu : un client, qui l'a ouvert, son mode, sa durée. */
export function scellerCookieApercu(j: Pick<JetonApercu, "c" | "u" | "e" | "m">): string {
  const iat = Date.now();
  const contenu: CookieApercu = { c: j.c, u: j.u, e: j.e, m: j.m, iat, exp: iat + DUREES_APERCU_MS[j.m] };
  return sceller(contenu, USAGE_COOKIE);
}

/** Le cookie d'aperçu, lu seulement si sa signature et sa durée tiennent. */
export function lireCookieApercu(valeur: string | null | undefined): CookieApercu | null {
  if (!valeur || valeur.length > 2000) return null;
  const a = desceller<CookieApercu>(valeur, USAGE_COOKIE);
  if (!a || !texte(a.c, 64) || !ID.test(a.c) || !texte(a.u, 120)) return null;
  const m = modeLu(a);
  return m ? { ...a, e: typeof a.e === "string" ? a.e : "", m } : null;
}

/** Les options du cookie : httpOnly, limité à l'espace client, sécurisé en production, durée selon le mode. */
export const optionsCookieApercu = (mode: ModeApercu) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/espace-client",
  maxAge: Math.floor(DUREES_APERCU_MS[mode] / 1000),
});
