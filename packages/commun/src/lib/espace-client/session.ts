import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/auth";
import { roleDuCompte } from "@/lib/supabase/roles";
import { createServiceClient } from "@/lib/supabase/server";
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
 */

/** Le cookie de la démonstration, et lui seul : en base, la session est celle de Supabase. */
export const COOKIE_DEMO = "bailly_espace_client_demo";
const DUREE_MS = DUREE_SESSION_H * 60 * 60 * 1000;

type ContenuDemo = { c: string; iat: number; exp: number };

/** Le client connecté, s'il y en a un et que sa session tient toujours. Une fois par requête. */
export const clientConnecte = cache(async (): Promise<Client | null> => {
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

/** Pour les pages et les actions du client : sans session, retour à la connexion. */
export async function exigerClient(): Promise<Client> {
  const client = await clientConnecte();
  if (!client) redirect("/espace-client/connexion");
  return client;
}

/**
 * Ce que le client connecté a le droit de lire — en base, par la RLS, avec
 * sa propre session. Une fois par requête : la mise en page et la page le
 * demandent toutes les deux.
 */
export const lireDonneesClient = cache(async (): Promise<Donnees> => {
  const client = await exigerClient();
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
 */
export async function fermerSession() {
  if (estDemo()) {
    (await cookies()).delete({ name: COOKIE_DEMO, path: "/espace-client" });
    return;
  }
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const sessionId = typeof data?.claims?.session_id === "string" ? data.claims.session_id : null;
  if (sessionId && roleDuCompte(data?.claims?.app_metadata) === "client") {
    await avecDelai(createServiceClient().from("ec_sessions").update({ fermee_le: maintenant() }).eq("session_id", sessionId).is("fermee_le", null)).catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
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
