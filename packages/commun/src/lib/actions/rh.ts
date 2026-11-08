"use server";

import { redirect } from "next/navigation";
import { changerMotDePasseRh, creerCompteRh, listerComptesRh, supprimerCompteRh, type CompteRh } from "@/lib/rh";
import { createAuthClient, exigerEquipe } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { journaliserEquipe } from "@/lib/journal";

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
    // L'adresse du compte, pour le journal des gestes : elle disparaît avec lui.
    const { data } = await createServiceClient().auth.admin.getUserById(id);
    await supprimerCompteRh(id);
    const email = data?.user?.email ?? null;
    const espaceId = (data?.user?.app_metadata as { espace_id?: string } | undefined)?.espace_id ?? null;
    await journaliserEquipe({ action: "compte_rh.supprime", libelle: `Compte RH supprimé${email ? ` : ${email}` : ""}`, objet: { type: "compte_rh", id }, details: { email, espace_id: espaceId } });
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
  await supabase.auth.signOut({ scope: "local" });
  redirect("/rh/connexion");
}
