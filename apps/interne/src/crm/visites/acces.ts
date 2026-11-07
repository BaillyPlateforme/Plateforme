import "server-only";
import { NextResponse } from "next/server";
import { currentUser, type User } from "@/crm/lib/auth";

/*
 * Qui tient la tablette : un membre de l'équipe, et lui seul. Le proxy le
 * vérifie déjà pour les pages et les routes de l'app ; chaque route de la
 * visite le revérifie ici (session, compte sans rôle, membre actif de
 * team_members), comme les actions du CRM.
 */

/** L'utilisateur du CRM de la session, ou null — pour les routes, qui répondent 401 plutôt que de rediriger. */
export async function equipier(): Promise<User | null> {
  try {
    return await currentUser();
  } catch {
    return null;
  }
}

export const refus = (erreur: string, status: number) => NextResponse.json({ erreur }, { status, headers: { "Cache-Control": "no-store" } });

/** L'identifiant entier d'une adresse (/api/visites/12/…), ou null. */
export function identifiant(v: string) {
  const id = Number(v);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
