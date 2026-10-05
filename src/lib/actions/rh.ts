"use server";

import { redirect } from "next/navigation";
import { changerMotDePasseRh, creerCompteRh, listerComptesRh, supprimerCompteRh, type CompteRh } from "@/lib/rh";
import { createAuthClient, exigerEquipe } from "@/lib/supabase/auth";

type Reponse<T> = ({ ok: true } & T) | { ok: false; erreur: string };
const echec = (e: unknown) => ({ ok: false as const, erreur: e instanceof Error ? e.message : "Erreur inconnue" });

// Les comptes RH se gèrent depuis l'espace équipe, et seulement par elle.

export async function comptesRh(espaceId: string): Promise<Reponse<{ comptes: CompteRh[] }>> {
  try {
    await exigerEquipe();
    return { ok: true, comptes: await listerComptesRh(espaceId) };
  } catch (e) {
    return echec(e);
  }
}

export async function ajouterCompteRh(
  espaceId: string,
  entree: { email: string; nom?: string; motDePasse: string },
): Promise<Reponse<{ compte: CompteRh }>> {
  try {
    await exigerEquipe();
    return { ok: true, compte: await creerCompteRh(espaceId, entree) };
  } catch (e) {
    return echec(e);
  }
}

export async function retirerCompteRh(id: string): Promise<Reponse<object>> {
  try {
    await exigerEquipe();
    await supprimerCompteRh(id);
    return { ok: true };
  } catch (e) {
    return echec(e);
  }
}

export async function nouveauMotDePasseRh(id: string, motDePasse: string): Promise<Reponse<object>> {
  try {
    await exigerEquipe();
    await changerMotDePasseRh(id, motDePasse);
    return { ok: true };
  } catch (e) {
    return echec(e);
  }
}

/** La déconnexion de l'espace RH ramène à sa propre page de connexion. */
export async function quitterEspaceRh() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/rh/connexion");
}
