"use server";

import { revalidatePath } from "next/cache";
import { exigerBureau } from "./lib/acces";
import { changerEquipe, creerAgent, desactiverAgent, reactiverAgent, reinitialiserMotDePasse, type NouvelAgent } from "./lib/agents";

/*
 * Les actions de la page Déménageurs du CRM : créer un compte, le désactiver,
 * le réactiver, réinitialiser son mot de passe, changer son équipe. Réservées
 * à l'équipe du bureau (exigerBureau), revérifiée à chaque appel.
 *
 * Le mot de passe provisoire n'est rendu qu'ici, dans la réponse de l'action :
 * il ne passe ni par la base ni par une page qu'on pourrait recharger.
 */

type Acces = { identifiant: string; motDePasse: string };
type Resultat<T = object> = ({ ok: true } & T) | { ok?: false; erreur: string };
const echec = (e: unknown) => ({ erreur: e instanceof Error ? e.message : "Une erreur est survenue." });
const PAGE = "/partenaires";

export async function creerCompte(saisie: NouvelAgent): Promise<Resultat<Acces>> {
  try {
    const p = await exigerBureau();
    const acces = await creerAgent(saisie, p.nom);
    revalidatePath(PAGE);
    return { ok: true, ...acces };
  } catch (e) {
    return echec(e);
  }
}

export async function reinitialiserCompte(id: number): Promise<Resultat<Acces>> {
  try {
    await exigerBureau();
    const acces = await reinitialiserMotDePasse(Number(id));
    revalidatePath(PAGE);
    return { ok: true, ...acces };
  } catch (e) {
    return echec(e);
  }
}

export async function desactiverCompte(id: number): Promise<Resultat> {
  try {
    await exigerBureau();
    await desactiverAgent(Number(id));
    revalidatePath(PAGE);
    return { ok: true };
  } catch (e) {
    return echec(e);
  }
}

export async function reactiverCompte(id: number): Promise<Resultat> {
  try {
    await exigerBureau();
    await reactiverAgent(Number(id));
    revalidatePath(PAGE);
    return { ok: true };
  } catch (e) {
    return echec(e);
  }
}

export async function modifierEquipe(id: number, equipe: string, interimaire: boolean): Promise<Resultat> {
  try {
    await exigerBureau();
    await changerEquipe(Number(id), String(equipe ?? ""), !!interimaire);
    revalidatePath(PAGE);
    return { ok: true };
  } catch (e) {
    return echec(e);
  }
}
