"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/auth";
import { q } from "@/crm/lib/db";
import { exigerPorteur } from "./lib/acces";
import { adresseDe, choisirMotDePasse } from "./lib/agents";
import { photoParId, supprimer } from "./lib/photos";
import { DELAI_RETRAIT_MIN, libelleCategorie } from "./regles";

/*
 * Les actions de l'outil terrain, appelées depuis le téléphone. Chacune
 * revérifie la session (exigerPorteur) : le proxy n'est qu'un premier filtre.
 * Elles rendent { erreur } plutôt que de lever : en production, le message
 * d'une exception n'arrive pas jusqu'au navigateur.
 */

type Resultat = { ok: true } | { ok?: false; erreur: string };
const echec = (e: unknown): Resultat => ({ erreur: e instanceof Error ? e.message : "Une erreur est survenue." });

/** L'adresse du compte d'un identifiant : la seule action ouverte sans session (page de connexion). */
export async function adresseDeConnexion(identifiant: string): Promise<string> {
  return adresseDe(String(identifiant ?? "").slice(0, 120));
}

export async function seDeconnecter() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/terrain/connexion");
}

export async function choisirMonMotDePasse(_avant: Resultat | null, form: FormData): Promise<Resultat> {
  try {
    const p = await exigerPorteur();
    if (p.genre !== "agent") return { erreur: "Le mot de passe d'un compte du bureau se change depuis le bureau." };
    const nouveau = String(form.get("nouveau") ?? "");
    if (nouveau !== String(form.get("confirmation") ?? "")) return { erreur: "Les deux saisies ne sont pas identiques." };
    await choisirMotDePasse(p.agent.id, p.agent.authId, nouveau);
    revalidatePath("/terrain");
    return { ok: true };
  } catch (e) {
    return echec(e);
  }
}

/**
 * Retirer une photo qu'on vient d'envoyer (mauvais cadrage, mauvais dossier).
 * Un déménageur ne retire que les siennes, dans les dix minutes ; l'équipe du
 * bureau, n'importe laquelle. Le retrait est noté à l'activité du dossier.
 */
export async function retirerPhoto(id: number): Promise<Resultat> {
  try {
    const p = await exigerPorteur();
    const photo = await photoParId(Number(id));
    if (!photo) return { erreur: "Cette photo n'existe plus." };
    if (p.genre === "agent") {
      if (photo.agentId !== p.agent.id) return { erreur: "Vous ne pouvez retirer que vos propres photos." };
      if (Date.now() - new Date(photo.priseLe).getTime() > DELAI_RETRAIT_MIN * 60_000)
        return { erreur: `Une photo ne se retire que dans les ${DELAI_RETRAIT_MIN} minutes qui suivent l'envoi. Au-delà, demandez au bureau.` };
    }
    const r = await supprimer(photo.id);
    if (r) {
      await q("insert into activite (dossier_id, utilisateur_id, libelle) values ($1, $2, $3)", [
        r.dossierId,
        p.genre === "bureau" ? p.utilisateurId : null,
        `Photo de chantier retirée (${libelleCategorie(r.categorie).toLowerCase()}, envoyée par ${r.auteur}) par ${p.nom}`,
      ]).catch(() => undefined);
    }
    return { ok: true };
  } catch (e) {
    return echec(e);
  }
}
