import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/auth";
import { roleDuCompte } from "@/lib/supabase/roles";
import { createServiceClient } from "@/lib/supabase/server";
import { membreParEmail, porteSuperAdmin } from "@/lib/droits";
import { COOKIE_APERCU, LECTURE_SEULE, lireCookieApercu, RESERVE_AU_CLIENT, type CookieApercu, type ModeApercu } from "./apercu";
import { DUREE_SESSION_H, estDemo } from "./config";
import { avecDelai, depot, maintenant } from "./depot";
import { desceller, sceller } from "./signature";
import type { Client, Donnees } from "./types";

/*
 * La session du client.
 *
 * En base, c'est une session Supabase Auth, posée dans les cookies par
 * @supabase/ssr au clic « Accéder » de la page d'arrivée (acces.ts), et
 * rafraîchie par le proxy de l'app externe. Elle ne suffit pas : elle doit
 * figurer au registre ec_sessions, ouverte par un lien, ni fermée, ni
 * expirée (12 heures), ni coupée par l'équipe. C'est la base qui le vérifie,
 * dans la fonction ec_client_courant() sur laquelle reposent toutes les
 * politiques RLS : le serveur lit la ligne du client avec la clé publique et
 * la session — s'il ne la reçoit pas, il n'y a pas de client connecté.
 *
 * En démonstration, sans base ni Supabase Auth, un cookie signé en tient
 * lieu ; il n'est lu qu'en démonstration.
 *
 * L'aperçu de l'équipe (apercu.ts) : un membre de l'équipe voit l'espace
 * d'un client depuis le CRM, en lecture seule — ou, s'il est super admin, en
 * édition. Son cookie signé passe AVANT toute autre session, en base comme en
 * démonstration, mais seulement tant qu'il est valable (signature et heure) :
 * il ne se mélange jamais à une vraie session du client ouverte dans le même
 * navigateur — l'une ou l'autre, jamais les deux. Pendant l'aperçu :
 *   - le client est lu par la clé de service, et ses données par
 *     `lireDuClient`, qui ne rend que ses lignes (restreindre) ;
 *   - en lecture, toute écriture est refusée (exigerClientPourAgir,
 *     refuserEnApercu) ; en édition, les gestes du client passent
 *     (exigerClientPourAgir), sauf ceux qui n'appartiennent qu'à lui
 *     (refuserEnApercu : connexion, paiement, signature, consentement,
 *     message en son nom) ;
 *   - le droit de l'auteur d'une édition est relu dans team_members à chaque
 *     requête : retiré, l'édition retombe en lecture ; parti de l'équipe (ou
 *     désactivé), l'aperçu s'arrête ; illisible, c'est la lecture ;
 *   - ni ec_sessions ni lien d'accès ne sont touchés : les indicateurs de
 *     l'équipe (« vu par le client le… ») restent ceux du client ;
 *   - « Se déconnecter » ne fait que quitter l'aperçu.
 * Le cookie expiré ou effacé, la session ordinaire reprend ses droits.
 */

/** Le cookie de la démonstration, et lui seul : en base, la session est celle de Supabase. */
export const COOKIE_DEMO = "bailly_espace_client_demo";
const DUREE_MS = DUREE_SESSION_H * 60 * 60 * 1000;

type ContenuDemo = { c: string; iat: number; exp: number };

type ApercuEnCours = CookieApercu & { mode: ModeApercu };

/**
 * L'aperçu de l'équipe en cours : son cookie, s'il est signé et encore
 * valable, avec son mode EFFECTIF. Une édition n'en est une que si son auteur
 * est toujours super admin actif, relu sans cache ; sinon elle retombe en
 * lecture, et s'il n'est plus de l'équipe, il n'y a plus d'aperçu. Une fois
 * par requête.
 */
const apercuEnCours = cache(async (): Promise<ApercuEnCours | null> => {
  const a = lireCookieApercu((await cookies()).get(COOKIE_APERCU)?.value);
  if (!a) return null;
  if (a.m !== "edition") return { ...a, mode: "lecture" };
  const auteur = await membreParEmail(a.e).catch(() => undefined);
  // Illisible (base injoignable) : la lecture, jamais l'édition.
  if (auteur === undefined) return { ...a, mode: "lecture" };
  if (!auteur?.actif) return null;
  return { ...a, mode: porteSuperAdmin(auteur) ? "edition" : "lecture" };
});

