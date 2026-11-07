import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { lireDonnees } from "./depot";
import { desceller, sceller } from "./signature";
import type { Client } from "./types";

/*
 * La session du client : un cookie signé, posé quand il suit son lien
 * d'accès. Il ne voyage que vers /espace-client (son chemin), n'est pas
 * lisible par le JavaScript de la page, et porte la version d'accès du
 * client : l'équipe peut couper toutes ses sessions d'un clic.
 */

export const COOKIE_CLIENT = "bailly_espace_client";
const DUREE_MS = 12 * 60 * 60 * 1000;

type Contenu = { c: string; v: number; exp: number };

export function cookieSession(client: Pick<Client, "id" | "version_acces">) {
  return {
    name: COOKIE_CLIENT,
    value: sceller({ c: client.id, v: client.version_acces, exp: Date.now() + DUREE_MS }, "session"),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/espace-client",
      maxAge: Math.floor(DUREE_MS / 1000),
    },
  };
}

/** Le client connecté, s'il y en a un et que sa session tient toujours. */
export async function clientConnecte(): Promise<Client | null> {
  const jar = await cookies();
  const s = desceller<Contenu>(jar.get(COOKIE_CLIENT)?.value, "session");
  if (!s) return null;
  const client = (await lireDonnees()).clients.find((c) => c.id === s.c);
  if (!client || client.version_acces !== s.v) return null;
  return client;
}

/** Pour les pages et les actions du client : sans session, retour à la connexion. */
export async function exigerClient(): Promise<Client> {
  const client = await clientConnecte();
  if (!client) redirect("/espace-client/connexion");
  return client;
}
