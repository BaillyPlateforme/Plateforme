"use server";

import { createAuthClient } from "@/lib/supabase/auth";
import { roleDuCompte } from "@/lib/supabase/roles";
import { enregistrerSuivi } from "@/lib/suivi";
import type { Suivi } from "@/lib/suivi-commun";

/**
 * Enregistre le suivi d'un lead depuis le tableau.
 *
 * Une action serveur s'appelle de n'importe où : elle vérifie elle-même que
 * l'appelant est un membre de l'équipe, sans se fier au middleware, et qu'il
 * n'est pas un compte RH d'entreprise cliente.
 */
export async function modifierSuivi(
  requestId: string,
  modif: Partial<Pick<Suivi, "statut" | "ca_attente" | "ca_realise" | "priorite" | "note">>,
): Promise<{ suivi?: Suivi; erreur?: string }> {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Ni un compte RH, ni un client de l'espace client : l'équipe seulement.
  if (!user || roleDuCompte(user.app_metadata) !== "equipe") return { erreur: "Session expirée : reconnectez-vous." };
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { erreur: "Demande inconnue" };

  try {
    return { suivi: await enregistrerSuivi(requestId, modif, user.email ?? user.id) };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Enregistrement impossible" };
  }
}
