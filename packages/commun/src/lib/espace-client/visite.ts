import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { estDemo } from "./config";
import { avecDelai, depot } from "./depot";
import { salutation } from "./format";
import { conseillerDe, signatureDe } from "./lectures";
import { notifier } from "./notifier";

/*
 * La visite technique entre l'espace client et le CRM (migration 0015) : le
 * pendant de crm.ts pour les créneaux. Comme lui, il ne lit ni n'écrit le
 * schéma crm : il appelle les fonctions de la migration, réservées à la clé
 * de service, qui écrivent dans le CRM sous verrou puis projettent le
 * dossier vers ec_creneaux et ec_visites.
 *
 * Le client, lui, ne lit que ses lignes ec_*, par sa session et la RLS.
 */

const DELAI = 10_000;

async function rpc<T>(fonction: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await avecDelai(createServiceClient().rpc(fonction, params), DELAI, "La base ne répond pas.");
  if (error) throw new Error(error.message);
  return data as T;
}

export type IssueChoix = "reserve" | "pris" | "passe" | "ferme" | "inconnu";

/**
 * Le client choisit un créneau. `clientId` : le client de la session, que le
 * serveur a vérifié ; la fonction de la base le revérifie.
 */
export async function choisirCreneauCrm(creneauId: string, clientId: string): Promise<IssueChoix> {
  if (estDemo()) return "inconnu";
  return rpc<IssueChoix>("ec_choisir_creneau_crm", { p_creneau: creneauId, p_client: clientId });
}

/** Aucun créneau ne convient : la demande est notée dans le CRM (proposition et fil d'activité). */
export async function demanderCreneauxCrm(dossierId: string, clientId: string, message: string): Promise<"demande" | "sans_proposition" | "inconnu"> {
  if (estDemo()) return "inconnu";
  return rpc("ec_demander_creneaux_crm", { p_dossier: dossierId, p_client: clientId, p_message: message });
}

/**
 * Prévient le client que des créneaux l'attendent dans son espace : un
 * e-mail, journalisé (et envoyé seulement avec ESPACE_CLIENT_ENVOI=1). Sans
 * espace client, rien. Ne bloque jamais le CRM.
 */
export async function notifierCreneauxProposes(crmDossierId: number, creneaux: string[]): Promise<"journalisee" | "envoyee" | "echec" | null> {
  if (estDemo()) return null;
  try {
    const { data } = await avecDelai(
      createServiceClient().from("ec_dossiers").select("id, reference, client_id").eq("crm_dossier_id", crmDossierId).maybeSingle(),
      DELAI,
    );
    if (!data) return null;
    const client = await depot().trouver("clients", data.client_id as string);
    if (!client) return null;
    const conseiller = conseillerDe({ ...(await depot().lireDuClient(client.id)) }, client.conseiller_id);
    const n = await notifier.envoyer({
      dossier_id: data.id as string,
      canal: "email",
      modele: "creneaux_visite",
      destinataire: client.email,
      payload: {
        salutation: salutation(client),
        conseiller: `${conseiller.prenom} ${conseiller.nom}`.trim(),
        creneaux,
        chemin: `/espace-client/${data.reference}/visite`,
        signature: signatureDe(conseiller),
      },
    });
    return n.statut;
  } catch (e) {
    console.error("Espace client : e-mail des créneaux de visite impossible", e instanceof Error ? e.message : e);
    return "echec";
  }
}