/** Le client connecté, s'il y en a un et que sa session tient toujours. Une fois par requête. */
export const clientConnecte = cache(async (): Promise<Client | null> => {
  // L'aperçu de l'équipe passe avant tout, et seul : sans son client, personne n'est connecté.
  const apercu = await apercuEnCours();
  if (apercu) return clientApercu(apercu.c);
  if (estDemo()) return clientDemo();
  try {
    const supabase = await createAuthClient();
    const { data } = await avecDelai(supabase.auth.getClaims(), 5000, "Supabase ne répond pas.");
    const claims = data?.claims;
    // Un compte de l'équipe ou un compte RH n'ouvre pas l'espace client.
    if (!claims?.sub || roleDuCompte(claims.app_metadata) !== "client") return null;
    // La RLS ne rend cette ligne qu'à une session inscrite au registre et encore valable.
    const { data: lignes, error } = await avecDelai(supabase.from("ec_clients").select("*").limit(1));
    if (error || !lignes?.length) return null;
    const client = lignes[0] as Client;
    return client.auth_user_id === claims.sub ? client : null;
  } catch {
    return null;
  }
});

/** Pour les pages du client, qui lisent : sans session, retour à la connexion. */
export async function exigerClient(): Promise<Client> {
  const client = await clientConnecte();
  if (!client) redirect("/espace-client/connexion");
  return client;
}

/**
 * Qui regarde l'espace, quand c'est l'équipe : `par`, le nom (ou l'e-mail)
 * de celui qui a ouvert l'aperçu depuis le CRM, et le mode effectif. Null
 * hors aperçu.
 */
export async function apercuEquipe(): Promise<{ par: string; mode: ModeApercu } | null> {
  const a = await apercuEnCours();
  return a && (await clientConnecte()) ? { par: a.u, mode: a.mode } : null;
}

/** L'auteur d'une édition en cours (super admin vérifié à cette requête) ; null hors édition. */
export async function editionEquipe(): Promise<{ par: string; email: string } | null> {
  const a = await apercuEnCours();
  return a?.mode === "edition" ? { par: a.u, email: a.e } : null;
}

/**
 * La garde des gestes qui n'appartiennent qu'au client — se connecter,
 * payer, signer, consentir, écrire en son nom : refusés pendant tout aperçu
 * de l'équipe, en lecture comme en édition, quel que soit le chemin (bouton,
 * ou POST fabriqué à la main).
 */
export async function refuserEnApercu(): Promise<void> {
  const a = await apercuEnCours();
  if (a) throw new Error(a.mode === "edition" ? RESERVE_AU_CLIENT : LECTURE_SEULE);
}

/**
 * Pour les actions du client, qui écrivent : la session ; refusée pendant un
 * aperçu en lecture ; permise pendant une édition par un super admin (que
 * l'action trace alors comme un geste de l'équipe : actions/espace-client.ts).
 */
export async function exigerClientPourAgir(): Promise<Client> {
  const a = await apercuEnCours();
  if (a && a.mode !== "edition") throw new Error(LECTURE_SEULE);
  return exigerClient();
}

/**
 * Ce que le client connecté a le droit de lire — en base, par la RLS, avec
 * sa propre session. Une fois par requête : la mise en page et la page le
 * demandent toutes les deux.
 *
 * Pendant un aperçu de l'équipe, il n'y a pas de session du client pour la
 * RLS : ses lignes sont lues par la clé de service, filtrées par client
 * (`lireDuClient` couvre toutes les tables que lit une session de client),
 * puis passées par `restreindre`, la même règle que les politiques RLS.
 */
export const lireDonneesClient = cache(async (): Promise<Donnees> => {
  const client = await exigerClient();
  if (await apercuEnCours()) return depot().lireDuClient(client.id);
  return depot().lireClient(client.id);
});

// --- Ouvrir et fermer (base) ------------------------------------------------------------------------

