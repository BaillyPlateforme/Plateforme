import "server-only";
import { createAuthClient } from "@/lib/supabase/auth";
import { roleDuCompte } from "@/lib/supabase/roles";
import { demoEquipeActive } from "./config";
import { avecDelai } from "./depot";

/*
 * Qui est l'équipe, pour l'espace client.
 *
 * D'abord la session Supabase de la plateforme : un compte connecté qui n'est
 * ni un compte RH ni un compte de client. À défaut — et seulement quand le
 * back-office de démonstration est ouvert (données fictives en mémoire, en
 * développement ou sur demande) — l'équipe de démonstration. Un compte RH ou
 * un client n'y a jamais accès, démonstration ou pas.
 */

export type Equipe = { nom: string; demo: boolean };

export async function equipeConnectee(): Promise<Equipe | null> {
  try {
    const supabase = await createAuthClient();
    const { data } = await avecDelai(supabase.auth.getUser(), 5000, "Supabase ne répond pas.");
    const u = data.user;
    if (u) {
      if (roleDuCompte(u.app_metadata) !== "equipe") return null;
      return { nom: u.email ?? "Équipe Bailly", demo: false };
    }
  } catch {
    // Supabase injoignable ou session illisible : on retombe sur la démonstration, si elle est ouverte.
  }
  return demoEquipeActive() ? { nom: "Équipe (démonstration)", demo: true } : null;
}

/** Pour les actions de l'équipe : sans session d'équipe, l'action s'arrête là. */
export async function exigerEquipe(): Promise<Equipe> {
  const e = await equipeConnectee();
  if (!e) throw new Error("Réservé à l'équipe Bailly : reconnectez-vous.");
  return e;
}
