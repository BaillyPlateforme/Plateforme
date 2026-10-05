"use server";

import { revalidatePath } from "next/cache";
import {
  enregistrerEspace,
  enregistrerLogo,
  enregistrerRegles,
  renouvelerLien,
  retirerLogo,
  supprimerEspace,
} from "@/lib/espaces-pro";
import type { EspacePro, Regles } from "@/lib/espaces";
import { getUser } from "@/lib/supabase/auth";

type Reponse = { ok: true; espace: EspacePro } | { ok: false; erreur: string };

/**
 * Une action serveur répond depuis n'importe quelle adresse du site, y compris
 * les pages publiques : le garde de /dashboard ne suffit pas à la protéger.
 * Ces actions règlent la cote et l'habillage des devis — la session se vérifie ici.
 */
async function exigerEquipe() {
  if (!(await getUser())) throw new Error("Session expirée : reconnectez-vous.");
}

const echec = (e: unknown): Reponse => ({ ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" });

export async function sauverEspace(entree: Partial<EspacePro>): Promise<Reponse> {
  try {
    await exigerEquipe();
    const espace = await enregistrerEspace(entree);
    revalidatePath("/dashboard/espaces-pro");
    return { ok: true, espace };
  } catch (e) {
    return echec(e);
  }
}

/** Les règles générales des grands comptes : elles valent pour tous ceux qui les suivent. */
export async function sauverRegles(
  entree: Partial<Regles>,
): Promise<{ ok: true; regles: Regles } | { ok: false; erreur: string }> {
  try {
    await exigerEquipe();
    const regles = await enregistrerRegles(entree);
    revalidatePath("/dashboard/espaces-pro");
    return { ok: true, regles };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

export async function effacerEspace(id: string): Promise<{ ok: boolean; erreur?: string }> {
  try {
    await exigerEquipe();
    await supprimerEspace(id);
    revalidatePath("/dashboard/espaces-pro");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

/** Un nouveau lien pour l'espace : l'ancien cesse de fonctionner. */
export async function nouveauLien(id: string): Promise<Reponse> {
  try {
    await exigerEquipe();
    const espace = await renouvelerLien(id);
    revalidatePath("/dashboard/espaces-pro");
    return { ok: true, espace };
  } catch (e) {
    return echec(e);
  }
}

/** Le logo arrive dans un formulaire : `id` de l'espace, et le fichier sous `logo`. */
export async function televerserLogo(donnees: FormData): Promise<Reponse> {
  try {
    await exigerEquipe();
    const id = String(donnees.get("id") ?? "");
    const fichier = donnees.get("logo");
    if (!(fichier instanceof File)) throw new Error("Aucun fichier reçu.");
    const espace = await enregistrerLogo(id, {
      type: fichier.type,
      donnees: Buffer.from(await fichier.arrayBuffer()),
    });
    revalidatePath("/dashboard/espaces-pro");
    return { ok: true, espace };
  } catch (e) {
    return echec(e);
  }
}

export async function enleverLogo(id: string): Promise<Reponse> {
  try {
    await exigerEquipe();
    const espace = await retirerLogo(id);
    if (!espace) throw new Error("Espace introuvable.");
    revalidatePath("/dashboard/espaces-pro");
    return { ok: true, espace };
  } catch (e) {
    return echec(e);
  }
}
