"use server";

import { currentUser } from "@/crm/lib/auth";
import { listerRelances, type TypeRelance } from "@/crm/relances/moteur";

/*
 * « Relancer le client », sur la fiche d'un espace client : les relances du
 * moteur (crm/relances) qui peuvent partir maintenant pour ce dossier du CRM
 * — conditions de livraison, pièces, devis, solde —, dans cet ordre. Rien ne
 * part ici : l'envoi est le geste « Envoyer maintenant » du Kanban des
 * relances (envoyerMaintenant), que l'écran appelle sur un clic confirmé.
 */

export type RelanceProposee = { cle: string; type: TypeRelance; libelle: string; objet: string; canaux: ("email" | "sms")[]; rang: number; sur: number };

const ORDRE: TypeRelance[] = ["conditions", "pieces", "devis", "solde"];

export async function relancesProposees(crmDossierId: number): Promise<RelanceProposee[]> {
  await currentUser();
  if (!Number.isInteger(crmDossierId)) return [];
  const toutes = await listerRelances().catch(() => []);
  return toutes
    .filter((r) => r.dossierId === crmDossierId && ORDRE.includes(r.type) && ["avenir", "aujourdhui", "retard"].includes(r.colonne) && r.canaux.length > 0)
    .sort((a, b) => ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type))
    .map((r) => ({ cle: r.cle, type: r.type, libelle: r.libelle, objet: r.objet, canaux: r.canaux, rang: r.rang, sur: r.sur }));
}
