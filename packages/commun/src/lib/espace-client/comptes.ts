import "server-only";
import { roleDuCompte } from "@/lib/supabase/roles";
import { createServiceClient } from "@/lib/supabase/server";
import { avecDelai } from "./depot";
import type { Client } from "./types";

/*
 * Les comptes Supabase Auth des clients (mode « base »).
 *
 * Un client = un compte sans mot de passe, confirmé d'office, marqué
 * app_metadata.role = "client" (et demo = true pour un client fictif). Le
 * serveur le crée au premier lien d'accès, avec la clé de service.
 *
 * Règle absolue : on ne touche JAMAIS à un compte qui n'est pas celui d'un
 * client. Si l'adresse appartient déjà à l'équipe ou à un compte RH, rien
 * n'est créé, rien n'est modifié, aucun lien ne part : l'équipe est prévenue
 * et choisit une autre adresse.
 */

export class AdresseDejaPrise extends Error {
  constructor() {
    super("Cette adresse est celle d'un compte de l'équipe ou d'un compte RH : l'espace client ne peut pas s'y rattacher. Utilisez une autre adresse pour ce client.");
  }
}

type CompteExistant = { id: string; role: string | null };

/** Le compte Auth de cette adresse, s'il existe (fonction SQL réservée à la clé de service). */
async function compteDeLAdresse(email: string): Promise<CompteExistant | null> {
  const { data, error } = await avecDelai(createServiceClient().rpc("ec_compte_auth", { p_email: email }));
  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);
  const ligne = (data as CompteExistant[] | null)?.[0];
  return ligne ?? null;
}

/** Lève AdresseDejaPrise si l'adresse est celle d'un compte de l'équipe ou d'un compte RH. */
export async function verifierAdresseLibre(email: string) {
  const existant = await compteDeLAdresse(email);
  if (existant && existant.role !== "client") throw new AdresseDejaPrise();
}

/**
 * Le compte Auth du client, créé au besoin. Rend son identifiant, après avoir
 * vérifié qu'il s'agit bien d'un compte de client à cette adresse.
 */
export async function assurerCompte(client: Pick<Client, "id" | "email" | "auth_user_id" | "demo">): Promise<string> {
  const service = createServiceClient();

  if (client.auth_user_id) {
    const { data, error } = await avecDelai(service.auth.admin.getUserById(client.auth_user_id));
    const u = data?.user;
    if (!error && u && roleDuCompte(u.app_metadata) === "client" && u.email?.toLowerCase() === client.email) return u.id;
    // Le compte rattaché n'est plus celui de cette adresse : on ne s'en sert pas.
    if (!error && u) throw new Error("Le compte de connexion de ce client ne correspond plus à son adresse : enregistrez à nouveau sa fiche.");
  }

  let id: string | null = null;
  const existant = await compteDeLAdresse(client.email);
  if (existant) {
    if (existant.role !== "client") throw new AdresseDejaPrise();
    id = existant.id;
  } else {
    const { data, error } = await avecDelai(
      service.auth.admin.createUser({
        email: client.email,
        email_confirm: true,
        app_metadata: client.demo ? { role: "client", demo: true } : { role: "client" },
      }),
    );
    if (error || !data.user) throw new Error(`Création du compte de connexion impossible : ${error?.message ?? "réponse vide"}`);
    id = data.user.id;
  }

  const { error } = await avecDelai(service.from("ec_clients").update({ auth_user_id: id }).eq("id", client.id));
  if (error) throw new Error(`Rattachement du compte impossible : ${error.message}`);
  return id;
}

/**
 * L'adresse d'un client change : celle de son compte de connexion aussi. Rien
 * ne change si l'adresse nouvelle est déjà celle d'un autre compte.
 */
export async function changerAdresseDuCompte(client: Pick<Client, "auth_user_id">, email: string) {
  if (!client.auth_user_id) return;
  const existant = await compteDeLAdresse(email);
  if (existant && existant.id !== client.auth_user_id) throw new AdresseDejaPrise();
  const service = createServiceClient();
  const { data } = await avecDelai(service.auth.admin.getUserById(client.auth_user_id));
  // On ne modifie qu'un compte de client.
  if (!data?.user || roleDuCompte(data.user.app_metadata) !== "client") return;
  const { error } = await avecDelai(service.auth.admin.updateUserById(client.auth_user_id, { email, email_confirm: true }));
  if (error) throw new Error(`Changement de l'adresse de connexion impossible : ${error.message}`);
}

/** Le jeton d'un lien magique pour ce compte de client — rien n'est envoyé par Supabase. */
export async function jetonDeConnexion(email: string, compte: string): Promise<string> {
  const { data, error } = await avecDelai(createServiceClient().auth.admin.generateLink({ type: "magiclink", email }));
  if (error || !data.properties?.hashed_token) throw new Error(`Émission du lien impossible : ${error?.message ?? "réponse vide"}`);
  // Le lien doit ouvrir exactement le compte vérifié, et rien d'autre.
  if (data.user.id !== compte || roleDuCompte(data.user.app_metadata) !== "client") throw new Error("Le lien émis ne correspond pas au compte du client.");
  return data.properties.hashed_token;
}
