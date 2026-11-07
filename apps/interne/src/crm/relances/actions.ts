"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/crm/lib/auth";
import { q } from "@/crm/lib/db";
import { decider, defRelance, envoyerRelance, listerRelances } from "./moteur";

/*
 * Les gestes de l'onglet Relances : envoyer maintenant, repousser, annuler,
 * réactiver, et régler les règles. Chaque action revérifie que c'est
 * l'équipe (currentUser).
 */

export type Retour = { ok: true; message?: string } | { ok: false; erreur: string };

const rafraichir = () => {
  revalidatePath("/relances");
  revalidatePath("/modeles");
};

export async function envoyerMaintenant(cle: string): Promise<Retour> {
  const u = await currentUser();
  const r = (await listerRelances()).find((x) => x.cle === cle);
  if (!r) return { ok: false, erreur: "Relance introuvable." };
  if (!["avenir", "aujourdhui", "retard"].includes(r.colonne)) return { ok: false, erreur: r.motif ?? "Cette relance ne peut pas partir." };
  const e = await envoyerRelance(r, u.nom);
  rafraichir();
  return e.ok ? { ok: true, message: `${r.libelle} : ${e.libelle}.` } : { ok: false, erreur: `${r.libelle} : ${e.libelle}.` };
}

export async function repousser(cle: string, jours: number): Promise<Retour> {
  const u = await currentUser();
  if (!Number.isInteger(jours) || jours < 1 || jours > 90) return { ok: false, erreur: "Délai invalide." };
  const au = new Date(Date.now() + jours * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  await decider(cle, { statut: "reportee", au }, u.nom);
  rafraichir();
  return { ok: true, message: `Relance repoussée au ${new Date(`${au}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.` };
}

export async function annuler(cle: string): Promise<Retour> {
  const u = await currentUser();
  await decider(cle, { statut: "annulee" }, u.nom);
  rafraichir();
  return { ok: true, message: "Relance annulée : la suite est arrêtée pour ce dossier." };
}

export async function reactiver(cle: string): Promise<Retour> {
  const u = await currentUser();
  await decider(cle, { statut: "reactivee" }, u.nom);
  rafraichir();
  return { ok: true, message: "Relance réactivée." };
}

export async function enregistrerRegle(type: string, r: { actif: boolean; premier_delai_jours: number; intervalle_jours: number; nombre_max: number }): Promise<Retour> {
  const u = await currentUser();
  if (!defRelance(type)) return { ok: false, erreur: "Type de relance inconnu." };
  const entier = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!entier(r.premier_delai_jours, 0, 120) || !entier(r.intervalle_jours, 1, 60) || !entier(r.nombre_max, 1, 6)) {
    return { ok: false, erreur: "Délais de 0 à 120 jours, intervalle de 1 à 60 jours, de 1 à 6 relances." };
  }
  await q("update relances_regles set actif=$2, premier_delai_jours=$3, intervalle_jours=$4, nombre_max=$5, maj_le=now(), maj_par=$6 where type=$1", [
    type, r.actif, r.premier_delai_jours, r.intervalle_jours, r.nombre_max, u.nom,
  ]);
  rafraichir();
  return { ok: true, message: "Règle enregistrée." };
}