/** La revendication `session_id` d'un jeton d'accès Supabase. */
function sessionDuJeton(jeton: string): string | null {
  try {
    const charge = JSON.parse(Buffer.from(jeton.split(".")[1] ?? "", "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof charge.session_id === "string" ? charge.session_id : null;
  } catch {
    return null;
  }
}

export type IssueOuverture = { ok: true } | { ok: false; raison: "utilise" | "inconnu" };

/**
 * Le clic « Accéder » : échange le jeton du lien contre une session Supabase
 * (cookies posés par @supabase/ssr), vérifie que c'est bien le compte du
 * client visé, puis inscrit la session au registre. Sans cette inscription,
 * la session ne lirait rien.
 */
export async function ouvrirSessionBase(
  client: Pick<Client, "id">,
  tokenHash: string,
  compteAttendu: string,
  trace: { ip: string; user_agent: string },
): Promise<IssueOuverture> {
  const supabase = await createAuthClient();
  const { data, error } = await avecDelai(supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" }), 8000, "Supabase ne répond pas.");
  if (error || !data.session || !data.user) return { ok: false, raison: "utilise" };
  const sessionId = sessionDuJeton(data.session.access_token);
  if (data.user.id !== compteAttendu || roleDuCompte(data.user.app_metadata) !== "client" || !sessionId) {
    // Pas le compte attendu : la session ouverte se referme aussitôt.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { ok: false, raison: "inconnu" };
  }
  const { error: e2 } = await avecDelai(
    createServiceClient().from("ec_sessions").insert({
      session_id: sessionId,
      client_id: client.id,
      auth_user_id: data.user.id,
      expire_le: new Date(Date.now() + DUREE_MS).toISOString(),
      ip: trace.ip,
      user_agent: trace.user_agent,
    }),
  );
  if (e2) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new Error(`Ouverture de la session impossible : ${e2.message}`);
  }
  return { ok: true };
}

/**
 * La déconnexion : la session sort du registre (elle ne lit plus rien, même
 * si son jeton vit encore quelques minutes), puis Supabase la révoque et
 * efface ses cookies.
 *
 * Pendant un aperçu de l'équipe, elle ne fait que quitter l'aperçu : son
 * cookie s'efface, et une vraie session du client ouverte dans le même
 * navigateur n'est pas touchée. Elle rend alors `apercu: true`.
 */
export async function fermerSession(): Promise<{ apercu: boolean }> {
  const jar = await cookies();
  if (jar.get(COOKIE_APERCU)) {
    const valable = !!(await apercuEnCours());
    jar.delete({ name: COOKIE_APERCU, path: "/espace-client" });
    if (valable) return { apercu: true };
  }
  if (estDemo()) {
    jar.delete({ name: COOKIE_DEMO, path: "/espace-client" });
    return { apercu: false };
  }
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const sessionId = typeof data?.claims?.session_id === "string" ? data.claims.session_id : null;
  if (sessionId && roleDuCompte(data?.claims?.app_metadata) === "client") {
    await avecDelai(createServiceClient().from("ec_sessions").update({ fermee_le: maintenant() }).eq("session_id", sessionId).is("fermee_le", null)).catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  return { apercu: false };
}

// --- L'aperçu de l'équipe -------------------------------------------------------------------------------

/**
 * Le client de l'aperçu, lu par la clé de service (en base) ou dans la
 * mémoire (en démonstration) : il n'a pas de session à lui. La révocation des
 * sessions du client ne coupe pas l'aperçu, qui n'en est pas une.
 */
async function clientApercu(id: string): Promise<Client | null> {
  try {
    return await depot().trouver("clients", id);
  } catch {
    return null;
  }
}

// --- La démonstration ----------------------------------------------------------------------------------

async function clientDemo(): Promise<Client | null> {
  const jar = await cookies();
  const s = desceller<ContenuDemo>(jar.get(COOKIE_DEMO)?.value, "session-demo");
  if (!s) return null;
  const client = (await depot().lire()).clients.find((c) => c.id === s.c);
  if (!client) return null;
  if (client.sessions_revoquees_le && new Date(client.sessions_revoquees_le).getTime() >= s.iat) return null;
  return client;
}

/** Ouvre la session de démonstration : un cookie signé, limité à /espace-client. */
export async function ouvrirSessionDemo(client: Pick<Client, "id">) {
  const maintenantMs = Date.now();
  (await cookies()).set(COOKIE_DEMO, sceller({ c: client.id, iat: maintenantMs, exp: maintenantMs + DUREE_MS }, "session-demo"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/espace-client",
    maxAge: Math.floor(DUREE_MS / 1000),
  });
}
